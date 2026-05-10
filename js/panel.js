/**
 * panel.js - サイドパネルのメインエントリポイント
 * 各モジュールを初期化し、アプリケーションを起動する
 */

import { initElements } from './panel-ui.js';
import { initEvents } from './panel-events.js';
import * as Actions from './panel-actions.js';

/**
 * アプリケーションの初期化
 */
async function init() {
    // 1. DOM要素の取得
    initElements();

    // 2. イベントリスナーの設定
    initEvents({
        createCollection: Actions.createCollection,
        renderCollectionsList: Actions.loadCollections, // Reload collections
        addCurrentPage: Actions.addCurrentPage,
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
        pushToFolder: Actions.pushToFolder,
        pullFromFolder: Actions.pullFromFolder,
        unlinkFolder: Actions.unlinkFolder,
        toggleLayout: Actions.toggleLayout,
        addItemMemo: Actions.addItemMemo,
        renameItem: Actions.renameItem,
        deleteItem: Actions.deleteItem
    });

    // 3. UUIDマイグレーションの実行
    await Actions.initUUIDMigration();

    // 4. 初期データのロード
    await Actions.loadSettings();
    await Actions.loadCollections();
    await Actions.checkFolderSyncStatus();
    
    // 5. 初期ビューの表示
    // Actions.showView('list') is called inside initEvents via btnBack, etc.
    // but here we just ensure the UI is correct.
    
    // 6. 自動同期 (Pull)
    Actions.autoSyncPull();
}

// DOMのロード完了時に起動
document.addEventListener('DOMContentLoaded', init);
