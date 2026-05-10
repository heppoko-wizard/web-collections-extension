// js/panel-actions.js

/**
 * panel-actions.js - UIからの操作（アクション）を処理する
 * 背景（background.js）への通信や状態更新をオーケストレーションする
 */

import { state, updateState } from './panel-state.js';
import * as Render from './panel-render.js';
import { elements, showView, showModal, hideModal } from './panel-ui.js';
import { migrateDataToUUIDs } from './migration.js';

// Message API Helper
async function sendMessage(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                console.error('sendMessage error:', chrome.runtime.lastError);
                resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
                resolve(response);
            }
        });
    });
}

export async function loadCollections() {
    const response = await sendMessage({ action: 'getCollections' });
    if (response.success) {
        state.collections = response.data;
        Render.renderCollectionsList(elements, openCollection);
    }
}

export async function createCollection() {
    const name = prompt('コレクション名を入力:', '新しいコレクション');
    if (name) {
        const response = await sendMessage({ action: 'createCollection', name });
        if (response.success) {
            state.collections.unshift(response.data);
            Render.renderCollectionsList(elements, openCollection);
            openCollection(response.data.id);
            autoSyncPush();
        }
    }
}

export async function openCollection(id) {
    state.currentCollectionId = id;
    showView('detail');
    const response = await sendMessage({ action: 'getItemsByCollection', collectionId: id });
    if (response.success) {
        state.currentItems = response.data;
    } else {
        state.currentItems = [];
    }
    Render.renderItems(elements, null); // drag-drop will be re-init by Render if needed
}

export async function deleteCurrentCollection() {
    if (!confirm('このコレクションを削除しますか？')) return;

    const response = await sendMessage({
        action: 'deleteCollection',
        id: state.currentCollectionId
    });

    if (response.success) {
        state.collections = state.collections.filter(c => c.id !== state.currentCollectionId);
        state.currentCollectionId = null;
        showView('list');
        Render.renderCollectionsList(elements, openCollection);
        hideModal(elements.modalCollectionMenu);
        autoSyncPush();
    }
}

export async function updateCollectionName() {
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

export async function addCurrentPage() {
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
        Render.renderItems(elements, null);
        autoSyncPush();
    }
}

export async function addNote() {
    showModal(elements.modalNote);
    elements.noteInput.value = '';
    elements.noteInput.focus();
}

export async function saveNote() {
    const content = elements.noteInput.value.trim();
    if (!content) return;

    const response = await sendMessage({
        action: 'addItem',
        collectionId: state.currentCollectionId,
        item: { type: 'note', content }
    });

    if (response.success) {
        state.currentItems.unshift(response.data);
        Render.renderItems(elements, null);
        hideModal(elements.modalNote);
        autoSyncPush();
    }
}

export async function deleteItem(itemId) {
    const response = await sendMessage({
        action: 'removeItem',
        collectionId: state.currentCollectionId,
        itemId
    });

    if (response.success) {
        state.currentItems = state.currentItems.filter(i => i.id !== itemId);
        Render.renderItems(elements, null);
        autoSyncPush();
    }
}

export async function updateItem(itemId, updates) {
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
            Render.renderItems(elements, null);
        }
        autoSyncPush();
    }
}

export async function addItemMemo(itemId) {
    const item = state.currentItems.find(i => i.id === itemId);
    if (!item) return;

    const currentMemo = item.memo || '';
    const memo = prompt('メモを入力:', currentMemo);

    if (memo !== null) {
        await updateItem(itemId, { memo });
    }
}

export async function renameItem(itemId) {
    const item = state.currentItems.find(i => i.id === itemId);
    if (!item) return;

    const currentTitle = item.title || '';
    const newTitle = prompt('名前を変更:', currentTitle);

    if (newTitle !== null && newTitle.trim() !== '') {
        await updateItem(itemId, { title: newTitle.trim() });
    }
}

