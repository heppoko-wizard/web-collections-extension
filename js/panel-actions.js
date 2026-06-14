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

    if (elements.settingEncryptEnabled) {
        elements.settingEncryptEnabled.checked = settings.encryptEnabled || false;
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

export async function exportAllCollections() {
    const response = await sendMessage({ action: 'exportJson' });
    if (response.success && response.data) {
        downloadFile(response.data, 'web-collections-all.json', 'application/json');
    } else {
        alert('エクスポートに失敗しました：' + (response.error || '不明なエラー'));
    }
}

export async function importFromFiles() {
    const fileInput = elements.importJsonFile;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('インポートするJSONファイルを選択してください');
        return;
    }

    const files = Array.from(fileInput.files);
    
    if (!confirm('インポートしたデータは既存のコレクションと統合されます。実行しますか？')) {
        return;
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const file of files) {
        try {
            const content = await readFileAsText(file);
            JSON.parse(content);

            const response = await sendMessage({ action: 'importJson', data: content });
            if (response.success) {
                successCount++;
            } else {
                failCount++;
                errors.push(file.name + '：' + response.error);
            }
        } catch (e) {
            failCount++;
            errors.push(file.name + '：' + e.message);
        }
    }

    if (successCount > 0) {
        alert(successCount + '個のファイルをインポートしました');
        fileInput.value = '';
        await loadCollections();
    }
    
    if (failCount > 0) {
        alert('失敗したファイルがあります。合計は' + failCount + '件です：\n' + errors.join('\n'));
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('ファイルの読み込みに失敗しました'));
        reader.readAsText(file);
    });
}

export async function rebuildFromBookmarks() {
    if (!confirm('ローカルのコレクションデータを一度すべてクリアし、Googleドライブに保存されている最新の同期データから再構築します。実行しますか？')) {
        return;
    }

    try {
        // 1. ローカルのコレクションデータと同期メタデータをクリア
        await chrome.storage.local.set({ wc_collections: [] });
        await chrome.storage.local.remove('wc_last_modified_time');

        const settingsResponse = await sendMessage({ action: 'getSettings' });
        if (settingsResponse.success && settingsResponse.data) {
            const settings = settingsResponse.data;
            settings.lastSyncTime = null;
            await sendMessage({ action: 'saveSettings', settings });
        }

        // 2. GoogleドライブからPullを実行
        const pullResponse = await sendMessage({ action: 'autoSyncPull' });

        if (pullResponse.success) {
            // 3. UIの読み込みと更新
            await loadCollections();
            alert('Googleドライブからの再構築が完了しました');
        } else {
            alert('再構築に失敗しました: ' + pullResponse.error);
        }
    } catch (error) {
        console.error('Rebuild failed:', error);
        alert('エラーが発生しました: ' + error.message);
    }
}

