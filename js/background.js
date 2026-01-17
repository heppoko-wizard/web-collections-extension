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

// コンテキストメニューのセットアップ
function setupContextMenus() {
    // 既存のメニューを削除
    chrome.contextMenus.removeAll(() => {
        // ページを追加
        chrome.contextMenus.create({
            id: 'add-page',
            title: 'ページをコレクションに追加',
            contexts: ['page']
        });

        // 選択テキストを追加
        chrome.contextMenus.create({
            id: 'add-selection',
            title: '「%s」をコレクションに追加',
            contexts: ['selection']
        });

        // 画像を追加
        chrome.contextMenus.create({
            id: 'add-image',
            title: '画像をコレクションに追加',
            contexts: ['image']
        });

        // リンクを追加
        chrome.contextMenus.create({
            id: 'add-link',
            title: 'リンクをコレクションに追加',
            contexts: ['link']
        });
    });
}

// コンテキストメニュークリック時の処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    let itemData = null;

    switch (info.menuItemId) {
        case 'add-page':
            itemData = {
                type: 'webpage',
                url: tab.url,
                title: tab.title,
                faviconUrl: tab.favIconUrl || ''
            };
            break;

        case 'add-selection':
            itemData = {
                type: 'text',
                content: info.selectionText,
                sourceUrl: tab.url,
                sourceTitle: tab.title
            };
            break;

        case 'add-image':
            // 画像の場合、リンクが埋め込まれていればリンク先を使用
            itemData = {
                type: 'image',
                imageUrl: info.srcUrl,
                url: info.linkUrl || tab.url,  // リンクがあればそれを、なければ現在のページURL
                sourceUrl: tab.url,
                title: tab.title
            };
            break;

        case 'add-link':
            itemData = {
                type: 'webpage',
                url: info.linkUrl,
                title: info.linkUrl,  // リンクテキストは取得できないのでURLを使用
                sourceUrl: tab.url
            };
            break;
    }

    if (itemData) {
        // サイドパネルを開いてアイテムを追加
        await handleAddItem(itemData, tab);
    }
});

// アイテム追加ハンドラ
async function handleAddItem(itemData, tab) {
    // デフォルトコレクションを取得または作成
    let collections = await CollectionStorage.getAllCollections();

    if (collections.length === 0) {
        await CollectionStorage.createCollection('マイコレクション');
        collections = await CollectionStorage.getAllCollections();
    }

    const defaultCollection = collections[0];
    await CollectionStorage.addItem(defaultCollection.id, itemData);

    // サイドパネルを開く
    try {
        await chrome.sidePanel.open({ tabId: tab.id });
    } catch (e) {
        console.log('Side panel open failed:', e);
    }

    // 追加通知
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
