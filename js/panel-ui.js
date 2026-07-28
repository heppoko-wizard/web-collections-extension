// js/panel-ui.js

/**
 * panel-ui.js - DOM要素の参照管理とビュー切り替え
 */

import { state } from './panel-state.js';

export const elements = {};

/**
 * DOM要素の参照を初期化
 */
export function initElements() {
    elements.viewList = document.getElementById('view-list');
    elements.viewDetail = document.getElementById('view-detail');
    elements.viewSettings = document.getElementById('view-settings');
    elements.collectionsContainer = document.getElementById('collections-container');
    elements.itemsContainer = document.getElementById('items-container');
    elements.itemsList = document.getElementById('items-list');
    elements.virtualScrollSpacer = document.getElementById('virtual-scroll-spacer');
    elements.collectionTitle = document.getElementById('collection-title');

    // Buttons
    elements.btnSyncHeader = document.getElementById('btn-sync-header');
    elements.btnThemeToggle = document.getElementById('btn-theme-toggle');
    elements.iconSun = document.getElementById('icon-sun');
    elements.iconMoon = document.getElementById('icon-moon');
    elements.btnNewCollection = document.getElementById('btn-new-collection');
    elements.btnSettings = document.getElementById('btn-settings');
    elements.btnBack = document.getElementById('btn-back');
    elements.btnAddPage = document.getElementById('btn-add-page');
    elements.btnAddAllTabs = document.getElementById('btn-add-all-tabs');
    elements.btnAddNote = document.getElementById('btn-add-note');
    elements.btnOpenAll = document.getElementById('btn-open-all');
    elements.btnCollectionMenu = document.getElementById('btn-collection-menu');
    elements.btnSelectionToggle = document.getElementById('btn-selection-toggle');
    elements.btnLayoutToggle = document.getElementById('btn-layout-toggle');
    elements.bulkActions = document.getElementById('bulk-actions');
    elements.selectAllItems = document.getElementById('select-all-items');
    elements.selectedCount = document.getElementById('selected-count');
    elements.btnDeleteSelected = document.getElementById('btn-delete-selected');
    elements.btnCancelSelection = document.getElementById('btn-cancel-selection');

    // Settings
    elements.lastSyncTime = document.getElementById('last-sync-time');
    elements.importJsonFile = document.getElementById('import-json-file');
    elements.btnImportFile = document.getElementById('btn-import-file');
    elements.btnExportAll = document.getElementById('btn-export-all');
    elements.btnRebuildFromBookmarks = document.getElementById('btn-rebuild-from-bookmarks');
    elements.btnRebuildImageIndex = document.getElementById('btn-rebuild-image-index');
    elements.btnSyncNow = document.getElementById('btn-sync-now');
    elements.btnDownloadAllImages = document.getElementById('btn-download-all-images');
    elements.downloadProgressContainer = document.getElementById('download-progress-container');
    elements.downloadProgressStatus = document.getElementById('download-progress-status');
    elements.downloadProgressPercent = document.getElementById('download-progress-percent');
    elements.downloadProgressBar = document.getElementById('download-progress-bar');
    elements.downloadProgressCounts = document.getElementById('download-progress-counts');
    elements.downloadProgressErrors = document.getElementById('download-progress-errors');

    // Settings Inputs
    elements.settingTileWidth = document.getElementById('setting-tile-width');
    elements.tileWidthValue = document.getElementById('tile-width-value');
    elements.settingBookmarkRoot = document.getElementById('setting-bookmark-root');
    elements.settingEncryptEnabled = document.getElementById('setting-encrypt-enabled');

    // Modals
    elements.modalCreateCollection = document.getElementById('modal-create-collection');
    elements.createCollectionInput = document.getElementById('create-collection-input');
    elements.btnCreateCollectionSave = document.getElementById('btn-create-collection-save');
    elements.btnCreateCollectionCancel = document.getElementById('btn-create-collection-cancel');

    elements.modalNote = document.getElementById('modal-note');
    elements.noteInput = document.getElementById('note-input');
    elements.btnNoteSave = document.getElementById('btn-note-save');
    elements.btnNoteCancel = document.getElementById('btn-note-cancel');
    elements.modalCollectionMenu = document.getElementById('modal-collection-menu');
    elements.btnDeleteCollection = document.getElementById('btn-delete-collection');
    elements.btnExportCollection = document.getElementById('btn-export-collection');
    elements.btnCopyCollectionJson = document.getElementById('btn-copy-collection-json');
    elements.btnMenuCancel = document.getElementById('btn-menu-cancel');

    // Context Menu
    elements.contextMenu = document.getElementById('context-menu');
    elements.ctxAddMemo = document.getElementById('ctx-add-memo');
    elements.ctxRenameItem = document.getElementById('ctx-rename-item');
    elements.ctxDeleteItem = document.getElementById('ctx-delete-item');
}