export async function rebuildImageIndex() {
    if (!confirm('Googleドライブ上のすべての画像ファイルをスキャンし、画像インデックスを再作成します。この処理には少し時間がかかる場合があります。実行しますか？')) {
        return;
    }

    const btn = elements.btnRebuildImageIndex || document.getElementById('btn-rebuild-image-index');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '再構築中...';
    }

    try {
        const response = await sendMessage({ action: 'rebuildImageIndex' });
        if (response.success) {
            alert('画像インデックスの再構築が完了しました。新たに ' + response.rebuiltCount + ' 件の画像が登録されました。');
        } else {
            alert('再構築に失敗しました: ' + response.error);
        }
    } catch (error) {
        console.error('Image index rebuild failed:', error);
        alert('エラーが発生しました: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText || 'ドライブから画像インデックスを再構築';
        }
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

export async function toggleEncryptOption(enabled) {
    const confirmMessage = enabled
        ? 'ブックマークの暗号化を有効にします。過去に登録済みのすべてのコレクションデータを暗号化して再構築します。よろしいですか？'
        : 'ブックマークの暗号化を解除します。過去に登録済みのすべてのコレクションデータを平文形式に戻して再構築します。よろしいですか？';

    if (!confirm(confirmMessage)) {
        await updateSettingsUI();
        return;
    }

    try {
        const response = await sendMessage({
            action: 'migrateEncryption',
            encryptEnabled: enabled
        });

        if (response.success) {
            await rebuildFromBookmarks();
        } else {
            alert('切り替え処理に失敗しました: ' + response.error);
            await updateSettingsUI();
        }
    } catch (error) {
        console.error('Failed to toggle encryption option:', error);
        alert('エラーが発生しました: ' + error.message);
        await updateSettingsUI();
    }
}

export async function syncNow() {
    const btn = elements.btnSyncNow || document.getElementById('btn-sync-now');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '同期中...';
    }

    try {
        // 1. プル同期を実行して他デバイスの最新変更をローカルにマージ
        const pullResult = await sendMessage({ action: 'autoSyncPull' });
        if (!pullResult.success) {
            throw new Error(pullResult.error);
        }

        // 2. プッシュ同期を実行して最新のローカルデータをクラウドへアップロード
        const pushResult = await sendMessage({ action: 'syncPush' });
        if (!pushResult.success) {
            throw new Error(pushResult.error);
        }

        // 最終同期時刻を保存
        await sendMessage({ action: 'saveLastSyncTime', time: Date.now() });

        // 3. UIの更新
        await loadCollections();
        await updateSettingsUI();

        const pullReport = pullResult.report || {};
        const pushReport = pushResult.report || {};
        
        let msg = '同期が完了しました。\n\n';
        
        msg += '▼ 受信同期（プル）詳細\n';
        if (pullReport.totalTime !== undefined) {
            msg += `・総時間: ${pullReport.totalTime} ms\n`;
            msg += `・ファイル検索: ${pullReport.findFileTime || 0} ms\n`;
            msg += `・ダウンロード: ${pullReport.downloadTime || 0} ms\n`;
            msg += `・暗号復号: ${pullReport.decryptTime || 0} ms\n`;
            msg += `・圧縮展開: ${pullReport.decompressTime || 0} ms\n`;
            msg += `・マージ処理: ${pullReport.mergeTime || 0} ms\n`;
        } else {
            msg += '・更新なし\n';
        }
        
        msg += '\n▼ 送信同期（プッシュ）詳細\n';
        if (pushReport.skipped) {
            msg += '・ローカル変更なしのため送信スキップ\n';
        } else if (pushReport.totalTime !== undefined) {
            msg += `・総時間: ${pushReport.totalTime} ms\n`;
            msg += `・パージ処理: ${pushReport.purgeTime || 0} ms\n`;
            msg += `・データ展開: ${pushReport.exportTime || 0} ms\n`;
            msg += `・データ圧縮: ${pushReport.compressTime || 0} ms\n`;
            msg += `・データ暗号: ${pushReport.encryptTime || 0} ms\n`;
            msg += `・ファイル検索: ${pushReport.searchTime || 0} ms\n`;
            msg += `・アップロード: ${pushReport.uploadTime || 0} ms\n`;
        } else {
            msg += '・処理スキップ\n';
        }

        msg += '\n※ このレポート内容は自動的にクリップボードへコピーされました。そのまま貼り付けが可能です。';

        try {
            await navigator.clipboard.writeText(msg);
        } catch (clipErr) {
            console.warn('Failed to copy sync report to clipboard:', clipErr);
        }

        alert(msg);
    } catch (error) {
        console.error('Manual sync failed:', error);
        alert('同期に失敗しました: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText || '今すぐ同期';
        }
    }
}

export async function syncNowFromHeader() {
    const btn = elements.btnSyncHeader || document.getElementById('btn-sync-header');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('rotating');
    }

    try {
        // 1. プル同期を実行して他デバイスの最新変更をローカルにマージ
        const pullResult = await sendMessage({ action: 'autoSyncPull' });
        if (!pullResult.success) {
            throw new Error(pullResult.error);
        }

        // 2. プッシュ同期を実行して最新のローカルデータをクラウドへアップロード
        const pushResult = await sendMessage({ action: 'syncPush' });
        if (!pushResult.success) {
            throw new Error(pushResult.error);
        }

        // 最終同期時刻を保存
        await sendMessage({ action: 'saveLastSyncTime', time: Date.now() });

        // 3. UIの更新
        await loadCollections();
        await updateSettingsUI();

        // ヘッダーでの同期成功時はアラートを出さずスムーズにUIの更新のみを行います
    } catch (error) {
        console.error('Header sync failed:', error);
        alert('同期に失敗しました: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('rotating');
        }
    }
}

