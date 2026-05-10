// js/panel-render.js

/**
 * panel-render.js - HTMLテンプレート生成とレンダリング
 */

import { state } from './panel-state.js';

// Constants (copied from panel.js)
const ITEM_HEIGHT_LIST = 100;
const ITEM_HEIGHT_GRID = 220;
const BUFFER_SIZE = 20;

/**
 * コレクション一覧のHTMLを生成・描画
 * @param {object} elements 
 * @param {Function} onOpenCollection 
 */
export function renderCollectionsList(elements, onOpenCollection) {
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
        const itemCount = collection.itemCount ?? collection.items?.length ?? 0;
        const firstImage = collection.firstImage;
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

    // Click handlers (Decoupled partially via callback)
    container.querySelectorAll('.collection-card').forEach(card => {
        card.addEventListener('click', () => {
            onOpenCollection(card.dataset.id);
        });
    });
}

/**
 * アイテム一覧の描画
 * @param {object} elements 
 * @param {Function} setupDragAndDrop 
 */
export function renderItems(elements, setupDragAndDrop) {
    const collection = state.collections.find(c => c.id === state.currentCollectionId);
    if (!collection) return;

    elements.collectionTitle.textContent = collection.name;

    const items = state.currentItems;
    const container = elements.itemsList;

    // Apply layout class
    container.className = 'items-list'; // Reset
    container.classList.add(`layout-${state.layoutMode}`);

    // Update toggle button icon
    if (elements.btnLayoutToggle) {
        elements.btnLayoutToggle.textContent = state.layoutMode === 'grid' ? '≡' : '田';
        elements.btnLayoutToggle.title = state.layoutMode === 'grid' ? 'リスト表示にする' : 'タイル表示にする';
    }

    if (!items || items.length === 0) {
        elements.virtualScrollSpacer.style.height = '0px';
        container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📄</div>
        <p>アイテムがありません</p>
        <p>ページ上で右クリック→「コレクションに追加」</p>
      </div>
    `;
        return;
    }

    // Calculate total height for virtual scroll
    const itemHeight = state.layoutMode === 'grid' ? ITEM_HEIGHT_GRID : ITEM_HEIGHT_LIST;
    const totalHeight = items.length * itemHeight;
    elements.virtualScrollSpacer.style.height = `${totalHeight}px`;

    // Initial render of visible items
    renderVisibleItems(elements);

    // Attach scroll listener if not already attached
    const scrollContainer = elements.itemsContainer;
    if (!scrollContainer.dataset.hasScrollListener) {
        scrollContainer.addEventListener('scroll', () => {
            renderVisibleItems(elements);
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

            // アイテムのアクション（メモ、リネーム、削除）はカスタムイベント等でActionsへ通知するのが理想だが、
            // ここでは簡易的にDOMから取得して発火させるか、グローバルなイベントとして扱う
            // 今回は既存のロジックとの互換性を重視し、必要な属性をチェックする
            
            // Item Card Click (Open Link)
            const card = target.closest('.item-card');
            if (card) {
                if (target.closest('button') || target.closest('a') || target.closest('.item-menu-dropdown')) {
                    return;
                }
                const id = card.dataset.id;
                // Dispatches a custom event to be handled by Actions/Events
                const event = new CustomEvent('itemClick', { detail: { id } });
                scrollContainer.dispatchEvent(event);
            }

            // Close all menus when clicking elsewhere
            elements.itemsList.querySelectorAll('.item-menu-dropdown.active').forEach(m => m.classList.remove('active'));
        });
    }

    // Setup drag and drop
    if (setupDragAndDrop) setupDragAndDrop();
}

/**
 * 仮想スクロール: 可視領域のアイテムのみ描画
 * @param {object} elements 
 */
export function renderVisibleItems(elements) {
    const scrollContainer = elements.itemsContainer;
    const itemsList = elements.itemsList;
    const items = state.currentItems;
    
    if (!items || items.length === 0) return;

    const itemHeight = state.layoutMode === 'grid' ? ITEM_HEIGHT_GRID : ITEM_HEIGHT_LIST;
    const scrollTop = scrollContainer.scrollTop;
    const containerHeight = scrollContainer.clientHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - BUFFER_SIZE);
    const endIndex = Math.min(items.length - 1, Math.ceil((scrollTop + containerHeight) / itemHeight) + BUFFER_SIZE);

    const visibleItems = items.slice(startIndex, endIndex + 1);
    const offsetY = startIndex * itemHeight;

    itemsList.style.transform = `translateY(${offsetY}px)`;
    itemsList.innerHTML = visibleItems.map(item => renderItem(item)).join('');
}

/**
 * 単一アイテムのHTML生成
 * @param {object} item 
 * @returns {string} HTML string
 */
export function renderItem(item) {
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

    const memoContent = item.memo
        ? `<div class="item-memo">📋 ${escapeHtml(item.memo)}</div>`
        : '';

    return `
    <div class="item-card type-${item.type}" draggable="true" data-id="${item.id}">
      <div class="item-thumb">${thumbContent}</div>
      <div class="item-content">${content}${memoContent}</div>
      <div class="item-actions">
        <div class="item-menu-container">
          <button class="icon-btn btn-item-menu" data-id="${item.id}" title="メニュー">⋮</button>
          <div class="item-menu-dropdown" data-id="${item.id}">
            <button class="menu-item btn-add-memo" data-id="${item.id}">📋 メモを追加</button>
            <button class="menu-item btn-rename-item" data-id="${item.id}">✏️ 名前を変更</button>
            <button class="menu-item btn-delete-item" data-id="${item.id}">🗑️ 削除</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// Utilities
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
