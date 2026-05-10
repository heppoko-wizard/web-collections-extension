/**
 * panel.js - サイドパネルUIロジック
 * コレクションの表示・操作・同期を管理
 */

import { state, updateState, subscribe, notify } from './panel-state.js';
import * as Render from './panel-render.js';
import { elements, initElements, showView, showModal, hideModal } from './panel-ui.js';
import { initDragDrop } from './panel-dragdrop.js';
import { initEvents } from './panel-events.js';

// Virtual Scroll Constants
const BUFFER_SIZE = 20; // items

// ============================================
// Message API Helper
// ============================================
async function sendMessage(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, resolve);
    });
}

// ============================================
// Rendering (Proxied to Render module)
// ============================================
function renderCollectionsList() {
    Render.renderCollectionsList(elements, openCollection);
}

function renderItems() {
    Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));
}

function renderVisibleItems() {
    Render.renderVisibleItems(elements);
}

function toggleLayout() {
    state.layoutMode = state.layoutMode === 'list' ? 'grid' : 'list';
    renderItems();
}

// ============================================
// Collection Operations
// ============================================
async function loadCollections() {
    const response = await sendMessage({ action: 'getCollections' });
    if (response.success) {
        state.collections = response.data;
        renderCollectionsList();
    }
}

async function createCollection() {
    const name = prompt('コレクション名を入力:', '新しいコレクション');
    if (name) {
        const response = await sendMessage({ action: 'createCollection', name });
        if (response.success) {
            state.collections.unshift(response.data);
            renderCollectionsList();
            openCollection(response.data.id);
            autoSyncPush();
        }
    }
}

async function openCollection(id) {
    state.currentCollectionId = id;
    showView('detail');
    const response = await sendMessage({ action: 'getItemsByCollection', collectionId: id });
    if (response.success) {
        state.currentItems = response.data;
    } else {
        state.currentItems = [];
    }
    renderItems();
}

async function deleteCurrentCollection() {
    if (!confirm('このコレクションを削除しますか？')) return;

    const response = await sendMessage({
        action: 'deleteCollection',
        id: state.currentCollectionId
    });

    if (response.success) {
        state.collections = state.collections.filter(c => c.id !== state.currentCollectionId);
        state.currentCollectionId = null;
        showView('list');
        renderCollectionsList();
        hideModal(elements.modalCollectionMenu);
        autoSyncPush();
    }
}

async function updateCollectionName() {
    const newName = elements.collectionTitle.textContent.trim();
    if (newName) {
        await sendMessage({
            action: 'updateCollection',
            id: state.currentCollectionId,
            updates: { name: newName }
        });
        const collection = state.collections.find(c => c.id === state.currentCollectionId);
        if (collection) collection.name = newName;
        autoSyncPush();
    }
}

// ============================================
// Item Operations
// ============================================
async function addCurrentPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const item = {
        type: 'webpage',
        url: tab.url,
        title: tab.title,
        faviconUrl: tab.favIconUrl || ''
    };

    const response = await sendMessage({
        action: 'addItem',
        collectionId: state.currentCollectionId,
        item
    });

    if (response.success) {
        state.currentItems.unshift(response.data);
        renderItems();
        autoSyncPush();
    }
}

async function addNote() {
    showModal(elements.modalNote);
    elements.noteInput.value = '';
    elements.noteInput.focus();
}

async function saveNote() {
    const content = elements.noteInput.value.trim();
    if (!content) return;

    const response = await sendMessage({
        action: 'addItem',
        collectionId: state.currentCollectionId,
        item: { type: 'note', content }
    });

    if (response.success) {
        state.currentItems.unshift(response.data);
        renderItems();
        hideModal(elements.modalNote);
        autoSyncPush();
    }
}

async function deleteItem(itemId) {
    const response = await sendMessage({
        action: 'removeItem',
        collectionId: state.currentCollectionId,
        itemId
    });

    if (response.success) {
        state.currentItems = state.currentItems.filter(i => i.id !== itemId);
        renderItems();
        autoSyncPush();
    }
}

async function updateItem(itemId, updates) {
    const response = await sendMessage({
        action: 'updateItem',
        collectionId: state.currentCollectionId,
        itemId,
        updates
    });

    if (response.success) {
        const index = state.currentItems.findIndex(i => i.id === itemId);
        if (index !== -1) {
            state.currentItems[index] = response.data;
            renderItems();
        }
        autoSyncPush();
    }
}

async function addItemMemo(itemId) {
    const item = state.currentItems.find(i => i.id === itemId);
    if (!item) return;

    const currentMemo = item.memo || '';
    const memo = prompt('メモを入力:', currentMemo);

    if (memo !== null) {
        await updateItem(itemId, { memo });
    }
}

async function renameItem(itemId) {
    const item = state.currentItems.find(i => i.id === itemId);
    if (!item) return;

    const currentTitle = item.title || '';
    const newTitle = prompt('名前を変更:', currentTitle);

    if (newTitle !== null && newTitle.trim() !== '') {
        await updateItem(itemId, { title: newTitle.trim() });
    }
}

