// js/background-handlers.js

import { CollectionStorage } from './storage.js';
import { GoogleDriveSync } from './google-drive-sync.js';
import { getImageHash, getLocalCache, saveLocalCache, getLocalCachesBulk } from './image-cache-helper.js';
import { decrypt } from './encryption-helper.js';

// ドライブからの画像ダウンロード重複を防ぐためのマップ
const driveDownloadPromises = new Map();
const MAX_CONCURRENT_DRIVE_IMAGE_DOWNLOADS = 4;
const driveImageTaskQueue = [];
let activeDriveImageDownloads = 0;

// 画像インデックスのインメモリキャッシュ
let cachedImageIndex = null;
let cachedImageIndexTime = 0;
let imageIndexFetchPromise = null;
const INDEX_CACHE_TTL = 30000;

function drainDriveImageTaskQueue() {
    while (
        activeDriveImageDownloads < MAX_CONCURRENT_DRIVE_IMAGE_DOWNLOADS &&
        driveImageTaskQueue.length > 0
    ) {
        const { task, resolve, reject } = driveImageTaskQueue.shift();
        activeDriveImageDownloads += 1;
        Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
                activeDriveImageDownloads -= 1;
                drainDriveImageTaskQueue();
            });
    }
}

function scheduleDriveImageTask(task) {
    return new Promise((resolve, reject) => {
        driveImageTaskQueue.push({ task, resolve, reject });
        drainDriveImageTaskQueue();
    });
}

/**
 * キャッシュを活用してGoogle Driveから最新の画像インデックスを取得します。
 * 同時要求は一つのネットワーク取得へまとめる。
 */
async function getImageIndexCached() {
    const now = Date.now();
    if (cachedImageIndex && now - cachedImageIndexTime < INDEX_CACHE_TTL) {
        return cachedImageIndex;
    }
    if (imageIndexFetchPromise) return imageIndexFetchPromise;

    imageIndexFetchPromise = (async () => {
        try {
            const pullResult = await GoogleDriveSync.pullImageIndex(false);
            if (pullResult && pullResult.data) {
                cachedImageIndex = pullResult.data;
                cachedImageIndexTime = Date.now();
            }
        } catch (err) {
            console.error('Background: Failed to fetch image index from drive:', err);
        }
        return cachedImageIndex || { version: 1, images: {} };
    })();

    try {
        return await imageIndexFetchPromise;
    } finally {
        imageIndexFetchPromise = null;
    }
}

async function downloadDriveImageByHash(hash, fileId) {
    if (!hash || !fileId) return null;
    if (driveDownloadPromises.has(hash)) {
        return driveDownloadPromises.get(hash);
    }

    const promise = scheduleDriveImageTask(async () => {
        const encryptedData = await GoogleDriveSync.downloadImageCache(fileId, false);
        const cachedData = await decrypt(encryptedData);
        await saveLocalCache(hash, cachedData);
        chrome.runtime.sendMessage({
            action: 'imageDownloaded',
            hash,
            dataUrl: cachedData
        }).catch(() => {});
        return cachedData;
    });

    driveDownloadPromises.set(hash, promise);
    try {
        return await promise;
    } finally {
        driveDownloadPromises.delete(hash);
    }
}

async function resolveAndDownloadDriveImage(hash, allowSearchFallback = true) {
    const cloudIndex = await getImageIndexCached();
    let fileId = cloudIndex?.images?.[hash]?.fileId || null;

    if (!fileId && allowSearchFallback) {
        const file = await GoogleDriveSync.findImageCacheFileByHash(hash, false);
        fileId = file?.id || null;
    }

    return fileId ? downloadDriveImageByHash(hash, fileId) : null;
}

async function prefetchDriveImages(entries) {
    const uniqueEntries = Array.from(new Map(
        (entries || [])
            .filter(entry => entry?.hash)
            .map(entry => [entry.hash, entry])
    ).values());
    if (uniqueEntries.length === 0) return;

    const hashes = uniqueEntries.map(entry => entry.hash);
    const localCaches = await getLocalCachesBulk(hashes);
    const missingEntries = uniqueEntries.filter(entry => !localCaches[entry.hash]);
    if (missingEntries.length === 0) return;

    const cloudIndex = await getImageIndexCached();
    await Promise.allSettled(missingEntries.map(async entry => {
        let fileId = cloudIndex?.images?.[entry.hash]?.fileId || null;
        if (!fileId && entry.url?.startsWith('local-cache://')) {
            const file = await GoogleDriveSync.findImageCacheFileByHash(entry.hash, false);
            fileId = file?.id || null;
        }
        if (fileId) await downloadDriveImageByHash(entry.hash, fileId);
    }));
}

