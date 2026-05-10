/**
 * panel.js - サイドパネルのメインエントリポイント
 * 各モジュールを初期化し、アプリケーションを起動する
 */

import { initElements } from './panel-ui.js';
import { initEvents } from './panel-events.js';
import * as Actions from './panel-actions.js';
import { DeviceManager } from './device-manager.js';

/**
 * アプリケーションの初期化
 */
async function init() {
    // 1. DOM要素の取得
    initElements();

    // 2. デバイス情報の初期化
    const deviceInfo = await DeviceManager.getDeviceInfo();
    console.log('Device initialized:', deviceInfo.deviceName, deviceInfo.deviceId);

    // 3. イベントリスナーの設定
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
        exportToJson: Actions.exportToJson,
        saveSettings: (settings) => chrome.runtime.sendMessage({ action: 'saveSettings', settings }),
        loadCollections: Actions.loadCollections,
        openCollection: Actions.openCollection,
        downloadFile: Actions.downloadFile,
        exportToCsv: Actions.exportToCsv,
        importFromJson: Actions.importFromJson,
        selectFolder: Actions.selectFolder,
        syncAll: Actions.syncAll,
        pushToFolder: Actions.pushToFolder,
        pullFromFolder: Actions.pullFromFolder,
        unlinkFolder: Actions.unlinkFolder,
        grantFolderPermission: Actions.grantFolderPermission,
        saveSyncSettings: Actions.saveSyncSettings,
        toggleLayout: Actions.toggleLayout,
        addItemMemo: Actions.addItemMemo,
        renameItem: Actions.renameItem,
        deleteItem: Actions.deleteItem,
        autoSyncPull: Actions.autoSyncPull
    });

    // 3. UUIDマイグレーションの実行
    await Actions.initUUIDMigration();

    // 4. 初期データのロード
    await Actions.loadSettings();
    await Actions.loadCollections();
    await Actions.checkFolderSyncStatus();
    
    // 5. インテントの処理 (コンテキストメニュー等)
    const session = await chrome.storage.session.get('pendingAction');
    if (session.pendingAction === 'createCollection') {
        await chrome.storage.session.remove('pendingAction');
        Actions.showCreateCollectionModal();
    } else if (session.pendingAction === 'openSettings') {
        await chrome.storage.session.remove('pendingAction');
        Actions.showView('settings');
    }
    
    // 6. 初期ビューの表示
    // Actions.showView('list') is called inside initEvents via btnBack, etc.
    // but here we just ensure the UI is correct.
    
    // 6. 自動同期 (Pull)
    Actions.autoSyncPull();
}

// DOMのロード完了時に起動
document.addEventListener('DOMContentLoaded', init);