async function openAllLinks() {
    if (state.currentItems.length === 0) return;

    const urls = state.currentItems
        .filter(i => i.url || i.sourceUrl)
        .map(i => i.url || i.sourceUrl);

    if (urls.length === 0) {
        alert('開けるリンクがありません');
        return;
    }

    if (!confirm(`${urls.length}個のリンクをすべて開きますか？`)) return;

    urls.forEach(url => {
        chrome.tabs.create({ url, active: false });
    });
}

// ============================================
// Drag and Drop
// ============================================
async function saveNewOrder(itemIds) {
    await sendMessage({
        action: 'reorderItems',
        collectionId: state.currentCollectionId,
        itemIds
    });

    const itemMap = new Map(state.currentItems.map(i => [i.id, i]));
    state.currentItems = itemIds.map(id => itemMap.get(id)).filter(Boolean);
    autoSyncPush();
}

// ============================================
// Settings & Sync
// ============================================
async function loadSettings() {
    const response = await sendMessage({ action: 'getSettings' });
    if (response.success) {
        state.settings = response.data;
        applyDisplaySettings();
    }
}

async function updateSettingsUI() {
    const result = await chrome.storage.local.get('last_sync_time');
    if (result.last_sync_time) {
        const date = new Date(result.last_sync_time);
        elements.lastSyncTime.textContent = `最終同期: ${date.toLocaleString('ja-JP')}`;
    } else {
        elements.lastSyncTime.textContent = '';
    }

    if (elements.settingTileWidth) {
        const tileWidth = state.settings.tileMinWidth || 140;
        elements.settingTileWidth.value = tileWidth;
        elements.tileWidthValue.textContent = tileWidth;
    }
    if (elements.settingSaveWidth) {
        const saveWidth = state.settings.imageSaveWidth || 350;
        elements.settingSaveWidth.value = saveWidth;
        elements.saveWidthValue.textContent = saveWidth;
    }

    applyDisplaySettings();
}

function applyDisplaySettings() {
    const tileWidth = state.settings.tileMinWidth || 140;
    document.documentElement.style.setProperty('--tile-min-width', `${tileWidth}px`);
}

function openSettings() {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('options.html'));
    }
}

function exportToJson() {
    sendMessage({ action: 'exportToJson' }).then(response => {
        if (response.success) {
            downloadFile(response.data, 'collections_backup.json', 'application/json');
        }
    });
}

function exportToCsv() {
    alert('CSVエクスポート機能は未実装です');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function importFromJson(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result;
        const response = await sendMessage({ action: 'importFromJson', data: content });
        if (response.success) {
            alert('インポートが完了しました');
            loadCollections();
        }
    };
    reader.readAsText(file);
}

// ============================================
// Folder Sync
// ============================================
async function selectFolder() {
    const response = await sendMessage({ action: 'selectFolder' });
    if (response.success) {
        await checkFolderSyncStatus();
    }
}

async function pushToFolder() {
    await sendMessage({ action: 'pushToFolder' });
}

async function pullFromFolder() {
    await sendMessage({ action: 'pullFromFolder' });
    await loadCollections();
}

async function unlinkFolder() {
    if (confirm('フォルダ連携を解除しますか？')) {
        await sendMessage({ action: 'unlinkFolder' });
        await checkFolderSyncStatus();
    }
}

async function checkFolderSyncStatus() {
    const response = await sendMessage({ action: 'checkFolderSyncStatus' });
    if (response.success && response.enabled) {
        elements.selectedFolderInfo.style.display = 'block';
        elements.folderSyncActions.style.display = 'block';
    } else {
        elements.selectedFolderInfo.style.display = 'none';
        elements.folderSyncActions.style.display = 'none';
    }
}

function autoSyncPush() {
    sendMessage({ action: 'autoSyncPush' });
}

async function autoSyncPull() {
    await sendMessage({ action: 'autoSyncPull' });
    await loadCollections();
}

// ============================================
// Initialization
// ============================================
async function init() {
    initElements();
    initEvents({
        createCollection,
        renderCollectionsList,
        addCurrentPage,
        addNote,
        openAllLinks,
        updateCollectionName,
        saveNote,
        deleteCurrentCollection,
        openSettings,
        exportToJson,
        saveSettings: (settings) => sendMessage({ action: 'saveSettings', settings }),
        loadCollections,
        openCollection,
        downloadFile,
        exportToCsv,
        importFromJson,
        selectFolder,
        pushToFolder,
        pullFromFolder,
        unlinkFolder,
        toggleLayout,
        addItemMemo,
        renameItem,
        deleteItem
    });

    await loadSettings();
    await loadCollections();
    await checkFolderSyncStatus();
    showView('list');

    autoSyncPull();
}

document.addEventListener('DOMContentLoaded', init);
