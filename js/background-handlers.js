// js/background-handlers.js

import { CollectionStorage } from './storage.js';
import { GoogleDriveSync } from './google-drive-sync.js';
import { getImageHash, getLocalCache, saveLocalCache, getLocalCachesBulk } from './image-cache-helper.js';
import { decrypt } from './encryption-helper.js';

// ドライブからの画像ダウンロード重複を防ぐためのマップ
const driveDownloadPromises = new Map();

// 画像インデックスのインメモリキャッシュ
let cachedImageIndex = null;
let cachedImageIndexTime = 0;
const INDEX_CACHE_TTL = 30000;

/**
 * キャッシュを活用してGoogle Driveから最新の画像インデックスを取得します
 */
async function getImageIndexCached() {
    const now = Date.now();
    if (cachedImageIndex && now - cachedImageIndexTime < INDEX_CACHE_TTL) {
        return cachedImageIndex;
    }

    try {
        const pullResult = await GoogleDriveSync.pullImageIndex();
        if (pullResult && pullResult.data) {
            cachedImageIndex = pullResult.data;
            cachedImageIndexTime = now;
            return cachedImageIndex;
        }
    } catch (err) {
        console.error('Background: Failed to fetch image index from drive:', err);
    }
    
    return cachedImageIndex || { version: 1, images: {} };
}

/**
 * 同期排他ロックの状態をチェックします
 */
async function isSyncLocked() {
    const result = await chrome.storage.local.get('wc_sync_lock');
    return !!result.wc_sync_lock;
}

/**
 * 自動同期をスケジュールします
 */
async function scheduleAutoSync() {
    chrome.alarms.create('deferred-auto-sync-push', { delayInMinutes: 0.5 });
}

/**
 * 実際の同期実行処理
 */