/**
 * ビューを切り替える
 * @param {string} viewName - 'list' | 'detail' | 'settings'
 */
export function showView(viewName) {
    state.currentView = viewName;
    elements.viewList.classList.remove('active');
    elements.viewDetail.classList.remove('active');
    elements.viewSettings.classList.remove('active');

    // 表示ビューを保存し、詳細ビュー以外ならコレクションID保存をクリア
    chrome.storage.local.set({ wc_current_view: viewName });
    if (viewName !== 'detail') {
        chrome.storage.local.remove('wc_current_collection_id');
    }

    if (elements.btnBack) elements.btnBack.style.display = 'none';
    if (elements.collectionTitle) elements.collectionTitle.style.display = 'none';
    if (elements.btnNewCollection) elements.btnNewCollection.style.display = 'none';
    
    // 詳細画面アクションの非表示化
    if (elements.btnAddPage) elements.btnAddPage.style.display = 'none';
    if (elements.btnAddAllTabs) elements.btnAddAllTabs.style.display = 'none';
    if (elements.btnAddNote) elements.btnAddNote.style.display = 'none';
    if (elements.btnSelectionToggle) elements.btnSelectionToggle.style.display = 'none';
    if (elements.btnLayoutToggle) elements.btnLayoutToggle.style.display = 'none';
    if (elements.btnOpenAll) elements.btnOpenAll.style.display = 'none';
    if (elements.btnCollectionMenu) elements.btnCollectionMenu.style.display = 'none';
    
    // 共通アクションの初期表示
    if (elements.btnSyncHeader) elements.btnSyncHeader.style.display = 'inline-flex';
    if (elements.btnThemeToggle) elements.btnThemeToggle.style.display = 'inline-flex';
    if (elements.btnSettings) elements.btnSettings.style.display = 'inline-flex';

    if (viewName === 'list') {
        elements.viewList.classList.add('active');
        if (elements.btnNewCollection) elements.btnNewCollection.style.display = 'inline-flex';
    } else if (viewName === 'detail') {
        elements.viewDetail.classList.add('active');
        if (elements.btnBack) elements.btnBack.style.display = 'inline-flex';
        if (elements.collectionTitle) elements.collectionTitle.style.display = 'block';
        
        // 詳細画面用アクションを表示
        if (elements.btnAddPage) elements.btnAddPage.style.display = 'inline-flex';
        if (elements.btnAddAllTabs) elements.btnAddAllTabs.style.display = 'inline-flex';
        if (elements.btnAddNote) elements.btnAddNote.style.display = 'inline-flex';
        if (elements.btnSelectionToggle) elements.btnSelectionToggle.style.display = 'inline-flex';
        if (elements.btnLayoutToggle) elements.btnLayoutToggle.style.display = 'inline-flex';
        if (elements.btnOpenAll) elements.btnOpenAll.style.display = 'inline-flex';
        if (elements.btnCollectionMenu) elements.btnCollectionMenu.style.display = 'inline-flex';
    } else if (viewName === 'settings') {
        elements.viewSettings.classList.add('active');
        if (elements.btnBack) elements.btnBack.style.display = 'inline-flex';
        
        // 設定画面時は右側の共通アクションを非表示
        if (elements.btnSyncHeader) elements.btnSyncHeader.style.display = 'none';
        if (elements.btnThemeToggle) elements.btnThemeToggle.style.display = 'none';
        if (elements.btnSettings) elements.btnSettings.style.display = 'none';
    }
}

/**
 * モーダルを表示
 * @param {HTMLElement} modal 
 */
export function showModal(modal) {
    if (modal) modal.classList.add('active');
}

/**
 * モーダルを非表示
 * @param {HTMLElement} modal 
 */
export function hideModal(modal) {
    if (modal) modal.classList.remove('active');
}
