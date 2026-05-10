/**
 * panel.js - サイドパネルUIロジック
 * コレクションの表示・操作・同期を管理
 */

import { state, updateState, subscribe, notify } from './panel-state.js';
import * as Render from './panel-render.js';

// ============================================
// State Management
// ============================================
// state is now imported from panel-state.js

// Virtual Scroll Constants
const ITEM_HEIGHT_LIST = 100; // px
const ITEM_HEIGHT_GRID = 220; // px
const BUFFER_SIZE = 20; // items

// ============================================
// DOM Elements
// ============================================
const elements = {};

function initElements() {
    elements.viewList = document.getElementById('view-list');
    elements.viewDetail = document.getElementById('view-detail');
    elements.viewSettings = document.getElementById('view-settings');
    elements.collectionsContainer = document.getElementById('collections-container');
    elements.itemsContainer = document.getElementById('items-container');
    elements.itemsList = document.getElementById('items-list');
    elements.virtualScrollSpacer = document.getElementById('virtual-scroll-spacer');
    elements.collectionTitle = document.getElementById('collection-title');

    // Buttons
    // Buttons
    elements.btnNewCollection = document.getElementById('btn-new-collection');
    elements.btnSettings = document.getElementById('btn-settings');
    elements.btnBack = document.getElementById('btn-back');
    elements.btnBackSettings = document.getElementById('btn-back-settings');
    elements.btnAddPage = document.getElementById('btn-add-page');
    elements.btnAddNote = document.getElementById('btn-add-note');
    elements.btnOpenAll = document.getElementById('btn-open-all');
    elements.btnCollectionMenu = document.getElementById('btn-collection-menu');
    elements.btnLayoutToggle = document.getElementById('btn-layout-toggle');

    // Settings
    elements.btnOpenSettings = document.getElementById('btn-open-settings');
    elements.btnSyncNow = document.getElementById('btn-sync-now');
    elements.lastSyncTime = document.getElementById('last-sync-time');
    elements.btnExportJson = document.getElementById('btn-export-json');
    elements.btnExportCsv = document.getElementById('btn-export-csv');
    elements.importFile = document.getElementById('import-file');

    // Folder Sync Elements
    elements.btnSelectFolder = document.getElementById('btn-select-folder');
    elements.selectedFolderInfo = document.getElementById('selected-folder-info');
    elements.folderSyncActions = document.getElementById('folder-sync-actions');
    elements.btnFolderSyncPush = document.getElementById('btn-folder-sync-push');
    elements.btnFolderSyncPull = document.getElementById('btn-folder-sync-pull');
    elements.btnFolderUnlink = document.getElementById('btn-folder-unlink');
    elements.folderSyncStatus = document.getElementById('folder-sync-status');

    // New Settings Inputs
    elements.settingTileWidth = document.getElementById('setting-tile-width');
    elements.tileWidthValue = document.getElementById('tile-width-value');
    elements.settingSaveWidth = document.getElementById('setting-save-width');
    elements.saveWidthValue = document.getElementById('save-width-value');

    // Modals
    elements.modalNote = document.getElementById('modal-note');
    elements.noteInput = document.getElementById('note-input');
    elements.btnNoteSave = document.getElementById('btn-note-save');
    elements.btnNoteCancel = document.getElementById('btn-note-cancel');
    elements.modalCollectionMenu = document.getElementById('modal-collection-menu');
    elements.btnDeleteCollection = document.getElementById('btn-delete-collection');
    elements.btnExportCollection = document.getElementById('btn-export-collection');
    elements.btnMenuCancel = document.getElementById('btn-menu-cancel');
}

// ============================================
// Message API Helper
// ============================================
async function sendMessage(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, resolve);
    });
}

// ============================================
// View Switching
// ============================================
function showView(viewName) {
    state.currentView = viewName;
    elements.viewList.classList.remove('active');
    elements.viewDetail.classList.remove('active');
    elements.viewSettings.classList.remove('active');

    switch (viewName) {
        case 'list':
            elements.viewList.classList.add('active');
            break;
        case 'detail':
            elements.viewDetail.classList.add('active');
            break;
        case 'settings':
            elements.viewSettings.classList.add('active');
            updateSettingsUI();
            break;
    }
}

// ============================================
// Rendering (Proxied to Render module)
// ============================================
function renderCollectionsList() {
    Render.renderCollectionsList(elements, openCollection);
}