export async function downloadAllImageCaches() {
    if (!confirm('Googleドライブに保存されているすべての画像キャッシュをローカルに一括ダウンロードします。実行しますか？')) {
        return;
    }

    const btn = elements.btnDownloadAllImages || document.getElementById('btn-download-all-images');
    if (btn) btn.disabled = true;

    const progressContainer = elements.downloadProgressContainer || document.getElementById('download-progress-container');
    const progressStatus = elements.downloadProgressStatus || document.getElementById('download-progress-status');
    const progressPercent = elements.downloadProgressPercent || document.getElementById('download-progress-percent');
    const progressBar = elements.downloadProgressBar || document.getElementById('download-progress-bar');
    const progressCounts = elements.downloadProgressCounts || document.getElementById('download-progress-counts');
    const progressErrors = elements.downloadProgressErrors || document.getElementById('download-progress-errors');

    if (progressContainer) progressContainer.style.display = 'block';
    if (progressStatus) progressStatus.textContent = 'ダウンロード準備中...';
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressBar) progressBar.style.width = '0%';
    if (progressCounts) progressCounts.textContent = '処理: 0 / 0 件';
    if (progressErrors) progressErrors.style.display = 'none';

    try {
        const response = await sendMessage({ action: 'downloadAllImageCaches' });
        if (!response.success) {
            throw new Error(response.error || 'ダウンロードの開始に失敗しました');
        }
    } catch (error) {
        console.error('Failed to start bulk image download:', error);
        alert('エラーが発生しました: ' + error.message);
        if (btn) btn.disabled = false;
        if (progressContainer) progressContainer.style.display = 'none';
    }
}

export function onDownloadProgress(detail) {
    const btn = elements.btnDownloadAllImages || document.getElementById('btn-download-all-images');
    const progressContainer = elements.downloadProgressContainer || document.getElementById('download-progress-container');
    const progressStatus = elements.downloadProgressStatus || document.getElementById('download-progress-status');
    const progressPercent = elements.downloadProgressPercent || document.getElementById('download-progress-percent');
    const progressBar = elements.downloadProgressBar || document.getElementById('download-progress-bar');
    const progressCounts = elements.downloadProgressCounts || document.getElementById('download-progress-counts');
    const progressErrors = elements.downloadProgressErrors || document.getElementById('download-progress-errors');

    const total = detail.total || 0;
    const completed = detail.completed || 0;
    const failed = detail.failed || 0;
    const processed = completed + failed;
    
    let percent = 0;
    if (total > 0) {
        percent = Math.round((processed / total) * 100);
    }

    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressCounts) progressCounts.textContent = `処理: ${processed} / ${total} 件`;

    if (failed > 0 && progressErrors) {
        progressErrors.style.display = 'block';
        progressErrors.textContent = `エラー: ${failed} 件`;
    }

    if (detail.status === 'searching') {
        if (progressStatus) progressStatus.textContent = '未同期の画像を検索中...';
    } else if (detail.status === 'downloading') {
        if (progressStatus) progressStatus.textContent = `ダウンロード中... (${completed}件完了)`;
    } else if (detail.status === 'completed') {
        if (progressStatus) progressStatus.textContent = 'ダウンロード完了';
        if (btn) btn.disabled = false;
        
        setTimeout(() => {
            alert(`画像キャッシュのダウンロードが完了しました。\n合計: ${total} 件\n成功: ${completed} 件\n失敗: ${failed} 件`);
            if (progressContainer) progressContainer.style.display = 'none';
        }, 500);
    } else if (detail.status === 'error') {
        if (progressStatus) progressStatus.textContent = 'エラーが発生しました';
        if (btn) btn.disabled = false;
        alert('ダウンロード中にエラーが発生しました：' + (detail.error || '不明なエラー'));
    }
}

export function showContextMenu(itemId, x, y) {
    const menu = elements.contextMenu || document.getElementById('context-menu');
    if (!menu) return;

    // クリックされたアイテムのIDを属性に格納
    menu.dataset.itemId = itemId;

    // 表示位置を設定（スクロール等に対応するため、画面全体の座標を使う）
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'flex';

    // メニューの外側をクリックしたときに閉じる処理を一時登録
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.style.display = 'none';
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('contextmenu', closeMenu);
        }
    };

    // 遅延して登録し、今回の右クリックイベント自体で即座に閉じるのを防ぐ
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('contextmenu', closeMenu);
    }, 10);
}

export function hideContextMenu() {
    const menu = elements.contextMenu || document.getElementById('context-menu');
    if (menu) {
        menu.style.display = 'none';
    }
}