/**
 * 同期排他ロックの状態をチェックします
 */
async function isSyncLocked() {
    const result = await chrome.storage.local.get('wc_sync_lock');
    const lock = result.wc_sync_lock;
    if (!lock) return false;
    
    if (lock === true) {
        await chrome.storage.local.remove('wc_sync_lock');
        return false;
    }
    
    // 5分以上経過したロックは無効とみなす
    const LOCK_TIMEOUT = 5 * 60 * 1000;
    if (Date.now() - lock.timestamp > LOCK_TIMEOUT) {
        await chrome.storage.local.remove('wc_sync_lock');
        console.warn('Background: Stale sync lock released.');
        return false;
    }
    return true;
}

let dataOperationQueue = Promise.resolve();
let pendingDataOperationCount = 0;

/**
 * wc_collections と同期メタデータを扱う処理を一列に並べる。
 * 自動同期だけは、別処理が実行中なら重ねずにスキップする。
 */
function runDataExclusive(task, skipIfBusy = false) {
    if (skipIfBusy && pendingDataOperationCount > 0) {
        return Promise.resolve({ success: true, updated: false, skipped: true });
    }

    pendingDataOperationCount += 1;
    const result = dataOperationQueue.then(task, task);
    dataOperationQueue = result.then(() => undefined, () => undefined);

    return result.finally(() => {
        pendingDataOperationCount -= 1;
    });
}

export function executeDataMutation(task) {
    return runDataExclusive(task);
}

/**
 * 自動同期をスケジュールします
 */
async function scheduleAutoSync() {
    chrome.alarms.create('deferred-auto-sync-push', { delayInMinutes: 0.5 });
}

async function performAutoSyncPush() {
    console.log('Background: Executing scheduled auto-sync...');
    if (await isSyncLocked()) {
        console.log('Background: Auto-sync push bypassed due to lock');
        return { success: true, skipped: true };
    }

    try {
        // 自動同期のため、対話的認証ダイアログは非アクティブ (interactive = false) に設定します
        await GoogleDriveSync.push(CollectionStorage, false, false);

        // プッシュ成功時に lastSyncTime を自動更新して保存します
        const settings = await CollectionStorage.getSettings();
        settings.lastSyncTime = Date.now();
        await CollectionStorage.saveSettings(settings);

        console.log('Background: Auto-sync success');
        return { success: true };
    } catch (error) {
        console.error('Background: Auto-sync failed:', error);
        if (error.message && (
            error.message.includes('not signed in') ||
            error.message.includes('OAuth2') ||
            error.message.includes('auth') ||
            error.message.includes('authentication')
        )) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#FF5252' });
        }
        return { success: false, error: error.message };
    }
}

/**
 * 予約されたPushを、他の同期処理と重複させずに実行する。
 */
export async function executeAutoSyncPush() {
    return runDataExclusive(performAutoSyncPush, true);
}

/**
 * 定期同期のPushとPullを一つの排他区間で実行する。
 */
export async function executeAutoSyncCycle(setupContextMenus) {
    return runDataExclusive(async () => {
        if (await isSyncLocked()) {
            return { success: true, updated: false, skipped: true };
        }

        const pullResult = await GoogleDriveSync.pull(CollectionStorage, false);
        if (!pullResult.success) return pullResult;

        const pushResult = await performAutoSyncPush();
        if (pullResult.updated && setupContextMenus) {
            setupContextMenus();
        }
        return pushResult;
    }, true);
}

/**
 * メッセージを処理し、適切なアクションを実行します
 */