export async function openAllLinks() {
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

export async function saveNewOrder(itemIds) {
    await sendMessage({
        action: 'reorderItems',
        collectionId: state.currentCollectionId,
        itemIds
    });

    const itemMap = new Map(state.currentItems.map(i => [i.id, i]));
    state.currentItems = itemIds.map(id => itemMap.get(id)).filter(Boolean);
    autoSyncPush();
}

export async function loadSettings() {
    const response = await sendMessage({ action: 'getSettings' });
    if (response.success) {
        state.settings = response.data;
        applyDisplaySettings();
    }
}

export async function updateSettingsUI() {
    const response = await sendMessage({ action: 'getSettings' });
    const settings = response.data || {};
    
    if (settings.lastSyncTime) {
        const date = new Date(settings.lastSyncTime);
        elements.lastSyncTime.textContent = `最終同期: ${date.toLocaleString('ja-JP')}`;
    } else {
        elements.lastSyncTime.textContent = '';
    }

    if (elements.settingTileWidth) {
        const tileWidth = settings.tileMinWidth || 140;
        elements.settingTileWidth.value = tileWidth;
        elements.tileWidthValue.textContent = tileWidth;
    }
    if (elements.settingSaveWidth) {
        const saveWidth = settings.imageSaveWidth || 350;
        elements.settingSaveWidth.value = saveWidth;
        elements.saveWidthValue.textContent = saveWidth;
    }

    applyDisplaySettings();
}

export function applyDisplaySettings() {
    const tileWidth = state.settings.tileMinWidth || 140;
    document.documentElement.style.setProperty('--tile-min-width', `${tileWidth}px`);
}

export function openSettings() {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('options.html'));
    }
}

export function exportToJson() {
    sendMessage({ action: 'exportToJson' }).then(response => {
        if (response.success) {
            downloadFile(response.data, 'collections_backup.json', 'application/json');
        }
    });
}

export function exportToCsv() {
    alert('CSVエクスポート機能は未実装です');
}

export function downloadFile(content, filename, mimeType) {
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

export async function importFromJson(file) {
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

export async function selectFolder() {
    const response = await sendMessage({ action: 'selectFolder' });
    if (response.success) {
        await checkFolderSyncStatus();
    }
}

export async function pushToFolder() {
    await sendMessage({ action: 'pushToFolder' });
}

export async function pullFromFolder() {
    await sendMessage({ action: 'pullFromFolder' });
    await loadCollections();
}

export async function unlinkFolder() {
    if (confirm('フォルダ連携を解除しますか？')) {
        await sendMessage({ action: 'unlinkFolder' });
        await checkFolderSyncStatus();
    }
}

export async function checkFolderSyncStatus() {
    const response = await sendMessage({ action: 'checkFolderSyncStatus' });
    if (response.success && response.enabled) {
        elements.selectedFolderInfo.style.display = 'block';
        elements.folderSyncActions.style.display = 'block';
    } else {
        elements.selectedFolderInfo.style.display = 'none';
        elements.folderSyncActions.style.display = 'none';
    }
}

export function autoSyncPush() {
    sendMessage({ action: 'autoSyncPush' });
}

export async function autoSyncPull() {
    await sendMessage({ action: 'autoSyncPull' });
    await loadCollections();
}

export function toggleLayout() {
    state.layoutMode = state.layoutMode === 'list' ? 'grid' : 'list';
    Render.renderItems(elements, null);
}

/**
 * UUIDへのマイグレーションを実行
 */
export async function initUUIDMigration() {
    const result = await chrome.storage.local.get('uuid_migration_completed');
    if (result.uuid_migration_completed) return;

    console.log('Running UUID migration...');
    
    // 全データを取得してマイグレーション
    const response = await sendMessage({ action: 'exportJson' });
    if (response.success) {
        const data = JSON.parse(response.data);
        
        // コレクションIDをUUID化
        data.collections = migrateDataToUUIDs(data.collections);
        
        // アイテムIDもUUID化
        data.collections.forEach(col => {
            if (col.items) {
                col.items = migrateDataToUUIDs(col.items);
                // アイテム内のcollectionIdも更新
                col.items.forEach(item => item.collectionId = col.id);
            }
        });

        // 保存し直す
        await sendMessage({ action: 'importJson', data: JSON.stringify(data) });
        await chrome.storage.local.set({ uuid_migration_completed: true });
        console.log('UUID migration completed.');
    }
}