export async function executeAutoSyncPush() {
    console.log('Background: Executing scheduled auto-sync...');
    if (await isSyncLocked()) {
        console.log('Background: Auto-sync push bypassed due to lock');
        return;
    }
    try {
        // 自動同期のため、対話的認証ダイアログは非アクティブ (interactive = false) に設定します
        await GoogleDriveSync.push(CollectionStorage, false, false);
        
        // プッシュ成功時に lastSyncTime を自動更新して保存します
        const settings = await CollectionStorage.getSettings();
        settings.lastSyncTime = Date.now();
        await CollectionStorage.saveSettings(settings);
        
        console.log('Background: Auto-sync success');
    } catch (error) {
        console.error('Background: Auto-sync failed:', error);
    }
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
            response.data = await CollectionStorage.createCollection(message.name);
            if (setupContextMenus) setupContextMenus();
            scheduleAutoSync();
            break;

        case 'deleteCollection':
            await CollectionStorage.deleteCollection(message.id);
            if (setupContextMenus) setupContextMenus();
            scheduleAutoSync();
            break;

        case 'addItem':
            response.data = await CollectionStorage.addItem(message.collectionId, message.item);
            if (setupContextMenus) setupContextMenus();
            scheduleAutoSync();
            break;

        case 'removeItem':
            await CollectionStorage.removeItem(message.collectionId, message.itemId);
            if (setupContextMenus) setupContextMenus();
            scheduleAutoSync();
            break;

        case 'reorderItems':
            await CollectionStorage.reorderItems(message.collectionId, message.itemIds);
            if (setupContextMenus) setupContextMenus();
            scheduleAutoSync();
            break;

        case 'updateCollection':
            await CollectionStorage.updateCollection(message.id, message.updates);
            if (setupContextMenus) setupContextMenus();
            scheduleAutoSync();
            break;

        case 'updateItem':
            response.data = await CollectionStorage.updateItem(message.collectionId, message.itemId, message.updates);
            if (setupContextMenus) setupContextMenus();
            scheduleAutoSync();
            break;

        case 'getItemsByCollection':
            response.data = await CollectionStorage.getItemsByCollection(message.collectionId);
            break;

        case 'exportJson':
            response.data = await CollectionStorage.exportToJson();
            break;

        case 'importJson':
        case 'importFromJson': {
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
            break;
        }

        case 'importCollection':
            await CollectionStorage.importCollectionData(message.data);
            if (setupContextMenus) setupContextMenus();
            break;

        case 'getModifiedCollections':
            response.data = await CollectionStorage.getModifiedCollections(message.since);
            break;

        case 'exportCollection':
            response.data = await CollectionStorage.exportCollection(message.id);
            break;

        case 'getSettings':
            response.data = await CollectionStorage.getSettings();
            break;

        case 'saveLastSyncTime': {
            const settings = await CollectionStorage.getSettings();
            settings.lastSyncTime = message.time;
            await CollectionStorage.saveSettings(settings);
            break;
        }

        case 'saveSettings':
            await CollectionStorage.saveSettings(message.settings);
            scheduleAutoSync();
            break;

        case 'syncPush':
            try {
                if (await isSyncLocked()) {
                    return { success: false, error: 'Sync is locked during migration' };
                }
                const result = await GoogleDriveSync.push(CollectionStorage);
                return { success: true, report: result.report };
            } catch (error) {
                return { success: false, error: error.message };
            }
        
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
            if (driveDownloadPromises.has(hash)) {
                response.data = await driveDownloadPromises.get(hash);
                break;
            }

            const downloadPromise = (async () => {
                let cachedData = null;
                try {
                    const cloudIndex = await getImageIndexCached();
                    let fileId = null;
                    
                    if (cloudIndex && cloudIndex.images && cloudIndex.images[hash]) {
                        fileId = cloudIndex.images[hash].fileId;
                    }
                    
                    if (!fileId) {
                        console.log(`Background: Hash ${hash} not found in index, falling back to search API...`);
                        const file = await GoogleDriveSync.findImageCacheFileByHash(hash);
                        if (file) {
                            fileId = file.id;
                        }
                    }
                    
                    if (fileId) {
                        console.log(`Background: Ondemand downloading image cache from drive using fileId: ${fileId}`);
                        const encryptedData = await GoogleDriveSync.downloadImageCache(fileId);
                        cachedData = await decrypt(encryptedData);
                        await saveLocalCache(hash, cachedData);
                    } else {
                        console.warn(`Background: Image cache file not found in drive for hash: ${hash}`);
                    }
                } catch (driveErr) {
                    console.error('Background: Ondemand image download from drive failed:', driveErr);
                }
                return cachedData;
            })();

            driveDownloadPromises.set(hash, downloadPromise);
            try {
                response.data = await downloadPromise;
            } finally {
                driveDownloadPromises.delete(hash);
            }
            break;
        }

        case 'getImageCache': {
            const hash = await getImageHash(message.url);
            let cachedData = await getLocalCache(hash);
            
            if (!cachedData) {
                try {
                    const file = await GoogleDriveSync.findImageCacheFileByHash(hash);
                    if (file) {
                        console.log(`Background: Ondemand downloading image cache: ${hash}`);
                        const encryptedData = await GoogleDriveSync.downloadImageCache(file.id);
                        cachedData = await decrypt(encryptedData);
                        await saveLocalCache(hash, cachedData);
                    }
                } catch (driveErr) {
                    console.error('Background: Ondemand image download failed:', driveErr);
                }
            }
            
            response.data = cachedData;
            break;
        }

        case 'getImageCachesBulk': {
            const urls = message.urls || [];
            const results = {};
            
            // すべてのURLに対応するハッシュ値を算出
            const hashMap = new Map();
            const hashes = [];
            for (const url of urls) {
                const hash = await getImageHash(url);
                hashMap.set(hash, url);
                hashes.push(hash);
            }
            
            // ローカルキャッシュから一括取得
            const localCaches = await getLocalCachesBulk(hashes);
            
            // キャッシュが見つからなかったハッシュのリスト
            const missingHashes = hashes.filter(hash => !localCaches[hash]);
            
            // URLをキーにした結果マップに変換して返却
            for (const [hash, url] of hashMap.entries()) {
                if (localCaches[hash]) {
                    results[url] = localCaches[hash];
                }
            }
            
            // 即座にレスポンスを返して同期ブロッキングを完全に回避
            response.data = results;
            
            // 不足している画像は非同期にバックグラウンドでダウンロードを実行
            if (missingHashes.length > 0) {
                (async () => {
                    try {
                        const pullResult = await GoogleDriveSync.pullImageIndex();
                        const cloudIndex = pullResult.data;
                        
                        if (cloudIndex && cloudIndex.images) {
                            const downloadTasks = [];
                            for (const hash of missingHashes) {
                                if (cloudIndex.images[hash]) {
                                    downloadTasks.push({ hash, fileId: cloudIndex.images[hash].fileId });
                                }
                            }
                            
                            if (downloadTasks.length > 0) {
                                const maxConcurrency = 3;
                                const queue = [...downloadTasks];
                                const runDownload = async () => {
                                    while (queue.length > 0) {
                                        const item = queue.shift();
                                        try {
                                            console.log(`Background: Non-blocking downloading image cache: ${item.hash}`);
                                            const encryptedData = await GoogleDriveSync.downloadImageCache(item.fileId);
                                            const cachedData = await decrypt(encryptedData);
                                            await saveLocalCache(item.hash, cachedData);
                                        } catch (err) {
                                            console.error(`Background: Non-blocking bulk ondemand download failed for ${item.hash}:`, err);
                                        }
                                    }
                                };
                                
                                const workers = Array(Math.min(maxConcurrency, queue.length)).fill(null).map(runDownload);
                                await Promise.all(workers);
                            }
                        }
                    } catch (driveErr) {
                        console.error('Background: Non-blocking bulk download background task failed:', driveErr);
                    }
                })();
            }
            break;
        }

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

        case 'migrateEncryption': {
            return { success: true };
        }

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
