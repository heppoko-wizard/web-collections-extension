// js/background-handlers.js

/**
 * background-handlers.js - メッセージハンドラの定義
 */

import { CollectionStorage } from './storage.js';

/**
 * メッセージを処理し、適切なアクションを実行する
 */
export async function handleMessage(message, setupContextMenus) {
    switch (message.action) {
        case 'getCollections':
            return { success: true, data: await CollectionStorage.getAllCollections(message.includeDeleted) };

        case 'createCollection':
            const newCol = await CollectionStorage.createCollection(message.name);
            if (setupContextMenus) setupContextMenus();
            return { success: true, data: newCol };

        case 'deleteCollection':
            await CollectionStorage.deleteCollection(message.id);
            if (setupContextMenus) setupContextMenus();
            return { success: true };

        case 'addItem':
            return { success: true, data: await CollectionStorage.addItem(message.collectionId, message.item) };

        case 'removeItem':
            await CollectionStorage.removeItem(message.collectionId, message.itemId);
            return { success: true };

        case 'reorderItems':
            await CollectionStorage.reorderItems(message.collectionId, message.itemIds);
            return { success: true };

        case 'updateCollection':
            await CollectionStorage.updateCollection(message.id, message.updates);
            return { success: true };

        case 'updateItem':
            const updatedItem = await CollectionStorage.updateItem(message.collectionId, message.itemId, message.updates);
            return { success: true, data: updatedItem };

        case 'getItemsByCollection':
            return { success: true, data: await CollectionStorage.getItemsByCollection(message.collectionId) };

        case 'exportJson':
            return { success: true, data: await CollectionStorage.exportToJson() };

        case 'importJson':
            await CollectionStorage.importFromJson(message.data);
            return { success: true };

        case 'importCollection':
            await CollectionStorage.importCollectionData(message.data);
            return { success: true };

        case 'getModifiedCollections':
            return { success: true, data: await CollectionStorage.getModifiedCollections(message.since) };

        case 'exportCollection':
            return { success: true, data: await CollectionStorage.exportCollection(message.id) };

        case 'getSettings':
            return { success: true, data: await CollectionStorage.getSettings() };

        case 'saveLastSyncTime':
            const settings = await CollectionStorage.getSettings();
            settings.lastSyncTime = message.time;
            await CollectionStorage.saveSettings(settings);
            return { success: true };

        case 'saveSettings':
            await CollectionStorage.saveSettings(message.settings);
            return { success: true };

        default:
            return { success: false, error: 'Unknown action: ' + message.action };
    }
}