export async function handleMessage(message, setupContextMenus) {
    let response = { success: true };

    switch (message.action) {
        case 'getBookmarkFolders':
            response.data = await getBookmarkFolders();
            break;

        case 'getCollections':
            response.data = await CollectionStorage.getAllCollections(message.includeDeleted);
            break;

        case 'createCollection':
            return runDataExclusive(async () => {
                response.data = await CollectionStorage.createCollection(message.name);
                if (setupContextMenus) setupContextMenus();
                scheduleAutoSync();
                return response;
            });

        case 'deleteCollection':
            return runDataExclusive(async () => {
                await CollectionStorage.deleteCollection(message.id);
                if (setupContextMenus) setupContextMenus();
                scheduleAutoSync();
                return response;
            });

        case 'addItem':
            return runDataExclusive(async () => {
                response.data = await CollectionStorage.addItem(message.collectionId, message.item);
                if (setupContextMenus) setupContextMenus();
                scheduleAutoSync();
                return response;
            });

        case 'removeItem':
            return runDataExclusive(async () => {
                await CollectionStorage.removeItem(message.collectionId, message.itemId);
                if (setupContextMenus) setupContextMenus();
                scheduleAutoSync();
                return response;
            });

        case 'updateCollection':
            return runDataExclusive(async () => {
                await CollectionStorage.updateCollection(message.id, message.updates);
                if (setupContextMenus) setupContextMenus();
                scheduleAutoSync();
                return response;
            });

        case 'updateItem':
            return runDataExclusive(async () => {
                response.data = await CollectionStorage.updateItem(message.collectionId, message.itemId, message.updates);
                if (setupContextMenus) setupContextMenus();
                scheduleAutoSync();
                return response;
            });

        case 'getItemsByCollection':
            response.data = await CollectionStorage.getItemsByCollection(message.collectionId);
            break;

        case 'exportJson':
            response.data = await CollectionStorage.exportToJson();
            break;

        case 'importJson':
        case 'importFromJson': {
            return runDataExclusive(async () => {
                await CollectionStorage.importFromJson(message.data);

                // インポートされた過去データを確実に同期するため、lastSyncTime を一時的にリセットします
                const settings = await CollectionStorage.getSettings();
                const originalLastSyncTime = settings.lastSyncTime;
                settings.lastSyncTime = 0;
                await CollectionStorage.saveSettings(settings);

                try {
                    // 強制的に全件プッシュ同期を実行して即時アップロードを行います
                    await GoogleDriveSync.push(CollectionStorage, true);

                    // 成功したら、最終同期時刻を現在時刻に更新します
                    const updatedSettings = await CollectionStorage.getSettings();
                    updatedSettings.lastSyncTime = Date.now();
                    await CollectionStorage.saveSettings(updatedSettings);
                } catch (syncError) {
                    console.error('Immediate sync push after import failed:', syncError);
                    // 同期エラーが発生した場合は元の lastSyncTime に戻して次回リトライ可能にします
                    const rollbackSettings = await CollectionStorage.getSettings();
                    rollbackSettings.lastSyncTime = originalLastSyncTime;
                    await CollectionStorage.saveSettings(rollbackSettings);
                    throw syncError;
                }

                if (setupContextMenus) setupContextMenus();
                return response;
            });
        }

        case 'importCollection':
            return runDataExclusive(async () => {
                await CollectionStorage.importCollectionData(message.data);
                if (setupContextMenus) setupContextMenus();
                return response;
            });

        case 'getModifiedCollections':
            response.data = await CollectionStorage.getModifiedCollections(message.since);
            break;

        case 'exportCollection':
            response.data = await CollectionStorage.exportCollection(message.id);
            break;

        case 'getSettings':
            response.data = await CollectionStorage.getSettings();
            break;

        case 'saveLastSyncTime':
            return runDataExclusive(async () => {
                const settings = await CollectionStorage.getSettings();
                settings.lastSyncTime = message.time;
                await CollectionStorage.saveSettings(settings);
                return response;
            });

        case 'saveSettings':
            return runDataExclusive(async () => {
                await CollectionStorage.saveSettings(message.settings);
                scheduleAutoSync();
                return response;
            });

        case 'syncPush':
            return runDataExclusive(async () => {
                try {
                    if (await isSyncLocked()) {
                        return { success: false, error: 'Sync is locked during migration' };
                    }
                    const result = await GoogleDriveSync.push(CollectionStorage);
                    return { success: true, report: result.report };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            });

        case 'syncNow':
            return runDataExclusive(async () => {
                try {
                    if (await isSyncLocked()) {
                        return { success: false, error: 'Sync is locked during migration' };
                    }

                    const pullResult = await GoogleDriveSync.pull(CollectionStorage, true);
                    const pushResult = await GoogleDriveSync.push(CollectionStorage, false, true);

                    const settings = await CollectionStorage.getSettings();
                    settings.lastSyncTime = Date.now();
                    await CollectionStorage.saveSettings(settings);

                    if (pullResult.updated && setupContextMenus) {
                        setupContextMenus();
                    }

                    return {
                        success: true,
                        pullReport: pullResult.report || {},
                        pushReport: pushResult.report || {}
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            });
        
        case 'rebuildImageIndex': {
            try {
                const rebuildResult = await GoogleDriveSync.rebuildImageIndex(true);
                response.success = rebuildResult.success;
                response.rebuiltCount = rebuildResult.rebuiltCount;
            } catch (err) {
                response.success = false;
                response.error = err.message;
            }
            break;
        }

        case 'downloadAllImageCaches': {
            // 非同期でダウンロードを開始し、呼び出し元には即座に成功を返してブロッキングを防ぐ
            (async () => {
                try {
                    await GoogleDriveSync.downloadAllImageCaches((detail) => {
                        chrome.runtime.sendMessage({
                            action: 'downloadProgress',
                            detail
                        }).catch(() => {
                            // 受信側（サイドパネルなど）が閉じられている場合のエラーを無視
                        });
                    }, true);
                } catch (err) {
                    console.error('Background: Bulk image cache download task failed:', err);
                    chrome.runtime.sendMessage({
                        action: 'downloadProgress',
                        detail: { status: 'error', error: err.message }
                    }).catch(() => {});
                }
            })();
            break;
        }

        case 'getLocalCache': {
            response.data = await getLocalCache(message.hash);
            break;
        }

        case 'getImageCacheFromDrive': {
            const hash = message.hash;
            response.data = await getLocalCache(hash);
            if (!response.data) {
                try {
                    response.data = await resolveAndDownloadDriveImage(hash, true);
                } catch (driveErr) {
                    console.error('Background: Ondemand image download from drive failed:', driveErr);
                    response.data = null;
                }
            }
            break;
        }

        case 'getImageCache': {
            const hash = await getImageHash(message.url);
            response.data = await getLocalCache(hash);
            if (!response.data) {
                try {
                    response.data = await resolveAndDownloadDriveImage(hash, true);
                } catch (driveErr) {
                    console.error('Background: Ondemand image download failed:', driveErr);
                    response.data = null;
                }
            }
            break;
        }

        case 'getImageCachesBulk': {
            const entries = await Promise.all((message.urls || []).map(async url => ({
                url,
                hash: await getImageHash(url)
            })));
            const localCaches = await getLocalCachesBulk(entries.map(entry => entry.hash));
            const results = {};
            for (const entry of entries) {
                if (localCaches[entry.hash]) results[entry.url] = localCaches[entry.hash];
            }
            response.data = results;
            prefetchDriveImages(entries).catch(err => {
                console.error('Background: Bulk image prefetch failed:', err);
            });
            break;
        }

        case 'prefetchImageCachesFromDrive':
            prefetchDriveImages(message.entries || []).catch(err => {
                console.error('Background: Image prefetch failed:', err);
            });
            break;

        case 'saveImageCache': {
            const hash = await getImageHash(message.url);
            await saveLocalCache(hash, message.dataUrl);
            GoogleDriveSync.uploadImageOnRegistration(hash, message.dataUrl, message.url);
            break;
        }

        case 'autoSyncPush':
            scheduleAutoSync();
            break;

        case 'autoSyncPull':
            return runDataExclusive(async () => {
                try {
                    if (await isSyncLocked()) {
                        console.log('Background: Auto-sync pull bypassed due to lock');
                        return { success: true, updated: false };
                    }
                    const interactive = message.interactive !== false;
                    const result = await GoogleDriveSync.pull(CollectionStorage, interactive);
                    if (result.success && result.updated && setupContextMenus) {
                        setupContextMenus();
                    }
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            });



        default:
            return { success: false, error: 'Unknown action: ' + message.action };
    }

    return response;
}

/**
 * ブックマークフォルダを階層パス付きで再帰的に取得します
 */
async function getBookmarkFolders() {
    if (!chrome.bookmarks) {
        throw new Error('Bookmarks API is not available. Please reload the extension.');
    }
    const tree = await chrome.bookmarks.getTree();
    const folders = [];
    
    function traverse(node, path = '') {
        if (!node.url) {
            let nextPath = path;
            if (node.id !== '0') {
                let title = node.title;
                if (node.id === '1') title = 'お気に入りバー';
                if (node.id === '2') title = 'その他のブックマーク';
                if (node.id === '3') title = 'モバイルのブックマーク';
                
                nextPath = path ? `${path} / ${title}` : title;
                folders.push({
                    id: node.id,
                    title: nextPath
                });
            }
            
            if (node.children) {
                node.children.forEach(child => traverse(child, nextPath));
            }
        }
    }
    
    tree.forEach(node => traverse(node));
    return folders;
}
