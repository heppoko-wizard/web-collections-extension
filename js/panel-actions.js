// js/panel-actions.js

/**
 * panel-actions.js - UIからの操作（アクション）を処理する
 * 背景（background.js）への通信や状態更新をオーケストレーションする
 */

import { state, updateState } from './panel-state.js';
import * as Render from './panel-render.js';
import { elements, showView, showModal, hideModal } from './panel-ui.js';
import { migrateDataToUUIDs, purgeBase64Images } from './migration.js';
import { FolderSync } from './folder-sync.js';
import { initDragDrop } from './panel-dragdrop.js';
import { DeviceManager } from './device-manager.js';

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

export async function showCreateCollectionModal() {
    showModal(elements.modalCreateCollection);
    elements.createCollectionInput.value = '';
    elements.createCollectionInput.focus();
}

export async function saveNewCollection() {
    const name = elements.createCollectionInput.value.trim();
    if (!name) return;

    const response = await sendMessage({ action: 'createCollection', name });
    if (response.success) {
        state.collections.unshift(response.data);
        Render.renderCollectionsList(elements, openCollection);
        hideModal(elements.modalCreateCollection);
        openCollection(response.data.id);

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
    Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));
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
        Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));
    }
    }

    export async function addAllTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // Filter out internal/empty pages
    const targetTabs = tabs.filter(tab => tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://'));

    if (targetTabs.length === 0) return;

    if (!confirm(`${targetTabs.length}個のタブをこのコレクションに追加しますか？`)) return;

    let addedCount = 0;
    for (const tab of targetTabs) {
        const itemData = {
            type: 'webpage',
            url: tab.url,
            title: tab.title,
            faviconUrl: tab.favIconUrl || ''
        };

        const response = await sendMessage({
            action: 'addItem',
            collectionId: state.currentCollectionId,
            item: itemData
        });

        if (response.success) {
            state.currentItems.unshift(response.data);
            addedCount++;
        }
    }

    if (addedCount > 0) {
        Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));
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
        Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));
        hideModal(elements.modalNote);

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
        Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));

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
            Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));
        }

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

}

export async function loadSettings() {
    const response = await sendMessage({ action: 'getSettings' });
    if (response.success) {
        state.settings = response.data;
        applyDisplaySettings();
        
        // Theme init
        let theme = state.settings.theme;
        if (!theme) {
            theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        applyTheme(theme);
    }
}

export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
        elements.iconSun.style.display = 'block';
        elements.iconMoon.style.display = 'none';
    } else {
        elements.iconSun.style.display = 'none';
        elements.iconMoon.style.display = 'block';
    }
}

export async function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    
    // Save to settings
    await sendMessage({
        action: 'saveSettings',
        settings: { ...state.settings, theme: newTheme }
    });
    state.settings.theme = newTheme;
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

    // デバイス名の表示
    if (elements.displayDeviceName) {
        const deviceInfo = await DeviceManager.getDeviceInfo();
        elements.displayDeviceName.textContent = `${deviceInfo.deviceName} (${deviceInfo.deviceId})`;
    }

    // 同期モードの表示
    if (elements.settingSyncMode) {
        elements.settingSyncMode.value = settings.syncMode || 'folder';
        updateSyncModeUI(settings.syncMode || 'folder');
    }

    applyDisplaySettings();
    }

    function updateSyncModeUI(mode) {
    if (mode === 'folder') {
        elements.sectionFolderSync.style.display = 'block';
        elements.syncModeHint.textContent = 'OneDriveやGoogle Driveの同期フォルダを使用して、デバイス間でデータを共有します。';
    } else {
        elements.sectionFolderSync.style.display = 'none';
        elements.syncModeHint.textContent = 'Chrome標準のブックマーク同期機能を使用して、設定不要でデータを共有します。';
    }
    }

    export async function saveSyncMode() {
    const mode = elements.settingSyncMode.value;
    const response = await sendMessage({ action: 'getSettings' });
    const settings = response.data || {};
    settings.syncMode = mode;
    await sendMessage({ action: 'saveSettings', settings });
    updateSyncModeUI(mode);
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
    try {
        const handle = await FolderSync.requestDirectoryAccess();
        if (handle) {
            await checkFolderSyncStatus();
        }
    } catch (error) {
        console.error('Folder selection failed:', error);
        alert('フォルダの選択に失敗しました: ' + error.message);
    }
}

export async function syncAll() {
    try {
        if (elements.btnSyncAll) elements.btnSyncAll.classList.add('rotating');
        if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '同期中...';
        
        // 1. Pull (Import)
        const pullResponse = await sendMessage({ action: 'autoSyncPull' });
        if (pullResponse.success && pullResponse.updated) {
            await loadCollections();
        }
        
        // 2. Push (Export)
        const pushResponse = await sendMessage({ action: 'syncPush' });
        
        if (pullResponse.success && pushResponse.success) {
            if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '✅ 同期完了';
            // 通知は控えめに（ステータスバーのみ）
        } else {
            const error = pullResponse.error || pushResponse.error;
            throw new Error(error);
        }
    } catch (error) {
        console.error('Sync all failed:', error);
        if (error.message === 'PermissionDenied') {
            await checkFolderSyncStatus();
        } else {
            if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '❌ 同期失敗';
            alert('同期に失敗しました: ' + error.message);
        }
    } finally {
        if (elements.btnSyncAll) {
            setTimeout(() => {
                elements.btnSyncAll.classList.remove('rotating');
            }, 500);
        }
    }
}

