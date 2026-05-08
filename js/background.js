/**
 * background.js - Service Worker (バックグラウンド処理)
 * コンテキストメニュー、メッセージハンドリング、マイグレーションを管理
 */

// ライブラリをインポート
importScripts('./crypto-utils.js', './storage.js', './image-processor.js');

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
async function setupContextMenus() {
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
            // コレクションがない場合は「新しいコレクション」などの案内
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
    // コレクションIDの特定
    let targetCollectionId = null;
    if (info.menuItemId.startsWith('collection-')) {
        targetCollectionId = info.menuItemId.replace('collection-', '');
    } else if (info.menuItemId === 'create-new-collection-menu') {
        // パネルを開いて新規作成を促す
        await chrome.sidePanel.open({ tabId: tab.id });
        return;
    } else {
        return; // 知らないメニューID
    }

    let itemData = null;

    // コンテンツタイプの自動判別
    if (info.mediaType === 'image') {
        // 画像として追加
        itemData = {
            type: 'image',
            imageUrl: info.srcUrl,
            url: info.linkUrl || tab.url,
            sourceUrl: tab.url,
            title: tab.title
        };
    } else if (info.selectionText) {
        // テキストとして追加
        itemData = {
            type: 'text',
            content: info.selectionText,
            sourceUrl: tab.url,
            sourceTitle: tab.title
        };
    } else {
        // ページ/リンクとして追加
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

    // ID指定がない場合（あるいはエラー時）はデフォルト（最初のコレクション）を使用
    if (!targetId) {
        let collections = await CollectionStorage.getAllCollections();
        if (collections.length === 0) {
            await CollectionStorage.createCollection('マイコレクション');
            collections = await CollectionStorage.getAllCollections();
        }
        targetId = collections[0].id;
    }

    await CollectionStorage.addItem(targetId, itemData);

    // サイドパネルに通知（もし開いていれば更新させるため）
    chrome.runtime.sendMessage({
        action: 'collectionUpdated',
        collectionId: targetId
    }).catch(() => {
        // パネルが閉じていて受信できない場合は無視
    });

    // 成功バッジ表示
    await chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    setTimeout(async () => {
        await chrome.action.setBadgeText({ text: '', tabId: tab.id });
    }, 2000);
}

// アクションボタンクリック時（サイドパネル開閉）
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
});

// メッセージリスナー（パネルからのリクエスト処理）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            switch (message.action) {
                case 'getCollections':
                    sendResponse({ success: true, data: await CollectionStorage.getAllCollections(message.includeDeleted) });
                    break;

                case 'createCollection':
                    const newCol = await CollectionStorage.createCollection(message.name);
                    setupContextMenus(); // メニュー更新
                    sendResponse({ success: true, data: newCol });
                    break;

                case 'deleteCollection':
                    await CollectionStorage.deleteCollection(message.id);
                    setupContextMenus(); // メニュー更新
                    sendResponse({ success: true });
                    break;

                case 'addItem':
                    sendResponse({ success: true, data: await CollectionStorage.addItem(message.collectionId, message.item) });
                    break;

                case 'removeItem':
                    await CollectionStorage.removeItem(message.collectionId, message.itemId);
                    sendResponse({ success: true });
                    break;

                case 'reorderItems':
                    await CollectionStorage.reorderItems(message.collectionId, message.itemIds);
                    sendResponse({ success: true });
                    break;

                case 'updateCollection':
                    await CollectionStorage.updateCollection(message.id, message.updates);
                    sendResponse({ success: true });
                    break;

                case 'updateItem':
                    const updatedItem = await CollectionStorage.updateItem(message.collectionId, message.itemId, message.updates);
                    sendResponse({ success: true, data: updatedItem });
                    break;

                case 'getItemsByCollection':
                    sendResponse({ success: true, data: await CollectionStorage.getItemsByCollection(message.collectionId) });
                    break;

                case 'exportJson':
                    sendResponse({ success: true, data: await CollectionStorage.exportToJson() });
                    break;

                case 'importJson':
                    await CollectionStorage.importFromJson(message.data);
                    sendResponse({ success: true });
                    break;

                case 'importCollection':
                    const data = message.data;
                    const db = await CollectionStorage.openDB();
                    const tx = db.transaction(['collections', 'items'], 'readwrite');
                    const collectionStore = tx.objectStore('collections');
                    const itemStore = tx.objectStore('items');

                    // コレクションメタデータ保存
                    const colMeta = {
                        id: data.id,
                        name: data.name,
                        createdAt: data.createdAt,
                        updatedAt: data.updatedAt
                    };
                    await collectionStore.put(colMeta);

                    // アイテム保存（既存を削除してから追加）
                    const index = itemStore.index('collectionId');
                    const cursorReq = index.openCursor(IDBKeyRange.only(data.id));
                    cursorReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            cursor.delete();
                            cursor.continue();
                        }
                    };

                    data.items.forEach(item => {
                        itemStore.put({ ...item, collectionId: data.id });
                    });

                    tx.oncomplete = () => sendResponse({ success: true });
                    tx.onerror = () => sendResponse({ success: false, error: tx.error.message });
                    break;

                case 'getModifiedCollections':
                    sendResponse({ success: true, data: await CollectionStorage.getModifiedCollections(message.since) });
                    break;

                case 'exportCollection':
                    sendResponse({ success: true, data: await CollectionStorage.exportCollection(message.id) });
                    break;

                case 'saveLastSyncTime':
                    const settings = await CollectionStorage.getSettings();
                    settings.lastSyncTime = message.time;
                    await CollectionStorage.saveSettings(settings);
                    sendResponse({ success: true });
                    break;

                case 'saveSettings':
                    await CollectionStorage.saveSettings(message.settings);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true; // 非同期レスポンスを示す
});

console.log('Web Collections background script loaded');