function renderItems() {
    Render.renderItems(elements, setupDragAndDrop);

    const scrollContainer = elements.itemsContainer;
    // Attach scroll listener if not already attached
    if (!scrollContainer.dataset.hasScrollListener) {
        scrollContainer.addEventListener('scroll', () => {
            Render.renderVisibleItems(elements);
        });
        scrollContainer.dataset.hasScrollListener = 'true';

        // Add event delegation for item actions
        scrollContainer.addEventListener('click', (e) => {
            const target = e.target;
            
            // 1. Item Menu Toggle
            const menuBtn = target.closest('.btn-item-menu');
            if (menuBtn) {
                e.stopPropagation();
                const id = menuBtn.dataset.id;
                // Close others
                elements.itemsList.querySelectorAll('.item-menu-dropdown.active').forEach(m => {
                    if (m.dataset.id !== id) m.classList.remove('active');
                });
                // Toggle this
                const dropdown = elements.itemsList.querySelector(`.item-menu-dropdown[data-id="${id}"]`);
                if (dropdown) dropdown.classList.toggle('active');
                return;
            }

            // 2. Add Memo
            const memoBtn = target.closest('.btn-add-memo');
            if (memoBtn) {
                e.stopPropagation();
                addItemMemo(memoBtn.dataset.id);
                return;
            }

            // 3. Rename
            const renameBtn = target.closest('.btn-rename-item');
            if (renameBtn) {
                e.stopPropagation();
                renameItem(renameBtn.dataset.id);
                return;
            }

            // 4. Delete
            const deleteBtn = target.closest('.btn-delete-item');
            if (deleteBtn) {
                e.stopPropagation();
                deleteItem(deleteBtn.dataset.id);
                return;
            }

            // 5. Item Card Click (Open Link)
            const card = target.closest('.item-card');
            if (card) {
                // Do not trigger if clicking a button or a link or inside menu
                if (target.closest('button') || target.closest('a') || target.closest('.item-menu-dropdown')) {
                    return;
                }
                const item = state.currentItems.find(i => i.id === card.dataset.id);
                if (item) {
                    const url = item.url || item.sourceUrl;
                    if (url) chrome.tabs.create({ url, active: false });
                }
                return;
            }

            // Close all menus when clicking elsewhere
            elements.itemsList.querySelectorAll('.item-menu-dropdown.active').forEach(m => m.classList.remove('active'));
        });
    }
}

function renderVisibleItems() {
    Render.renderVisibleItems(elements);
}

function toggleLayout() {
    state.layoutMode = state.layoutMode === 'list' ? 'grid' : 'list';
    renderItems();
}

function setupEventListeners() {
    // Navigation
    elements.btnNewCollection.addEventListener('click', () => {
        const title = prompt('コレクション名を入力:');
        if (title) createCollection(title);
    });

    elements.btnSettings.addEventListener('click', () => showView('settings'));
    elements.btnBack.addEventListener('click', () => showView('list'));
    elements.btnBackSettings.addEventListener('click', () => showView('list'));

    elements.btnOpenSettings.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    });

    elements.btnOpenAll.addEventListener('click', () => {
        state.currentItems.forEach(item => {
            const url = item.url || item.sourceUrl;
            if (url) chrome.tabs.create({ url, active: false });
        });
    });

    elements.btnCollectionMenu.addEventListener('click', showCollectionMenu);

    if (elements.btnLayoutToggle) {
        elements.btnLayoutToggle.addEventListener('click', toggleLayout);
    }
}

