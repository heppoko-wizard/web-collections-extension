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
    elements.btnThemeToggle = document.getElementById('btn-theme-toggle');
    elements.iconSun = document.getElementById('icon-sun');
    elements.iconMoon = document.getElementById('icon-moon');
    elements.btnNewCollection = document.getElementById('btn-new-collection');
    elements.btnSettings = document.getElementById('btn-settings');
    elements.btnBack = document.getElementById('btn-back');
    elements.btnBackSettings = document.getElementById('btn-back-settings');
    elements.btnAddPage = document.getElementById('btn-add-page');
    elements.btnAddAllTabs = document.getElementById('btn-add-all-tabs');
    elements.btnAddNote = document.getElementById('btn-add-note');
    elements.btnOpenAll = document.getElementById('btn-open-all');
    elements.btnCollectionMenu = document.getElementById('btn-collection-menu');
    elements.btnLayoutToggle = document.getElementById('btn-layout-toggle');

    // Settings
    elements.lastSyncTime = document.getElementById('last-sync-time');
    elements.importJsonTextarea = document.getElementById('import-json-textarea');
    elements.btnImportPaste = document.getElementById('btn-import-paste');

    // Settings Inputs
    elements.settingTileWidth = document.getElementById('setting-tile-width');
    elements.tileWidthValue = document.getElementById('tile-width-value');
    elements.settingBookmarkRoot = document.getElementById('setting-bookmark-root');

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

    if (viewName === 'list') {
        elements.viewList.classList.add('active');
    } else if (viewName === 'detail') {
        elements.viewDetail.classList.add('active');
    } else if (viewName === 'settings') {
        elements.viewSettings.classList.add('active');
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
