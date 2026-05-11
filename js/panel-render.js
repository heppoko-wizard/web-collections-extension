// js/panel-render.js

/**
 * panel-render.js - HTMLテンプレート生成とレンダリング
 */

import { state } from './panel-state.js';
import { t } from './i18n-helper.js';

// Constants (copied from panel.js)
const ITEM_HEIGHT_LIST = 100;
const ITEM_HEIGHT_GRID = 220;
const BUFFER_SIZE = 20;
const GAP = 8;

// SVG Icons - Monotone Technical
const ICONS = {
    COLLECTION: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M8 2v20"/></svg>`,
    FOLDER: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
    PAGE: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    IMAGE: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    TEXT: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><path d="M7 9h10"/><path d="M7 13h10"/></svg>`,
    NOTE: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`,
    MENU: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
    MEMO: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    RENAME: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    DELETE: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
    GRID: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    LIST: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
};

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
        <div class="icon">${ICONS.COLLECTION}</div>
        <p>${t('emptyCollections')}</p>
        <p>${t('emptyCollectionsSub')}</p>
      </div>
    `;
        return;
    }

    container.innerHTML = state.collections.map(collection => {
        const itemCount = collection.itemCount ?? collection.items?.length ?? 0;
        const firstImage = collection.firstImage;
        const thumbContent = firstImage?.imageUrl
            ? `<img src="${escapeHtml(firstImage.imageUrl)}" alt="">`
            : ICONS.FOLDER;

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
 * アイテム一覧の描画 (段階的レンダリング)
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
        elements.btnLayoutToggle.innerHTML = state.layoutMode === 'grid' ? ICONS.LIST : ICONS.GRID;
        elements.btnLayoutToggle.title = state.layoutMode === 'grid' ? t('layoutList') : t('layoutGrid');
    }

    if (!items || items.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="icon">${ICONS.PAGE}</div>
        <p>${t('emptyItems')}</p>
        <p>${t('emptyItemsSub')}</p>
      </div>
    `;
        return;
    }

    // Clear existing content and start chunked rendering
    container.innerHTML = '';
    
    // Stop any pending chunked rendering if necessary (via flag on state or elements)
    if (container.dataset.renderId) {
        cancelAnimationFrame(parseInt(container.dataset.renderId, 10));
    }

    // Attach resize observer only once
    const scrollContainer = elements.itemsContainer;
    if (!scrollContainer.dataset.hasResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            // Need to reconsider if we really need to re-render everything on resize
            // In non-virtualized mode, CSS handles the grid layout.
            // Only need to re-calculate columns if we were doing absolute positioning, 
            // but we switched to normal flow. So we might not even need this.
        });
        resizeObserver.observe(scrollContainer);
        scrollContainer.dataset.hasResizeObserver = 'true';
    }

    // Initial render of first chunk
    renderChunks(elements, items, 0, 50, setupDragAndDrop);
}

/**
 * 段階的レンダリングの実行
 * @param {object} elements 
 * @param {Array} items 
 * @param {number} startIndex 
 * @param {number} chunkSize 
 * @param {Function} setupDragAndDrop 
 */
function renderChunks(elements, items, startIndex, chunkSize, setupDragAndDrop) {
    const chunk = items.slice(startIndex, startIndex + chunkSize);
    const html = chunk.map((item, i) => renderItem(item, startIndex + i)).join('');
    
    elements.itemsList.insertAdjacentHTML('beforeend', html);

    if (startIndex + chunkSize < items.length) {
        const nextTask = requestAnimationFrame(() => {
            renderChunks(elements, items, startIndex + chunkSize, chunkSize, setupDragAndDrop);
        });
        elements.itemsList.dataset.renderId = nextTask.toString();
    } else {
        elements.itemsList.removeAttribute('renderId');
        // Finalize D&D (only need to init once, but setupDragAndDrop handles the check)
        if (setupDragAndDrop) setupDragAndDrop();
    }
}

/**
 * 仮想スクロール: 可視領域のアイテムのみ描画
 * @param {object} elements 
 */
/* Removed renderVisibleItems */

/**
 * 単一アイテムのHTML生成
 * @param {object} item 
 * @param {number} index 
 * @returns {string} HTML string
 */
export function renderItem(item, index = 0) {
    let thumbContent = '';
    let content = '';
    const loadingAttr = index < 100 ? 'eager' : 'lazy';

    switch (item.type) {
        case 'webpage':
            thumbContent = item.faviconUrl
                ? `<img src="${escapeHtml(item.faviconUrl)}" alt="" loading="${loadingAttr}">`
                : `<span class="icon">${ICONS.PAGE}</span>`;
            content = `
        <div class="item-title"><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.title || item.url)}</a></div>
        <div class="item-domain">${getDomain(item.url)}</div>
      `;
            break;

        case 'image':
            thumbContent = item.imageUrl
                ? `<img src="${escapeHtml(item.imageUrl)}" alt="" loading="${loadingAttr}">`
                : `<span class="icon">${ICONS.IMAGE}</span>`;
            content = `
        <div class="item-title"><a href="${escapeHtml(item.url || item.sourceUrl)}" target="_blank">${escapeHtml(item.title || t('image'))}</a></div>
        <div class="item-domain">${getDomain(item.sourceUrl || item.url)}</div>
      `;
            break;

        case 'text':
            thumbContent = `<span class="icon">${ICONS.TEXT}</span>`;
            content = `
        <div class="item-text">${escapeHtml(item.content)}</div>
        <div class="item-domain">${getDomain(item.sourceUrl)}</div>
      `;
            break;

        case 'note':
            thumbContent = `<span class="icon">${ICONS.NOTE}</span>`;
            content = `<div class="item-note">${escapeHtml(item.content)}</div>`;
            break;

        default:
            thumbContent = `<span class="icon">${ICONS.PAGE}</span>`;
            content = `<div class="item-title">${escapeHtml(item.title || t('item'))}</div>`;
    }

    const memoContent = item.memo
        ? `<div class="item-memo">${ICONS.MEMO} ${escapeHtml(item.memo)}</div>`
        : '';

    return `
    <div class="item-card type-${item.type}" draggable="true" data-id="${item.id}">
      <div class="item-thumb">${thumbContent}</div>
      <div class="item-content">${content}${memoContent}</div>
      <div class="item-actions">
        <div class="item-menu-container">
          <button class="icon-btn btn-item-menu" data-id="${item.id}" title="${t('btnCollectionMenuTitle')}">${ICONS.MENU}</button>
          <div class="item-menu-dropdown" data-id="${item.id}">
            <button class="menu-item btn-add-memo" data-id="${item.id}">${ICONS.MEMO} ${t('promptMemo')}</button>
            <button class="menu-item btn-rename-item" data-id="${item.id}">${ICONS.RENAME} ${t('promptRename')}</button>
            <button class="menu-item btn-delete-item" data-id="${item.id}">${ICONS.DELETE} ${t('btnDelete')}</button>
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
