/**
 * panel.js - サイドパネルUIロジック
 * コレクションの表示・操作・同期を管理
 */

// ============================================
// State Management
// ============================================
const state = {
    collections: [],
    currentCollectionId: null,
    currentView: 'list', // 'list' | 'detail' | 'settings'
    settings: {}
};

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
    elements.collectionTitle = document.getElementById('collection-title');

    // Buttons
    elements.btnNewCollection = document.getElementById('btn-new-collection');
    elements.btnSettings = document.getElementById('btn-settings');
    elements.btnBack = document.getElementById('btn-back');
    elements.btnBackSettings = document.getElementById('btn-back-settings');
    elements.btnAddPage = document.getElementById('btn-add-page');
    elements.btnAddNote = document.getElementById('btn-add-note');
    elements.btnOpenAll = document.getElementById('btn-open-all');
    elements.btnCollectionMenu = document.getElementById('btn-collection-menu');

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
// Render Functions
// ============================================
function renderCollectionsList() {
    const container = elements.collectionsContainer;

    if (state.collections.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📚</div>
        <p>コレクションがありません</p>
        <p>「新しいコレクション」ボタンで作成しましょう</p>
      </div>
    `;
        return;
    }

    container.innerHTML = state.collections.map(collection => {
        const itemCount = collection.items?.length || 0;
        const firstImage = collection.items?.find(i => i.type === 'image' || i.imageUrl);
        const thumbContent = firstImage?.imageUrl
            ? `<img src="${escapeHtml(firstImage.imageUrl)}" alt="">`
            : '📁';

        return `
      <div class="collection-card" data-id="${collection.id}">
        <div class="collection-thumb">${thumbContent}</div>
        <div class="collection-info">
          <div class="collection-name">${escapeHtml(collection.name)}</div>
          <div class="collection-meta">${itemCount} アイテム</div>
        </div>
      </div>
    `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.collection-card').forEach(card => {
        card.addEventListener('click', () => {
            openCollection(card.dataset.id);
        });
    });
}

function renderItems() {
    const collection = state.collections.find(c => c.id === state.currentCollectionId);
    if (!collection) return;

    elements.collectionTitle.textContent = collection.name;

    const container = elements.itemsContainer;

    if (!collection.items || collection.items.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📄</div>
        <p>アイテムがありません</p>
        <p>ページ上で右クリック→「コレクションに追加」</p>
      </div>
    `;
        return;
    }

    container.innerHTML = collection.items.map(item => renderItem(item)).join('');

    // Add delete handlers
    container.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteItem(btn.dataset.id);
        });
    });

    // Setup drag and drop
    setupDragAndDrop();

    // Add card click handlers (for opening links)
    container.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Do not trigger if clicking a button or a link (to avoid double open)
            if (e.target.closest('button') || e.target.closest('a')) {
                return;
            }

            const collection = state.collections.find(c => c.id === state.currentCollectionId);
            if (!collection) return;

            const item = collection.items.find(i => i.id === card.dataset.id);
            if (!item) return;

            const url = item.url || item.sourceUrl;
            if (url) {
                chrome.tabs.create({ url, active: false });
            }
        });
    });
}

