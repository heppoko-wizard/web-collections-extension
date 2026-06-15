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
    if (elements.btnSyncHeader) {
        elements.btnSyncHeader.addEventListener('click', handlers.syncNowFromHeader);
    }
    elements.btnThemeToggle.addEventListener('click', handlers.toggleTheme);
    elements.btnNewCollection.addEventListener('click', handlers.showCreateCollectionModal);
    elements.btnSettings.addEventListener('click', () => {
        showView('settings');
        if (handlers.updateSettingsUI) handlers.updateSettingsUI();
    });
    elements.btnBack.addEventListener('click', () => {
        showView('list');
        handlers.renderCollectionsList();
    });

    // Collection detail
    elements.btnAddPage.addEventListener('click', handlers.addCurrentPage);
    elements.btnAddAllTabs.addEventListener('click', handlers.addAllTabs);
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
            // アイテムの配列を結合して完全なオブジェクトにする
            const fullCollection = {
                ...collection,
                items: state.currentItems || []
            };
            handlers.downloadFile(JSON.stringify(fullCollection, null, 2), `${collection.name}.json`, 'application/json');
        }
        hideModal(elements.modalCollectionMenu);
    });
    if (elements.btnCopyCollectionJson) {
        elements.btnCopyCollectionJson.addEventListener('click', () => {
            if (handlers.copyCollectionJson) {
                handlers.copyCollectionJson();
            }
        });
    }
    elements.btnMenuCancel.addEventListener('click', () => hideModal(elements.modalCollectionMenu));

    // Settings
    if (elements.btnExportAll) {
        elements.btnExportAll.addEventListener('click', () => {
            if (handlers.exportAllCollections) {
                handlers.exportAllCollections();
            }
        });
    }

    if (elements.btnImportFile) {
        elements.btnImportFile.addEventListener('click', () => {
            if (handlers.importFromFiles) {
                handlers.importFromFiles();
            }
        });
    }

    if (elements.btnRebuildFromBookmarks) {
        elements.btnRebuildFromBookmarks.addEventListener('click', () => {
            if (handlers.rebuildFromBookmarks) {
                handlers.rebuildFromBookmarks();
            }
        });
    }

    if (elements.btnRebuildImageIndex) {
        elements.btnRebuildImageIndex.addEventListener('click', () => {
            if (handlers.rebuildImageIndex) {
                handlers.rebuildImageIndex();
            }
        });
    }

    if (elements.btnSyncNow) {
        elements.btnSyncNow.addEventListener('click', () => {
            if (handlers.syncNow) {
                handlers.syncNow();
            }
        });
    }

    if (elements.btnDownloadAllImages) {
        elements.btnDownloadAllImages.addEventListener('click', () => {
            if (handlers.downloadAllImageCaches) {
                handlers.downloadAllImageCaches();
            }
        });
    }

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

    if (elements.settingBookmarkRoot) {
        elements.settingBookmarkRoot.addEventListener('change', async (e) => {
            const newSettings = { ...state.settings, bookmarkRootId: e.target.value };
            state.settings.bookmarkRootId = e.target.value;
            if (handlers.saveSettings) await handlers.saveSettings(newSettings);
            
            // コレクションデータをクリア
            await chrome.storage.local.set({ wc_collections: [] });
            
            // 新しいルートフォルダからデータを引き込む
            if (handlers.autoSyncPull) await handlers.autoSyncPull();
            if (handlers.loadCollections) await handlers.loadCollections();
        });
    }



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
            if (handlers.hideContextMenu) handlers.hideContextMenu();
        }
    });

    // Background update listener
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'collectionUpdated') {
            handlers.loadCollections();
            if (state.currentView === 'detail' && state.currentCollectionId === message.collectionId) {
                handlers.openCollection(state.currentCollectionId);
            }
        } else if (message.action === 'downloadProgress') {
            if (handlers.onDownloadProgress) {
                handlers.onDownloadProgress(message.detail);
            }
        } else if (message.action === 'imageDownloaded') {
            if (handlers.onImageDownloaded) {
                handlers.onImageDownloaded(message.hash, message.dataUrl);
            }
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

    // Context Menu Event (Right Click)
    elements.itemsContainer.addEventListener('contextmenu', (e) => {
        const itemCard = e.target.closest('.item-card');
        if (!itemCard) return;

        e.preventDefault();
        const itemId = itemCard.dataset.id;
        
        if (handlers.showContextMenu) {
            handlers.showContextMenu(itemId, e.clientX, e.clientY);
        }
    });

    // Context Menu Items Click
    if (elements.ctxAddMemo) {
        elements.ctxAddMemo.addEventListener('click', (e) => {
            const itemId = elements.contextMenu.dataset.itemId;
            if (itemId && handlers.addItemMemo) {
                handlers.addItemMemo(itemId);
            }
            if (handlers.hideContextMenu) handlers.hideContextMenu();
        });
    }

    if (elements.ctxRenameItem) {
        elements.ctxRenameItem.addEventListener('click', (e) => {
            const itemId = elements.contextMenu.dataset.itemId;
            if (itemId && handlers.renameItem) {
                handlers.renameItem(itemId);
            }
            if (handlers.hideContextMenu) handlers.hideContextMenu();
        });
    }

    if (elements.ctxDeleteItem) {
        elements.ctxDeleteItem.addEventListener('click', (e) => {
            const itemId = elements.contextMenu.dataset.itemId;
            if (itemId && handlers.deleteItem) {
                handlers.deleteItem(itemId);
            }
            if (handlers.hideContextMenu) handlers.hideContextMenu();
        });
    }
}
