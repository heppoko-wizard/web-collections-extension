/**
 * background.js - Service Worker (バックグラウンド処理)
 * コンテキストメニュー、メッセージハンドリング、マイグレーションを管理
 */

import { CollectionStorage } from './storage.js';
import { handleMessage, executeAutoSyncPush } from './background-handlers.js';
import { BookmarkSync } from './bookmark-sync.js';

// 拡張機能インストール・更新時の初期化
chrome.runtime.onInstalled.addListener(async () => {
    setupContextMenus();
    setupAlarms();
    setupBookmarkListeners();
    console.log('Web Collections extension installed');
});

// ブックマークイベントの監視
function setupBookmarkListeners() {
    const triggerSync = () => {
        handleMessage({ action: 'autoSyncPull' })
            .catch(err => console.warn('Bookmark Watcher: Sync failed', err));
    };

    const triggerSyncOnMove = async (id, moveInfo) => {
        await handleBookmarkMoved(id, moveInfo);
        triggerSync();
    };

    chrome.bookmarks.onCreated.addListener(triggerSync);
    chrome.bookmarks.onChanged.addListener(triggerSync);
    chrome.bookmarks.onMoved.addListener(triggerSyncOnMove);
    chrome.bookmarks.onRemoved.addListener(triggerSync);
}

// ブックマーク移動時の並べ替え検知とメタデータ更新
async function handleBookmarkMoved(id, moveInfo) {
    try {
        // 親フォルダの情報を取得
        const parent = (await chrome.bookmarks.get(moveInfo.parentId))[0];
        
        // コレクションフォルダ（[WC]で始まる）の配下で移動された場合のみ処理
        if (parent.title.startsWith('[WC]')) {
            const meta = BookmarkSync.decodeMetadata(parent);
            if (meta) {
                // 更新日時を現在時刻にした新しいタイトルを作成
                const updatedMetaCol = {
                    id: meta.id,
                    updatedAt: Date.now(),
                    memo: meta.memo || ''
                };
                const newTitle = BookmarkSync.encodeMetadata(updatedMetaCol, meta.title);
                
                // ブックマークフォルダのタイトルを更新（これによって updatedAt が更新される）
                await chrome.bookmarks.update(moveInfo.parentId, { title: newTitle });
                console.log('Background Bookmark Watcher: Updated parent collection updatedAt due to move event.');
            }
        }
    } catch (error) {
        console.warn('Background Bookmark Watcher: Failed to handle move event', error);
    }
}


// 定期実行アラームのセットアップ
function setupAlarms() {
    chrome.alarms.create('auto-sync-polling', {
        periodInMinutes: 1 // 1分ごとにチェック
    });
}

// アラームリスナー
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'auto-sync-polling') {
        handleMessage({ action: 'autoSyncPull' })
            .catch(err => console.warn('Background Alarm: Sync failed', err));
    } else if (alarm.name === 'deferred-auto-sync-push') {
        executeAutoSyncPush()
            .catch(err => console.warn('Background Alarm: Auto-push failed', err));
    }
});

// コンテキストメニューのセットアップ
export async function setupContextMenus() {
    chrome.contextMenus.removeAll(async () => {
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
    });
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

    await chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

    // Ensure background sync is triggered
    handleMessage({ action: 'autoSyncPush' });

    setTimeout(async () => {
        await chrome.action.setBadgeText({ text: '', tabId: tab.id });
    }, 2000);
}

// アクションボタンクリック時
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, setupContextMenus)
        .then(response => sendResponse(response))
        .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
});

/**
 * リンク先のWebページタイトルを非同期でフェッチして抽出する
 */
async function fetchPageTitle(url, fallbackTitle) {
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

        if (!response.ok) return fallbackTitle;

        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            return decodeHtmlEntities(titleMatch[1].trim());
        }
    } catch (error) {
        console.warn('Failed to fetch page title:', error);
    }
    return fallbackTitle;
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
