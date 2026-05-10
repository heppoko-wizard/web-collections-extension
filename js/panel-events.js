// js/panel-events.js

/**
 * panel-events.js - イベントリスナーの設定
 */

import { state } from './panel-state.js';
import { elements, showView, showModal, hideModal } from './panel-ui.js';

/**
 * 全てのイベントリスナーを初期化
 * @param {object} handlers - 各種操作のハンドラ関数
 */
export function initEvents(handlers) {
    // Navigation
    elements.btnNewCollection.addEventListener('click', handlers.showCreateCollectionModal);
    elements.btnSettings.addEventListener('click', () => showView('settings'));
    elements.btnBack.addEventListener('click', () => {
        showView('list');
        handlers.renderCollectionsList();
    });
    elements.btnBackSettings.addEventListener('click', () => showView('list'));

    // Collection detail
    elements.btnAddPage.addEventListener('click', handlers.addCurrentPage);
    elements.btnAddNote.addEventListener('click', handlers.addNote);
    elements.btnOpenAll.addEventListener('click', handlers.openAllLinks);
    elements.btnCollectionMenu.addEventListener('click', () => showModal(elements.modalCollectionMenu));
    elements.collectionTitle.addEventListener('blur', handlers.updateCollectionName);
    
    if (elements.btnLayoutToggle) {
        elements.btnLayoutToggle.addEventListener('click', handlers.toggleLayout);
    }

    // Note modal
    elements.btnNoteSave.addEventListener('click', handlers.saveNote);
    elements.btnNoteCancel.addEventListener('click', () => hideModal(elements.modalNote));

    // Create collection modal
    elements.btnCreateCollectionSave.addEventListener('click', handlers.saveNewCollection);
    elements.btnCreateCollectionCancel.addEventListener('click', () => hideModal(elements.modalCreateCollection));
    elements.createCollectionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handlers.saveNewCollection();
    });

    // Collection menu modal
    elements.btnDeleteCollection.addEventListener('click', handlers.deleteCurrentCollection);
    elements.btnExportCollection.addEventListener('click', () => {
        const collection = state.collections.find(c => c.id === state.currentCollectionId);
        if (collection && handlers.downloadFile) {
            handlers.downloadFile(JSON.stringify(collection, null, 2), `${collection.name}.json`, 'application/json');
        }
        hideModal(elements.modalCollectionMenu);
    });
    elements.btnMenuCancel.addEventListener('click', () => hideModal(elements.modalCollectionMenu));

    // Settings
    if (elements.btnGrantPermission) {
        elements.btnGrantPermission.addEventListener('click', handlers.grantFolderPermission);
    }
    if (elements.btnSyncNow) {
        elements.btnSyncNow.addEventListener('click', handlers.autoSyncPull);
    }
    elements.btnExportJson.addEventListener('click', handlers.exportToJson);
    elements.btnExportCsv.addEventListener('click', handlers.exportToCsv);
    elements.importFile.addEventListener('change', (e) => {
        if (e.target.files[0] && handlers.importFromJson) {
            handlers.importFromJson(e.target.files[0]);
        }
    });

    // Display Settings
    if (elements.settingTileWidth) {
        elements.settingTileWidth.addEventListener('input', (e) => {
            elements.tileWidthValue.textContent = e.target.value;
            document.documentElement.style.setProperty('--tile-min-width', `${e.target.value}px`);
            state.settings.tileMinWidth = parseInt(e.target.value, 10);
        });

        elements.settingTileWidth.addEventListener('change', async (e) => {
            const newSettings = { ...state.settings, tileMinWidth: parseInt(e.target.value, 10) };
            if (handlers.saveSettings) await handlers.saveSettings(newSettings);
        });
    }

    // Folder Sync
    if (elements.btnSaveDeviceName) {
        elements.btnSaveDeviceName.addEventListener('click', handlers.saveDeviceName);
    }
    elements.btnSelectFolder.addEventListener('click', handlers.selectFolder);
    elements.btnFolderSyncPush.addEventListener('click', () => handlers.pushToFolder());
    elements.btnFolderSyncPull.addEventListener('click', () => handlers.pullFromFolder());
    elements.btnFolderUnlink.addEventListener('click', handlers.unlinkFolder);

    // Close modals on backdrop click
    [elements.modalNote, elements.modalCollectionMenu, elements.modalCreateCollection].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) hideModal(modal);
            });
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideModal(elements.modalNote);
            hideModal(elements.modalCollectionMenu);
            hideModal(elements.modalCreateCollection);
        }
    });

    // Background update listener
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'collectionUpdated') {
            handlers.loadCollections();
            if (state.currentView === 'detail' && state.currentCollectionId === message.collectionId) {
                handlers.openCollection(state.currentCollectionId);
            }
            // コンテキストメニュー等での追加後、自動保存を実行
            handlers.autoSyncPush();
        }
    });

    // Item Actions via Event Delegation
    elements.itemsContainer.addEventListener('itemClick', (e) => {
        const item = state.currentItems.find(i => i.id === e.detail.id);
        if (item) {
            const url = item.url || item.sourceUrl;
            if (url) chrome.tabs.create({ url, active: false });
        }
    });

    elements.itemsContainer.addEventListener('click', (e) => {
        const target = e.target;
        
        // 2. Add Memo
        const memoBtn = target.closest('.btn-add-memo');
        if (memoBtn) {
            e.stopPropagation();
            handlers.addItemMemo(memoBtn.dataset.id);
            return;
        }

        // 3. Rename
        const renameBtn = target.closest('.btn-rename-item');
        if (renameBtn) {
            e.stopPropagation();
            handlers.renameItem(renameBtn.dataset.id);
            return;
        }

        // 4. Delete
        const deleteBtn = target.closest('.btn-delete-item');
        if (deleteBtn) {
            e.stopPropagation();
            handlers.deleteItem(deleteBtn.dataset.id);
            return;
        }
    });
}
