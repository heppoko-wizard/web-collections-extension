// js/background-handlers.js

/**
 * background-handlers.js - メッセージハンドラの定義
 */

import { CollectionStorage } from './storage.js';
import { SyncManager } from './sync-manager.js';

let syncTimeout = null;

/**
 * 自動同期をスケジュール（デバウンス）
 */
function scheduleAutoSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        console.log('Background: Executing scheduled auto-sync...');
        try {
            await SyncManager.pushToLocalFolder(CollectionStorage);
            console.log('Background: Auto-sync success');
        } catch (error) {
            if (error.message === 'PermissionDenied' || error.name === 'NotAllowedError') {
                console.warn('Background: Sync permission denied. Showing notification.');
                showPermissionNotification();
            } else {
                console.error('Background: Auto-sync failed:', error);
            }
        }
    }, 5000); // 5秒のデバウンス
}

/**
 * 権限再取得の通知を表示
 */
function showPermissionNotification() {
    chrome.notifications.create('sync-permission-required', {
        type: 'basic',
        iconUrl: '/icons/icon128.png',
        title: '同期の権限が必要です',
        message: 'ローカルフォルダへのアクセス権限が切れています。サイドパネルを開いて「再許可」をクリックしてください。',
        priority: 2
    });
}

/**
 * メッセージを処理し、適切なアクションを実行する
 */
export async function handleMessage(message, setupContextMenus) {
    let response = { success: true };

    switch (message.action) {
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
            break;

        case 'syncPush':
            try {
                await SyncManager.pushToLocalFolder(CollectionStorage);
                return { success: true };
            } catch (error) {
                if (error.message === 'PermissionDenied' || error.name === 'NotAllowedError') {
                    showPermissionNotification();
                    return { success: false, error: 'PermissionDenied' };
                }
                return { success: false, error: error.message };
            }

        case 'autoSyncPush':
            scheduleAutoSync();
            break;

        case 'autoSyncPull':
            try {
                const result = await SyncManager.pullFromLocalFolder(CollectionStorage);
                if (result.success && result.updated && setupContextMenus) {
                    setupContextMenus();
                }
                return result; // Returns { success: true, updated: boolean }
            } catch (error) {
                if (error.message === 'PermissionDenied' || error.name === 'NotAllowedError') {
                    showPermissionNotification();
                    return { success: false, error: 'PermissionDenied' };
                }
                return { success: false, error: error.message };
            }

        case 'checkFolderSyncStatus':
            // パネル側で直接ハンドルを確認するため、ここでは不要だが互換性のために残す
            return { success: true };

        default:
            return { success: false, error: 'Unknown action: ' + message.action };
    }

    return response;
}
