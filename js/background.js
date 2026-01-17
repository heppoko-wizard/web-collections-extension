/**
 * background.js - Service Worker (バックグラウンド処理)
 * コンテキストメニュー、メッセージハンドリング、同期トリガーを管理
 */

// ライブラリをインポート
// Service Worker からのインポートは、Service Worker ファイル自身の場所からの相対パス
// background.js は js/ 内にあるので、同じディレクトリのファイルは ./ で参照
importScripts('./crypto-utils.js', './drive-sync.js', './storage.js', './image-processor.js');

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(() => {
    setupContextMenus();
    console.log('Web Collections extension installed');
});

// ストレージの変更を監視してメニューを更新
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.collections) {
        setupContextMenus();
    }
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
                    sendResponse({ success: true, data: await CollectionStorage.getAllCollections() });
                    break;

                case 'createCollection':
                    sendResponse({ success: true, data: await CollectionStorage.createCollection(message.name) });
                    break;

                case 'deleteCollection':
                    await CollectionStorage.deleteCollection(message.id);
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

                case 'exportJson':
                    sendResponse({ success: true, data: await CollectionStorage.exportToJson() });
                    break;

                case 'importJson':
                    await CollectionStorage.importFromJson(message.data);
                    sendResponse({ success: true });
                    break;

                case 'syncUpload':
                    await performSync('upload');
                    sendResponse({ success: true });
                    break;

                case 'syncDownload':
                    await performSync('download');
                    sendResponse({ success: true });
                    break;

                case 'getSettings':
                    sendResponse({ success: true, data: await CollectionStorage.getSettings() });
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

// 同期処理
async function performSync(direction) {
    const settings = await CollectionStorage.getSettings();
    if (!settings.syncEnabled || !settings.syncPassword) {
        throw new Error('同期が設定されていません');
    }

    const token = await DriveSync.authenticate();

    if (direction === 'upload') {
        const jsonData = await CollectionStorage.exportToJson();
        const encrypted = await CryptoUtils.encrypt(jsonData, settings.syncPassword);
        await DriveSync.upload(token, encrypted);
        settings.lastSyncTime = Date.now();
        await CollectionStorage.saveSettings(settings);
    } else {
        const encryptedData = await DriveSync.download(token);
        if (encryptedData) {
            const jsonData = await CryptoUtils.decrypt(
                encryptedData.encrypted,
                encryptedData.salt,
                encryptedData.iv,
                settings.syncPassword
            );
            await CollectionStorage.importFromJson(jsonData);
            settings.lastSyncTime = Date.now();
            await CollectionStorage.saveSettings(settings);
        }
    }
}

console.log('Web Collections background script loaded');