function renderItem(item) {
    return Render.renderItem(item);
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
    // アイテムを遅延ロード
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

    // キャンセル(null)以外の場合、空文字でも更新を行う（メモ削除のため）
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
// ============================================
// Drag and Drop with Auto Scroll
// ============================================
function setupDragAndDrop() {
    const scrollContainer = elements.itemsContainer;
    let draggedElement = null;
    let autoScrollSpeed = 0;
    let animationFrameId = null;

    if (scrollContainer.dataset.hasDragListener) return;

    const startAutoScroll = () => {
        if (autoScrollSpeed !== 0) {
            scrollContainer.scrollBy(0, autoScrollSpeed);
            animationFrameId = requestAnimationFrame(startAutoScroll);
        } else {
            animationFrameId = null;
        }
    };

    const stopAutoScroll = () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        autoScrollSpeed = 0;
    };

    scrollContainer.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.item-card');
        if (card) {
            draggedElement = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            stopAutoScroll();
        }
    });

    scrollContainer.addEventListener('dragend', (e) => {
        const card = e.target.closest('.item-card');
        if (card) {
            card.classList.remove('dragging');
            draggedElement = null;
            stopAutoScroll();
            saveNewOrder();
        }
    });

    scrollContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const card = e.target.closest('.item-card');

        // Auto Scroll Logic
        const containerRect = scrollContainer.getBoundingClientRect();
        const sensitivity = 80;
        const maxSpeed = 20;

        if (e.clientY < containerRect.top + sensitivity) {
            const intensity = (containerRect.top + sensitivity - e.clientY) / sensitivity;
            autoScrollSpeed = -maxSpeed * Math.pow(intensity, 2);
            if (!animationFrameId) startAutoScroll();
        } else if (e.clientY > containerRect.bottom - sensitivity) {
            const intensity = (e.clientY - (containerRect.bottom - sensitivity)) / sensitivity;
            autoScrollSpeed = maxSpeed * Math.pow(intensity, 2);
            if (!animationFrameId) startAutoScroll();
        } else {
            autoScrollSpeed = 0;
        }

        // Reordering Logic
        if (card && draggedElement && card !== draggedElement) {
            const rect = card.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                elements.itemsList.insertBefore(draggedElement, card);
            } else {
                elements.itemsList.insertBefore(draggedElement, card.nextSibling);
            }
        }
    });

    scrollContainer.dataset.hasDragListener = 'true';
}

async function saveNewOrder() {
    const itemIds = Array.from(elements.itemsList.querySelectorAll('.item-card'))
        .map(card => card.dataset.id);

    await sendMessage({
        action: 'reorderItems',
        collectionId: state.currentCollectionId,
        itemIds
    });

    // Update local state
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
    chrome.tabs.create({ url: chrome.runtime.getURL('html/settings.html') });
}

// Gist同期は凍結中
// async function syncNow() { ... }

// ============================================
// Export & Import
// ============================================
async function exportToJson() {
    const response = await sendMessage({ action: 'exportJson' });
    if (response.success) {
        downloadFile(response.data, 'collections.json', 'application/json');
    }
}