export async function pushToFolder() {
    try {
        if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = 'エクスポート中...';
        const response = await sendMessage({ action: 'syncPush' });
        if (response.success) {
            if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '✅ エクスポート完了';
            alert('エクスポートが完了しました');
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Push to folder failed:', error);
        if (error.message === 'PermissionDenied') {
            await checkFolderSyncStatus(); // UIを更新して再許可ボタンを出す
        } else {
            if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '❌ エクスポート失敗';
            alert('エクスポートに失敗しました: ' + error.message);
        }
    }
}

export async function pullFromFolder() {
    try {
        if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = 'インポート中...';
        const response = await sendMessage({ action: 'autoSyncPull' });
        if (response.success) {
            if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '✅ インポート完了';
            alert('インポートが完了しました');
            if (response.updated) await loadCollections();
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Pull from folder failed:', error);
        if (error.message === 'PermissionDenied') {
            await checkFolderSyncStatus(); // UIを更新して再許可ボタンを出す
        } else {
            if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '❌ インポート失敗';
            alert('インポートに失敗しました: ' + error.message);
        }
    }
}

export async function unlinkFolder() {
    if (confirm('フォルダ連携を解除しますか？')) {
        await FolderSync.clearSavedHandle();
        await checkFolderSyncStatus();
    }
}

export async function grantFolderPermission() {
    try {
        const handle = await FolderSync.getSavedDirectoryHandle();
        if (handle) {
            const granted = await FolderSync.verifyPermission(handle, true);
            if (granted) {
                await checkFolderSyncStatus();
                alert('フォルダへのアクセス権限を復旧しました。');
            }
        }
    } catch (error) {
        console.error('Grant permission failed:', error);
    }
}

export async function checkFolderSyncStatus() {
    try {
        const handle = await FolderSync.getSavedDirectoryHandle();
        const exists = !!handle;
        
        if (exists) {
            elements.selectedFolderInfo.style.display = 'flex';
            elements.folderSyncActions.style.display = 'block';
            
            // 権限があるか確認（UIを妨げない）
            const hasAccess = await FolderSync.hasPermission(handle, true);
            if (hasAccess) {
                elements.btnGrantPermission.style.display = 'none';
                if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '✅ フォルダへのアクセス権限があります。';
            } else {
                elements.btnGrantPermission.style.display = 'flex';
                if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '⚠️ 権限が切れています。「再許可」を押してください。';
            }
        } else {
            elements.selectedFolderInfo.style.display = 'none';
            elements.folderSyncActions.style.display = 'none';
            if (elements.folderSyncStatus) elements.folderSyncStatus.textContent = '';
        }
    } catch (error) {
        console.error('Failed to check folder sync status:', error);
    }
}

/**
 * 起動時などに自動的にフォルダから最新データをロードする
 */
export async function autoSyncPull() {
    try {
        const handle = await FolderSync.getSavedDirectoryHandle();
        if (handle && await FolderSync.hasPermission(handle, false)) {
            const response = await sendMessage({ action: 'autoSyncPull' });
            if (response.success && response.updated) {
                await loadCollections();
                console.log('Auto-sync: Pulled from folder and updated UI');
            } else if (!response.success && response.error === 'PermissionDenied') {
                await checkFolderSyncStatus(); // UIを更新して再許可ボタンを出す
            }
        }
    } catch (error) {
        console.warn('Auto-sync pull skipped or failed:', error);
    }
}

export function toggleLayout() {
    state.layoutMode = state.layoutMode === 'list' ? 'grid' : 'list';
    Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));
}

/**
 * UUIDへのマイグレーションおよびBase64画像のパージを実行
 */
export async function initUUIDMigration() {
    const result = await chrome.storage.local.get('uuid_migration_completed_v2');
    if (result.uuid_migration_completed_v2) return;

    console.log('Running UUID migration and Base64 purge...');
    
    // 全データを取得してマイグレーション
    const response = await sendMessage({ action: 'exportJson' });
    if (response.success) {
        const data = JSON.parse(response.data);
        
        // 1. コレクションIDをUUID化
        data.collections = migrateDataToUUIDs(data.collections);
        
        // 2. アイテムIDもUUID化 & Base64パージ
        data.collections.forEach(col => {
            if (col.items) {
                // UUID化
                col.items = migrateDataToUUIDs(col.items);
                // Base64パージ
                col.items = purgeBase64Images(col.items);
                
                // アイテム内のcollectionIdも更新
                col.items.forEach(item => item.collectionId = col.id);
            }
        });

        // 3. 保存し直す
        await sendMessage({ action: 'importJson', data: JSON.stringify(data) });
        await chrome.storage.local.set({ uuid_migration_completed_v2: true });
        console.log('Migration v2 completed.');
    }
}
