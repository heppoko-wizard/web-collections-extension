/**
 * background.js - Service Worker (バックグラウンド処理)
 * コンテキストメニュー、メッセージハンドリング、マイグレーションを管理
 */

import { CollectionStorage } from './storage.js';
import { handleMessage } from './background-handlers.js';

// 拡張機能インストール・更新時の初期化
chrome.runtime.onInstalled.addListener(async () => {
    // chrome.storage.local からの自動マイグレーション
    try {
        const migrated = await CollectionStorage.migrateFromChromeStorage();
        if (migrated) {
            console.log('Data migrated from chrome.storage.local to IndexedDB.');
        }
    } catch (error) {
        console.error('Migration failed:', error);
    }

    // 設定のマイグレーション
    try {
        const settingsResult = await chrome.storage.local.get('settings');
        if (settingsResult.settings) {
            await CollectionStorage.saveSettings(settingsResult.settings);
            await chrome.storage.local.remove('settings');
            console.log('Settings migrated to IndexedDB.');
        }
    } catch (error) {
        console.error('Settings migration failed:', error);
    }

    setupContextMenus();
    console.log('Web Collections extension installed');
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
        // パネルを開いて新規作成を促す
        await chrome.storage.session.set({ pendingAction: 'createCollection' });
        await chrome.sidePanel.open({ tabId: tab.id });
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
                title: info.linkUrl,
                sourceUrl: tab.url
            };
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

    chrome.runtime.sendMessage({
        action: 'collectionUpdated',
        collectionId: targetId
    }).catch(() => {});

    await chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
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

console.log('Web Collections background script loaded');
