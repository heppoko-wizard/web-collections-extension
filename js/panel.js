/**
 * panel.js - サイドパネルのメインエントリポイント
 * 各モジュールを初期化し、アプリケーションを起動する
 */

import { initElements, showView } from './panel-ui.js';
import { state } from './panel-state.js';
import { initEvents } from './panel-events.js';
import * as Actions from './panel-actions.js';
import { onImageDownloaded } from './panel-render.js';
/**
 * アプリケーションの初期化
 */
async function init() {
    // 1. DOM要素の取得
    initElements();

    // 2. イベントリスナーの設定
    initEvents({
        toggleTheme: Actions.toggleTheme,
        showCreateCollectionModal: Actions.showCreateCollectionModal,
        saveNewCollection: Actions.saveNewCollection,
        renderCollectionsList: Actions.loadCollections, // Reload collections
        addCurrentPage: Actions.addCurrentPage,
        addAllTabs: Actions.addAllTabs,
        addNote: Actions.addNote,
        openAllLinks: Actions.openAllLinks,
        updateCollectionName: Actions.updateCollectionName,
        saveNote: Actions.saveNote,
        deleteCurrentCollection: Actions.deleteCurrentCollection,
        openSettings: Actions.openSettings,
        saveSettings: Actions.saveSettings,
        syncPush: Actions.syncPush,
        loadCollections: Actions.loadCollections,
        openCollection: Actions.openCollection,
        downloadFile: Actions.downloadFile,
        importFromFiles: Actions.importFromFiles,
        exportAllCollections: Actions.exportAllCollections,
        updateSettingsUI: Actions.updateSettingsUI,
        toggleLayout: Actions.toggleLayout,
        addItemMemo: Actions.addItemMemo,
        renameItem: Actions.renameItem,
        deleteItem: Actions.deleteItem,
        copyCollectionJson: Actions.copyCollectionJson,
        autoSyncPull: Actions.autoSyncPull,
        rebuildFromBookmarks: Actions.rebuildFromBookmarks,
        syncNow: Actions.syncNow,
        syncNowFromHeader: Actions.syncNowFromHeader,
        rebuildImageIndex: Actions.rebuildImageIndex,
        downloadAllImageCaches: Actions.downloadAllImageCaches,
        onDownloadProgress: Actions.onDownloadProgress,
        onImageDownloaded: onImageDownloaded,
        showContextMenu: Actions.showContextMenu,
        hideContextMenu: Actions.hideContextMenu
    });

    // 3. 初期データのロード
    await Actions.loadSettings();
    await Actions.loadCollections();
    
    // 4. 最後に開いていた画面とコレクションIDの復元
    const restored = await chrome.storage.local.get(['wc_current_view', 'wc_current_collection_id']);
    const restoredCollectionExists = state.collections.some(
        collection => collection.id === restored.wc_current_collection_id
    );

    if (restored.wc_current_view === 'detail' && restoredCollectionExists) {
        await Actions.openCollection(restored.wc_current_collection_id);
    } else if (restored.wc_current_view === 'settings') {
        showView('settings');
        Actions.updateSettingsUI();
    } else {
        showView('list');
    }

    // 5. インテントの処理 (コンテキストメニュー等)
    const session = await chrome.storage.session.get('pendingAction');
    if (session.pendingAction === 'createCollection') {
        await chrome.storage.session.remove('pendingAction');
        Actions.showCreateCollectionModal();
    } else if (session.pendingAction === 'openSettings') {
        await chrome.storage.session.remove('pendingAction');
        showView('settings');
    }
    
    // 6. 自動同期 (Pull)
    Actions.autoSyncPull();
}

// DOMのロード完了時に起動
document.addEventListener('DOMContentLoaded', init);
