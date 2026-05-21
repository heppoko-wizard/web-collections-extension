// js/panel-actions.js

/**
 * panel-actions.js - UIからの操作（アクション）を処理する
 * 背景（background.js）への通信や状態更新をオーケストレーションする
 */

import { state, updateState } from './panel-state.js';
import * as Render from './panel-render.js';
import { elements, showView, showModal, hideModal } from './panel-ui.js';
import { initDragDrop } from './panel-dragdrop.js';

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
    
    if (elements.lastSyncTime) {
        if (settings.lastSyncTime) {
            const date = new Date(settings.lastSyncTime);
            elements.lastSyncTime.textContent = `最終同期: ${date.toLocaleString('ja-JP')}`;
        } else {
            elements.lastSyncTime.textContent = '';
        }
    }

    if (elements.settingTileWidth) {
        const tileWidth = settings.tileMinWidth || 140;
        elements.settingTileWidth.value = tileWidth;
        if (elements.tileWidthValue) {
            elements.tileWidthValue.textContent = tileWidth;
        }
    }

    if (elements.settingBookmarkRoot) {
        const folderResponse = await sendMessage({ action: 'getBookmarkFolders' });
        if (folderResponse.success) {
            elements.settingBookmarkRoot.innerHTML = '';
            
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '[WC] Web Collections (デフォルト)';
            elements.settingBookmarkRoot.appendChild(defaultOpt);

            folderResponse.data.forEach(folder => {
                const opt = document.createElement('option');
                opt.value = folder.id;
                opt.textContent = folder.title;
                if (settings.bookmarkRootId === folder.id) {
                    opt.selected = true;
                }
                elements.settingBookmarkRoot.appendChild(opt);
            });
        } else {
            console.error('Failed to load bookmark folders:', folderResponse.error);
        }
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

export async function importFromText() {
    const content = elements.importJsonTextarea.value.trim();
    if (!content) {
        alert('インポートするJSONを入力してください');
        return;
    }

    try {
        JSON.parse(content);
    } catch (e) {
        alert('JSONの形式が正しくありません');
        return;
    }

    if (!confirm('既存のデータはすべて上書きされます。インポートを実行しますか？')) {
        return;
    }

    const response = await sendMessage({ action: 'importFromJson', data: content });
    if (response.success) {
        alert('インポートが完了しました');
        elements.importJsonTextarea.value = '';
        loadCollections();
    } else {
        alert('インポートに失敗しました: ' + response.error);
    }
}

export async function rebuildFromBookmarks() {
    if (!confirm('ローカルのコレクションデータを一度すべてクリアし、現在のブックマークフォルダから最新のデータセットを引き込んで再構築します。実行しますか？')) {
        return;
    }

    try {
        // 1. ローカルストレージをクリア
        await chrome.storage.local.set({ wc_collections: [] });

        // 2. ブックマークからPullを実行
        const pullResponse = await sendMessage({ action: 'autoSyncPull' });

        if (pullResponse.success) {
            // 3. UIの読み込みと更新
            await loadCollections();
            alert('ブックマークからの再構築が完了しました');
        } else {
            alert('再構築に失敗しました: ' + pullResponse.error);
        }
    } catch (error) {
        console.error('Rebuild failed:', error);
        alert('エラーが発生しました: ' + error.message);
    }
}

export async function autoSyncPull() {
    try {
        const pullResponse = await sendMessage({ action: 'autoSyncPull' });
        if (pullResponse.success && pullResponse.updated) {
            await loadCollections();
            console.log('Auto-sync: Pulled from bookmarks and updated UI');
        }
    } catch (error) {
        console.warn('Auto-sync pull failed:', error);
    }
}

export function toggleLayout() {
    state.layoutMode = state.layoutMode === 'list' ? 'grid' : 'list';
    Render.renderItems(elements, () => initDragDrop(elements, saveNewOrder));
}

export async function saveSettings(settings) {
    const response = await sendMessage({
        action: 'saveSettings',
        settings
    });
    if (response.success) {
        state.settings = settings;
    }
}

export async function syncPush() {
    await sendMessage({ action: 'syncPush' });
}

export async function copyCollectionJson() {
    const response = await sendMessage({
        action: 'exportCollection',
        id: state.currentCollectionId
    });

    if (response.success && response.data) {
        const jsonStr = JSON.stringify(response.data, null, 2);
        try {
            await navigator.clipboard.writeText(jsonStr);
            alert('クリップボードにコピーしました');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('コピーに失敗しました');
        }
    } else {
        alert('データの取得に失敗しました');
    }
    hideModal(elements.modalCollectionMenu);
}
