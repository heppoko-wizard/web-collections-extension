/**
 * background.js - Service Worker (バックグラウンド処理)
 * コンテキストメニュー、メッセージハンドリング、マイグレーションを管理
 */

import { CollectionStorage } from './storage.js';
import { handleMessage, executeAutoSyncPush, executeAutoSyncCycle } from './background-handlers.js';
import { getImageHash, saveLocalCache } from './image-cache-helper.js';
import { GoogleDriveSync } from './google-drive-sync.js';

async function configureSidePanel() {
    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (error) {
        console.warn('Failed to configure side panel action behavior:', error);
    }
}

// 拡張機能インストール・更新時の初期化
chrome.runtime.onInstalled.addListener(async () => {
    await configureSidePanel();
    setupContextMenus();
    setupAlarms();
    console.log('Web Collections extension installed');
});

// ブラウザ起動時のアラームとメニュー登録
chrome.runtime.onStartup.addListener(() => {
    configureSidePanel();
    setupAlarms();
    setupContextMenus();
});

// Service Worker再起動時にもツールバー操作の既定動作を復元する。
configureSidePanel();

// Service Worker再起動時の防御的アラーム再登録
(async () => {
    const existingAlarm = await chrome.alarms.get('auto-sync-polling');
    if (!existingAlarm) {
        setupAlarms();
    }
})();




// 定期実行アラームのセットアップ
function setupAlarms() {
    chrome.alarms.create('auto-sync-polling', {
        periodInMinutes: 1 // 1分ごとにチェック
    });
}

// アラームリスナー
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'auto-sync-polling') {
        executeAutoSyncCycle(setupContextMenus)
            .catch(err => console.warn('Background Alarm: Bidirectional sync failed', err));
    } else if (alarm.name === 'deferred-auto-sync-push') {
        executeAutoSyncPush()
            .catch(err => console.warn('Background Alarm: Auto-push failed', err));
    }
});

let isContextMenusUpdating = false;
let hasPendingContextMenuUpdate = false;

// コンテキストメニューのセットアップ
export async function setupContextMenus() {
    if (isContextMenusUpdating) {
        hasPendingContextMenuUpdate = true;
        return;
    }

    isContextMenusUpdating = true;
    hasPendingContextMenuUpdate = false;

    try {
        await new Promise((resolve) => {
            chrome.contextMenus.removeAll(async () => {
                try {
                    // 親メニュー
                    chrome.contextMenus.create({
                        id: 'add-to-web-collections',
                        title: 'Web Collectionsに追加',
                        contexts: ['all']
                    });

                    // コレクションごとのサブメニュー
                    const collections = await CollectionStorage.getAllCollections();

                    if (collections.length === 0) {
                        chrome.contextMenus.create({
                            parentId: 'add-to-web-collections',
                            id: 'create-new-collection-menu',
                            title: '新しいコレクションを作成...',
                            contexts: ['all']
                        });
                    } else {
                        collections.forEach(collection => {
                            chrome.contextMenus.create({
                                parentId: 'add-to-web-collections',
                                id: `collection-${collection.id}`,
                                title: collection.name,
                                contexts: ['all']
                            });
                        });
                    }
                } catch (innerError) {
                    console.warn('Error inside contextMenus.removeAll callback:', innerError);
                } finally {
                    resolve();
                }
            });
        });
    } catch (error) {
        console.warn('Error during setupContextMenus:', error);
    } finally {
        isContextMenusUpdating = false;
        if (hasPendingContextMenuUpdate) {
            setupContextMenus();
        }
    }
}

// コンテキストメニュークリック時の処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    let targetCollectionId = null;
    if (info.menuItemId.startsWith('collection-')) {
        targetCollectionId = info.menuItemId.replace('collection-', '');
    } else if (info.menuItemId === 'create-new-collection-menu') {
        // 先にパネルを開く（ユーザージェスチャーを消費するため、awaitによる遅延を避ける）
        chrome.sidePanel.open({ tabId: tab.id });
        // インテントを非同期で保存（こちらは完了を待たなくて良い）
        chrome.storage.session.set({ pendingAction: 'createCollection' });
        return;
    } else {
        return;
    }

    let itemData = null;

    if (info.mediaType === 'image') {
        itemData = {
            type: 'image',
            imageUrl: info.srcUrl,
            url: info.linkUrl || tab.url,
            sourceUrl: tab.url,
            title: tab.title
        };
        if (info.linkUrl) {
            itemData.title = await fetchPageTitle(info.linkUrl, tab.title);
        }

        // 同一オリジンの元のWebページ上で画像をリサイズしてキャッシュを作成
        if (tab && tab.id) {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: async (imageUrl, maxDimension) => {
                        return new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                let width = img.width;
                                let height = img.height;
                                if (width > height) {
                                    if (width > maxDimension) {
                                        height = Math.round((height * maxDimension) / width);
                                        width = maxDimension;
                                    }
                                } else {
                                    if (height > maxDimension) {
                                        width = Math.round((width * maxDimension) / height);
                                        height = maxDimension;
                                    }
                                }
                                canvas.width = width;
                                canvas.height = height;
                                ctx.drawImage(img, 0, 0, width, height);
                                try {
                                    resolve(canvas.toDataURL('image/webp', 0.7));
                                } catch (e) {
                                    try {
                                        resolve(canvas.toDataURL('image/jpeg', 0.7));
                                    } catch (err) {
                                        resolve(null);
                                    }
                                }
                            };
                            img.onerror = () => resolve(null);
                            img.src = imageUrl;
                        });
                    },
                    args: [info.srcUrl, 320]
                });

                const resizedDataUrl = results?.[0]?.result;
                if (resizedDataUrl) {
                    const hash = await getImageHash(info.srcUrl);
                    await saveLocalCache(hash, resizedDataUrl);
                    GoogleDriveSync.uploadImageOnRegistration(hash, resizedDataUrl, info.srcUrl);
                    console.log('Background: Successfully pre-cached image on host tab:', info.srcUrl);
                }
            } catch (scriptErr) {
                console.warn('Background: Failed to generate pre-cache via executeScript:', scriptErr);
            }
        }
    } else if (info.selectionText) {
        itemData = {
            type: 'text',
            content: info.selectionText,
            sourceUrl: tab.url,
            sourceTitle: tab.title
        };
    } else {
        if (info.linkUrl) {
            itemData = {
                type: 'webpage',
                url: info.linkUrl,
                title: tab.title,
                sourceUrl: tab.url
            };
            itemData.title = await fetchPageTitle(info.linkUrl, tab.title);
        } else {
            itemData = {
                type: 'webpage',
                url: tab.url,
                title: tab.title,
                faviconUrl: tab.favIconUrl || ''
            };
        }
    }

    if (itemData) {
        await handleAddItem(itemData, tab, targetCollectionId);
    }
});