function renderItem(item) {
    let thumbContent = '';
    let content = '';

    switch (item.type) {
        case 'webpage':
            thumbContent = item.faviconUrl
                ? `<img src="${escapeHtml(item.faviconUrl)}" alt="">`
                : '<span class="icon">🌐</span>';
            content = `
        <div class="item-title"><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.title || item.url)}</a></div>
        <div class="item-domain">${getDomain(item.url)}</div>
      `;
            break;

        case 'image':
            thumbContent = item.imageUrl
                ? `<img src="${escapeHtml(item.imageUrl)}" alt="">`
                : '<span class="icon">🖼️</span>';
            content = `
        <div class="item-title"><a href="${escapeHtml(item.url || item.sourceUrl)}" target="_blank">${escapeHtml(item.title || '画像')}</a></div>
        <div class="item-domain">${getDomain(item.sourceUrl || item.url)}</div>
      `;
            break;

        case 'text':
            thumbContent = '<span class="icon">"</span>';
            content = `
        <div class="item-text">${escapeHtml(item.content)}</div>
        <div class="item-domain">${getDomain(item.sourceUrl)}</div>
      `;
            break;

        case 'note':
            thumbContent = '<span class="icon">📝</span>';
            content = `<div class="item-note">${escapeHtml(item.content)}</div>`;
            break;

        default:
            thumbContent = '<span class="icon">📄</span>';
            content = `<div class="item-title">${escapeHtml(item.title || 'アイテム')}</div>`;
    }

    return `
    <div class="item-card type-${item.type}" draggable="true" data-id="${item.id}">
      <div class="item-thumb">${thumbContent}</div>
      <div class="item-content">${content}</div>
      <div class="item-actions">
        <button class="icon-btn btn-delete-item" data-id="${item.id}" title="削除">×</button>
      </div>
    </div>
  `;
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
            state.collections.push(response.data);
            renderCollectionsList();
            openCollection(response.data.id);
        }
    }
}

function openCollection(id) {
    state.currentCollectionId = id;
    showView('detail');
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
        const collection = state.collections.find(c => c.id === state.currentCollectionId);
        if (collection) {
            collection.items.push(response.data);
            renderItems();
        }
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
        const collection = state.collections.find(c => c.id === state.currentCollectionId);
        if (collection) {
            collection.items.push(response.data);
            renderItems();
        }
        hideModal(elements.modalNote);
    }
}

async function deleteItem(itemId) {
    const response = await sendMessage({
        action: 'removeItem',
        collectionId: state.currentCollectionId,
        itemId
    });

    if (response.success) {
        const collection = state.collections.find(c => c.id === state.currentCollectionId);
        if (collection) {
            collection.items = collection.items.filter(i => i.id !== itemId);
            renderItems();
        }
    }
}

async function openAllLinks() {
    const collection = state.collections.find(c => c.id === state.currentCollectionId);
    if (!collection) return;

    const urls = collection.items
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
function setupDragAndDrop() {
    const container = elements.itemsContainer;
    let draggedElement = null;

    container.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            draggedElement = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            draggedElement = null;
            saveNewOrder();
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedElement && draggedElement !== card) {
                const rect = card.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    container.insertBefore(draggedElement, card);
                } else {
                    container.insertBefore(draggedElement, card.nextSibling);
                }
            }
        });
    });
}

async function saveNewOrder() {
    const itemIds = Array.from(elements.itemsContainer.querySelectorAll('.item-card'))
        .map(card => card.dataset.id);

    await sendMessage({
        action: 'reorderItems',
        collectionId: state.currentCollectionId,
        itemIds
    });

    // Update local state
    const collection = state.collections.find(c => c.id === state.currentCollectionId);
    if (collection) {
        const itemMap = new Map(collection.items.map(i => [i.id, i]));
        collection.items = itemIds.map(id => itemMap.get(id)).filter(Boolean);
    }
}

// ============================================
// Settings & Sync
// ============================================
async function loadSettings() {
    const response = await sendMessage({ action: 'getSettings' });
    if (response.success) {
        state.settings = response.data;
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
}

function openSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('html/settings.html') });
}

