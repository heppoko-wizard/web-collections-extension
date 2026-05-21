// js/background-handlers.js

/**
 * background-handlers.js - メッセージハンドラの定義
 */

import { CollectionStorage } from './storage.js';
import { BookmarkSync } from './bookmark-sync.js';

/**
 * 自動同期をスケジュール（Service Worker対応）
 */
async function scheduleAutoSync() {
    // setTimeout は MV3 Service Worker のサスペンド時に破棄されるため、chrome.alarms を使用する
    // deferred-auto-sync-push ハンドラは background.js に実装済み
    chrome.alarms.create('deferred-auto-sync-push', { delayInMinutes: 0.5 });
}

/**
 * 実際の同期実行処理
 */
export async function executeAutoSyncPush() {
    console.log('Background: Executing scheduled auto-sync...');
    try {
        await BookmarkSync.push(CollectionStorage);
        console.log('Background: Auto-sync success');
    } catch (error) {
        console.error('Background: Auto-sync failed:', error);
    }
}

/**
 * メッセージを処理し、適切なアクションを実行する
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
            await CollectionStorage.importFromJson(message.data);
            if (setupContextMenus) setupContextMenus();
            break;

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

        case 'saveLastSyncTime':
            const settings = await CollectionStorage.getSettings();
            settings.lastSyncTime = message.time;
            await CollectionStorage.saveSettings(settings);
            break;

        case 'saveSettings':
            await CollectionStorage.saveSettings(message.settings);
            scheduleAutoSync();
            break;

        case 'syncPush':
            try {
                await BookmarkSync.push(CollectionStorage);
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }

        case 'autoSyncPush':
            scheduleAutoSync();
            break;

        case 'autoSyncPull':
            try {
                const result = await BookmarkSync.pull(CollectionStorage);
                if (result.success && result.updated && setupContextMenus) {
                    setupContextMenus();
                }
                return result; // Returns { success: true, updated: boolean }
            } catch (error) {
                return { success: false, error: error.message };
            }

        default:
            return { success: false, error: 'Unknown action: ' + message.action };
    }

    return response;
}

/**
 * ブックマークフォルダを階層パス付きで再帰的に取得する
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