function exportToCsv() {
    // CSVエクスポートは現在表示中のコレクションのアイテムのみ対象
    const rows = [['Collection', 'Type', 'Title', 'URL', 'Content', 'Saved At']];
    const collection = state.collections.find(c => c.id === state.currentCollectionId);
    const collectionName = collection?.name || 'Unknown';

    state.currentItems.forEach(item => {
        rows.push([
            collectionName,
            item.type,
            item.title || '',
            item.url || item.sourceUrl || '',
            item.content || '',
            new Date(item.savedAt).toISOString()
        ]);
    });

    const csv = rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    downloadFile(csv, 'collections.csv', 'text/csv');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// Folder Sync Operations
// ============================================
async function selectFolder() {
    try {
        const handle = await FolderSync.requestDirectoryAccess();
        if (handle) {
            state.folderSyncEnabled = true;
            updateFolderSyncUI(true);
            elements.folderSyncStatus.textContent = `選択中: ${handle.name}`;
            elements.folderSyncStatus.className = 'hint success';
            
            // フォルダ選択直後に自動インポートを実行
            await pullFromFolder(false);
        }
    } catch (error) {
        console.error('Folder selection failed:', error);
        elements.folderSyncStatus.textContent = 'フォルダ選択エラー';
        elements.folderSyncStatus.className = 'hint error';
    }
}

async function updateFolderSyncUI(hasHandle) {
    if (hasHandle) {
        elements.selectedFolderInfo.style.display = 'inline-block';
        elements.folderSyncActions.style.display = 'block';
        elements.btnSelectFolder.textContent = '📁 フォルダを変更';
    } else {
        elements.selectedFolderInfo.style.display = 'none';
        elements.folderSyncActions.style.display = 'none';
        elements.btnSelectFolder.textContent = '📁 フォルダを選択';
        elements.folderSyncStatus.textContent = '';
    }
}

/**
 * サイレントモードでの自動Push。UIをブロックせずバックグラウンドで実行する。
 */
function autoSyncPush() {
    if (!state.folderSyncEnabled) return;
    pushToFolder(true).catch(err => console.warn('Auto push failed:', err));
}

/**
 * サイレントモードでの自動Pull。UIをブロックせずバックグラウンドで実行する。
 */
async function autoSyncPull() {
    if (!state.folderSyncEnabled) return;
    try {
        await pullFromFolder(true);
    } catch (err) {
        console.warn('Auto pull failed:', err);
    }
}

async function pushToFolder(silent = false) {
    try {
        elements.btnFolderSyncPush.disabled = true;
        if (!silent) elements.folderSyncStatus.textContent = '同期準備中...';

        const settingsResponse = await sendMessage({ action: 'getSettings' });
        const lastSyncTime = settingsResponse.data?.lastSyncTime || 0;

        // 1. 変更されたコレクションを取得
        const modResponse = await sendMessage({ action: 'getModifiedCollections', since: lastSyncTime });
        const modified = modResponse.data || [];

        if (modified.length === 0) {
            if (!silent) {
                elements.folderSyncStatus.textContent = '変更はありません';
                setTimeout(() => { elements.folderSyncStatus.textContent = ''; }, 2000);
            }
            return;
        }

        // 2. 変更があったコレクションを個別に保存
        for (let i = 0; i < modified.length; i++) {
            const colMeta = modified[i];
            if (!silent) elements.folderSyncStatus.textContent = `エクスポート中 (${i + 1}/${modified.length}): ${colMeta.name}`;
            
            const exportRes = await sendMessage({ action: 'exportCollection', id: colMeta.id });
            if (exportRes.success) {
                const encrypted = await CryptoUtils.encrypt(JSON.stringify(exportRes.data));
                await FolderSync.writeFile(`collection_${colMeta.id}.json`, JSON.stringify(encrypted));
            }
        }

        // 3. マニフェスト（全コレクションのメタデータ）を更新
        if (!silent) elements.folderSyncStatus.textContent = 'マニフェスト更新中...';

        // 3-1. クラウド側のマニフェストを取得してマージ
        let cloudManifest = [];
        try {
            const fileContent = await FolderSync.readFile('manifest.json');
            try {
                const encryptedData = JSON.parse(fileContent);
                const manifestJson = await CryptoUtils.decrypt(encryptedData.encrypted, encryptedData.iv);
                cloudManifest = JSON.parse(manifestJson);
            } catch (decryptError) {
                throw new Error('クラウドの manifest.json の復号に失敗しました。キーが異なるため上書きを中止します。');
            }
        } catch (e) {
            if (e.message.includes('復号に失敗')) {
                throw e; // 復号エラーは致命的なため処理を中断する
            }
            console.warn('Failed to load cloud manifest for merging. Creating new.', e);
        }

        const allColsRes = await sendMessage({ action: 'getCollections', includeDeleted: true });
        const localCollections = allColsRes.data;

        const mergedMap = new Map();
        // クラウド側を登録
        cloudManifest.forEach(c => mergedMap.set(c.id, c));
        // ローカル側で上書き・追加
        localCollections.forEach(l => {
            const existing = mergedMap.get(l.id);
            if (!existing || (l.updatedAt || 0) >= (existing.updatedAt || 0)) {
                mergedMap.set(l.id, {
                    id: l.id,
                    name: l.name,
                    updatedAt: l.updatedAt,
                    itemCount: l.itemCount,
                    isDeleted: l.isDeleted || false
                });
            }
        });

        const mergedManifest = Array.from(mergedMap.values());
        const encryptedManifest = await CryptoUtils.encrypt(JSON.stringify(mergedManifest));
        await FolderSync.writeFile('manifest.json', JSON.stringify(encryptedManifest));

        // 4. 同期時刻を保存
        const now = Date.now();
        await sendMessage({ action: 'saveLastSyncTime', time: now });

        if (!silent) {
            elements.folderSyncStatus.textContent = `✅ 同期完了 (${modified.length}件更新)`;
            elements.folderSyncStatus.className = 'hint success';
            setTimeout(() => {
                elements.folderSyncStatus.textContent = '';
            }, 3000);
        } else {
            console.log(`Auto sync push completed: ${modified.length} collections updated`);
        }

    } catch (error) {
        console.error('Push failed:', error);
        elements.folderSyncStatus.textContent = `エラー: ${error.message}`;
        elements.folderSyncStatus.className = 'hint error';
    } finally {
        elements.btnFolderSyncPush.disabled = false;
    }
}

async function pullFromFolder(silent = false) {
    if (!silent && !confirm('フォルダから最新データを同期しますか？')) return;

    try {
        if (!silent) {
            elements.btnFolderSyncPull.disabled = true;
            elements.folderSyncStatus.textContent = 'マニフェスト取得中...';
        }

        // 1. manifest.json 読み込み
        let cloudManifest;
        try {
            const fileContent = await FolderSync.readFile('manifest.json');
            try {
                const encryptedData = JSON.parse(fileContent);
                const manifestJson = await CryptoUtils.decrypt(encryptedData.encrypted, encryptedData.iv);
                cloudManifest = JSON.parse(manifestJson);
            } catch (decryptError) {
                console.error('Decryption failed for manifest.json:', decryptError);
                throw new Error('復号に失敗しました。別のキーで暗号化されている可能性があります。');
            }
        } catch (e) {
            console.warn('Failed to load manifest.json:', e);
            if (e.message.includes('復号に失敗')) {
                throw e; // 復号エラーはそのまま投げる
            }
            if (silent) return; // サイレントモードではまだ同期データが無い場合は静かに終了
            throw new Error('同期データが見つかりません (manifest.json)');
        }

        // 2. ローカルの状態と比較
        const allColsRes = await sendMessage({ action: 'getCollections', includeDeleted: true });
        const localCollections = allColsRes.data;

        const toUpdate = cloudManifest.filter(cloudCol => {
            const localCol = localCollections.find(l => l.id === cloudCol.id);
            return !localCol || (cloudCol.updatedAt || 0) > (localCol.updatedAt || 0);
        });

        if (toUpdate.length === 0) {
            if (!silent) {
                elements.folderSyncStatus.textContent = 'データは最新です';
                setTimeout(() => { elements.folderSyncStatus.textContent = ''; }, 2000);
            }
            return;
        }

        // 3. 必要なコレクションのみインポート
        for (let i = 0; i < toUpdate.length; i++) {
            const colMeta = toUpdate[i];
            if (!silent) elements.folderSyncStatus.textContent = `同期中 (${i + 1}/${toUpdate.length}): ${colMeta.name}`;

            try {
                if (colMeta.isDeleted) {
                    await sendMessage({ action: 'deleteCollection', id: colMeta.id });
                    continue;
                }

                const fileContent = await FolderSync.readFile(`collection_${colMeta.id}.json`);
                const encryptedData = JSON.parse(fileContent);
                const decrypted = await CryptoUtils.decrypt(encryptedData.encrypted, encryptedData.iv);
                const colData = JSON.parse(decrypted);

                await sendMessage({ action: 'importCollection', data: colData });
            } catch (err) {
                console.error(`Failed to sync collection ${colMeta.id}:`, err);
            }
        }

        // 4. 同期時刻を更新
        await sendMessage({ action: 'saveLastSyncTime', time: Date.now() });

        // UI更新
        await loadCollections();
        if (state.currentCollectionId) {
            await openCollection(state.currentCollectionId);
        }

        if (!silent) {
            elements.folderSyncStatus.textContent = `✅ 同期完了 (${toUpdate.length}件更新)`;
            elements.folderSyncStatus.className = 'hint success';
            setTimeout(() => { elements.folderSyncStatus.textContent = ''; }, 3000);
        } else {
            console.log(`Auto sync pull completed: ${toUpdate.length} collections updated`);
        }

    } catch (error) {
        console.error('Pull failed:', error);
        if (!silent) {
            elements.folderSyncStatus.textContent = `エラー: ${error.message}`;
            elements.folderSyncStatus.className = 'hint error';
        }
    } finally {
        if (!silent) elements.btnFolderSyncPull.disabled = false;
    }
}

async function unlinkFolder() {
    if (!confirm('このフォルダとの連携を解除しますか？\n(実際のファイルは削除されません)')) return;

    await FolderSync.clearSavedHandle();
    state.folderSyncEnabled = false;
    updateFolderSyncUI(false);
}

async function checkFolderSyncStatus() {
    const handle = await FolderSync.getSavedDirectoryHandle();
    if (handle) {
        state.folderSyncEnabled = true;
        updateFolderSyncUI(true);
        elements.folderSyncStatus.textContent = `選択中: ${handle.name}`;
    } else {
        state.folderSyncEnabled = false;
    }
}

async function importFromJson(file) {
    const text = await file.text();
    const response = await sendMessage({ action: 'importJson', data: text });
    if (response.success) {
        await loadCollections();
        alert('インポートが完了しました！');
    }
}

// ============================================
// Modal Helpers
// ============================================
function showModal(modal) {
    modal.classList.add('active');
}

function hideModal(modal) {
    modal.classList.remove('active');
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // Navigation
    elements.btnNewCollection.addEventListener('click', createCollection);
    elements.btnSettings.addEventListener('click', () => showView('settings'));
    elements.btnBack.addEventListener('click', () => {
        showView('list');
        renderCollectionsList();
    });
    elements.btnBackSettings.addEventListener('click', () => showView('list'));

    // Collection detail
    elements.btnAddPage.addEventListener('click', addCurrentPage);
    elements.btnAddNote.addEventListener('click', addNote);
    elements.btnOpenAll.addEventListener('click', openAllLinks);
    elements.btnCollectionMenu.addEventListener('click', () => showModal(elements.modalCollectionMenu));
    elements.collectionTitle.addEventListener('blur', updateCollectionName);

    // Note modal
    elements.btnNoteSave.addEventListener('click', saveNote);
    elements.btnNoteCancel.addEventListener('click', () => hideModal(elements.modalNote));

    // Collection menu modal
    elements.btnDeleteCollection.addEventListener('click', deleteCurrentCollection);
    elements.btnExportCollection.addEventListener('click', () => {
        const collection = state.collections.find(c => c.id === state.currentCollectionId);
        if (collection) {
            downloadFile(JSON.stringify(collection, null, 2), `${collection.name}.json`, 'application/json');
        }
        hideModal(elements.modalCollectionMenu);
    });
    elements.btnMenuCancel.addEventListener('click', () => hideModal(elements.modalCollectionMenu));

    // Settings
    elements.btnOpenSettings.addEventListener('click', openSettings);
    // elements.btnSyncNow.addEventListener('click', syncNow); // Gist同期凍結中
    elements.btnExportJson.addEventListener('click', exportToJson);

    // Live Preview & Save for Display Settings
    if (elements.settingTileWidth) {
        elements.settingTileWidth.addEventListener('input', (e) => {
            elements.tileWidthValue.textContent = e.target.value;
            // Live preview
            document.documentElement.style.setProperty('--tile-min-width', `${e.target.value}px`);
            // Update state temporarily
            state.settings.tileMinWidth = parseInt(e.target.value, 10);
        });

        elements.settingTileWidth.addEventListener('change', async (e) => {
            // Save on finish
            const newSettings = { ...state.settings, tileMinWidth: parseInt(e.target.value, 10) };
            await sendMessage({ action: 'saveSettings', settings: newSettings });
            state.settings = newSettings;
        });
    }

    if (elements.settingSaveWidth) {
        elements.settingSaveWidth.addEventListener('input', (e) => {
            elements.saveWidthValue.textContent = e.target.value;
            state.settings.imageSaveWidth = parseInt(e.target.value, 10);
        });

        elements.settingSaveWidth.addEventListener('change', async (e) => {
            const newSettings = { ...state.settings, imageSaveWidth: parseInt(e.target.value, 10) };
            await sendMessage({ action: 'saveSettings', settings: newSettings });
            state.settings = newSettings;
        });
    }
    elements.btnExportCsv.addEventListener('click', exportToCsv);
    elements.importFile.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            importFromJson(e.target.files[0]);
        }
    });

    // Folder Sync
    elements.btnSelectFolder.addEventListener('click', selectFolder);
    elements.btnFolderSyncPush.addEventListener('click', pushToFolder);
    elements.btnFolderSyncPull.addEventListener('click', pullFromFolder);
    elements.btnFolderUnlink.addEventListener('click', unlinkFolder);

    // Close modals on backdrop click
    [elements.modalNote, elements.modalCollectionMenu].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal(modal);
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideModal(elements.modalNote);
            hideModal(elements.modalCollectionMenu);
        }
    });

    // Listen for background updates (replaces chrome.storage.onChanged)
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'collectionUpdated') {
            // Reload data when background notifies of changes
            loadCollections();
            if (state.currentView === 'detail' && state.currentCollectionId === message.collectionId) {
                openCollection(state.currentCollectionId);
            }
        }
    });
}

function toggleLayout() {
    state.layoutMode = state.layoutMode === 'list' ? 'grid' : 'list';
    renderItems();
}

// ============================================
// Initialization
// ============================================
async function init() {
    initElements();
    setupEventListeners();

    // Add layout toggle listener manually here or in setupEventListeners
    if (elements.btnLayoutToggle) {
        elements.btnLayoutToggle.addEventListener('click', toggleLayout);
    }

    await loadSettings();
    await loadCollections();
    await checkFolderSyncStatus();
    showView('list');

    // フォルダが設定済みなら起動時に自動Pull
    autoSyncPull();
}

document.addEventListener('DOMContentLoaded', init);