async function syncNow() {
    try {
        const token = await GistSync.getToken();
        if (!token) {
            alert('GitHub トークンが設定されていません。\n設定画面でトークンを入力してください。');
            openSettings();
            return;
        }

        elements.btnSyncNow.disabled = true;
        elements.btnSyncNow.textContent = '同期中...';

        // Get current collections
        const collectionsData = { collections: state.collections };

        // Push to Gist
        await GistSync.pushToGist(collectionsData, (status) => {
            elements.btnSyncNow.textContent = status;
        });

        // Save sync time
        await chrome.storage.local.set({ last_sync_time: Date.now() });
        await updateSettingsUI();

        alert('同期が完了しました！');
    } catch (error) {
        console.error('Sync error:', error);
        alert('同期エラー: ' + error.message);
    } finally {
        elements.btnSyncNow.disabled = false;
        elements.btnSyncNow.textContent = '🔄 今すぐ同期';
    }
}

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
    const rows = [['Collection', 'Type', 'Title', 'URL', 'Content', 'Saved At']];

    state.collections.forEach(collection => {
        collection.items?.forEach(item => {
            rows.push([
                collection.name,
                item.type,
                item.title || '',
                item.url || item.sourceUrl || '',
                item.content || '',
                new Date(item.savedAt).toISOString()
            ]);
        });
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
            updateFolderSyncUI(true);
            elements.folderSyncStatus.textContent = `選択中: ${handle.name}`;
            elements.folderSyncStatus.className = 'hint success';
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

async function pushToFolder() {
    try {
        elements.btnFolderSyncPush.disabled = true;
        elements.folderSyncStatus.textContent = 'エクスポート中...';

        const collectionsData = {
            collections: state.collections,
            exportedAt: Date.now()
        };

        await FolderSync.pushToFolder(collectionsData, (status) => {
            elements.folderSyncStatus.textContent = status;
        });

        elements.folderSyncStatus.textContent = '✅ エクスポート成功';
        elements.folderSyncStatus.className = 'hint success';
        setTimeout(() => {
            elements.folderSyncStatus.textContent = '';
        }, 3000);

    } catch (error) {
        console.error('Push failed:', error);
        elements.folderSyncStatus.textContent = `エラー: ${error.message}`;
        elements.folderSyncStatus.className = 'hint error';
    } finally {
        elements.btnFolderSyncPush.disabled = false;
    }
}

async function pullFromFolder() {
    if (!confirm('現在のデータを上書きしてフォルダからインポートしますか？')) return;

    try {
        elements.btnFolderSyncPull.disabled = true;
        elements.folderSyncStatus.textContent = 'インポート中...';

        const data = await FolderSync.pullFromFolder((status) => {
            elements.folderSyncStatus.textContent = status;
        });

        if (data && data.collections) {
            const response = await sendMessage({
                action: 'importJson',
                data: JSON.stringify(data) // importJson expects string
            });

            if (response.success) {
                await loadCollections();
                elements.folderSyncStatus.textContent = '✅ インポート成功';
                elements.folderSyncStatus.className = 'hint success';
                setTimeout(() => {
                    elements.folderSyncStatus.textContent = '';
                }, 3000);
            }
        } else {
            throw new Error('無効なデータ形式です');
        }

    } catch (error) {
        console.error('Pull failed:', error);
        elements.folderSyncStatus.textContent = `エラー: ${error.message}`;
        elements.folderSyncStatus.className = 'hint error';
    } finally {
        elements.btnFolderSyncPull.disabled = false;
    }
}

async function unlinkFolder() {
    if (!confirm('このフォルダとの連携を解除しますか？\n(実際のファイルは削除されません)')) return;

    await FolderSync.clearSavedHandle();
    updateFolderSyncUI(false);
}

async function checkFolderSyncStatus() {
    const handle = await FolderSync.getSavedDirectoryHandle();
    if (handle) {
        updateFolderSyncUI(true);
        elements.folderSyncStatus.textContent = `選択中: ${handle.name}`;
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
// Utility Functions
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getDomain(url) {
    if (!url) return '';
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
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
    elements.btnSyncNow.addEventListener('click', syncNow);
    elements.btnExportJson.addEventListener('click', exportToJson);
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

    // Listen for storage changes (for real-time sync)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.collections) {
            state.collections = changes.collections.newValue || [];
            if (state.currentView === 'list') {
                renderCollectionsList();
            } else if (state.currentView === 'detail') {
                renderItems();
            }
        }
    });
}

// ============================================
// Initialization
// ============================================
async function init() {
    initElements();
    setupEventListeners();
    await loadSettings();
    await loadCollections();
    await checkFolderSyncStatus();
    showView('list');
}

document.addEventListener('DOMContentLoaded', init);