// アイテム追加ハンドラ
async function handleAddItem(itemData, tab, collectionId = null) {
    let targetId = collectionId;

    if (!targetId) {
        let collections = await CollectionStorage.getAllCollections();
        if (collections.length === 0) {
            await CollectionStorage.createCollection('マイコレクション');
            collections = await CollectionStorage.getAllCollections();
        }
        targetId = collections[0].id;
    }

    await CollectionStorage.addItem(targetId, itemData);
    await setupContextMenus(); // メニューを再構築してソート順（最新を上）を反映

    chrome.runtime.sendMessage({
        action: 'collectionUpdated',
        collectionId: targetId
    }).catch(() => {});

    try {
        await chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
        await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    } catch (badgeErr) {
        console.warn('Failed to set badge text:', badgeErr);
    }

    // Ensure background sync is triggered
    handleMessage({ action: 'autoSyncPush' }).catch(err =>
        console.warn('Background: Post-add auto-sync push failed:', err)
    );

    setTimeout(async () => {
        try {
            await chrome.action.setBadgeText({ text: '', tabId: tab.id });
        } catch (badgeErr) {
            // タブが既に閉じられている場合のエラーを安全に無視します
        }
    }, 2000);
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, setupContextMenus)
        .then(response => sendResponse(response))
        .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
});

/**
 * 取得したタイトルがドメイン名のみ、あるいは無効な仮タイトルであるかを判定する
 */
function isDomainOnlyTitle(fetchedTitle, url) {
    if (!fetchedTitle) return true;

    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        const domainParts = hostname.split('.');
        const mainDomain = domainParts[domainParts.length - 2] || hostname;

        // タイトルとホスト名から記号や空白を除去して小文字化
        const cleanTitle = fetchedTitle.replace(/[\s|:\-_.]/g, '').toLowerCase();
        const cleanHostname = hostname.replace(/[\s|:\-_.]/g, '').toLowerCase();

        // 1. 正規化したタイトルが正規化したホスト名と一致する場合
        if (cleanTitle === cleanHostname) return true;

        // 2. 正規化したタイトルがメインドメイン名と一致する場合
        if (cleanTitle === mainDomain) return true;

        // 3. タイトルが空文字、または典型的な仮タイトルである場合
        if (cleanTitle === '' || cleanTitle === 'loading') return true;

    } catch (error) {
        console.warn('Error in domain title verification:', error);
    }
    return false;
}

/**
 * URLの最後のスラッシュから .html の間の文字列を抽出してデコードする
 */
function extractTitleFromUrl(url) {
    try {
        const cleanUrl = url.split('#')[0].split('?')[0];
        const lastSlash = cleanUrl.lastIndexOf('/');
        const htmlIndex = cleanUrl.indexOf('.html', lastSlash);

        if (lastSlash !== -1 && htmlIndex !== -1 && htmlIndex > lastSlash) {
            const rawTitle = cleanUrl.substring(lastSlash + 1, htmlIndex);
            if (rawTitle) {
                return decodeURIComponent(rawTitle);
            }
        }
    } catch (error) {
        console.warn('Failed to extract title from URL:', error);
    }
    return null;
}

/**
 * リンク先のWebページタイトルを非同期でフェッチして抽出する
 */
async function fetchPageTitle(url, fallbackTitle) {
    let title = null;

    // 1. 従来通りHTMLのフェッチによるタイトル取得を試みる
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const html = await response.text();
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                title = decodeHtmlEntities(titleMatch[1].trim());
            }
        }
    } catch (error) {
        console.warn('Failed to fetch page title via HTTP:', error);
    }

    // 2. 有効なタイトルが得られた場合はそれを返す
    if (title && !isDomainOnlyTitle(title, url)) {
        return title;
    }

    // 3. URLから抽出（有効なタイトルが得られなかった場合のみ）
    const urlTitle = extractTitleFromUrl(url);
    if (urlTitle) {
        return urlTitle;
    }

    // 4. すべての方法でタイトルが取得できない場合はフォールバック値を返す
    return title || fallbackTitle;
}

/**
 * 簡易的なHTMLエンティティのデコード
 */
function decodeHtmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#x27;/g, "'");
}

console.log('Web Collections background script loaded');
