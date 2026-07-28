// js/panel-render.js

/**
 * panel-render.js - HTMLテンプレート生成とレンダリング
 */

import { state } from './panel-state.js';
import { resizeImageToWebp, getImageHash, getLocalCachesBulk } from './image-cache-helper.js';

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

const ITEM_RENDER_BATCH_SIZE = 40;
let itemsRenderGeneration = 0;

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
            ? `<img data-original-src="${escapeHtml(firstImage.imageUrl)}" alt="" referrerpolicy="no-referrer">`
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

    applyImageCaches(container);
}

/**
 * アイテム一覧の描画
 * @param {object} elements
 */
export function renderItems(elements, options = {}) {
    const renderGeneration = ++itemsRenderGeneration;
    const collectionId = state.currentCollectionId;
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) {
        elements.itemsList.innerHTML = '';
        return;
    }

    elements.collectionTitle.textContent = collection.name;

    const items = state.currentItems;
    const container = elements.itemsList;
    const scrollContainer = elements.itemsContainer;
    const scrollAnchor = options.preserveScroll
        ? captureScrollAnchor(scrollContainer, container)
        : null;
    let scrollRestored = !scrollAnchor;

    // Apply layout class
    container.className = 'items-list'; // Reset
    container.classList.add(`layout-${state.layoutMode}`);
    container.classList.toggle('selection-mode', state.selectionMode);

    // Update toggle button icon
    if (elements.btnLayoutToggle) {
        elements.btnLayoutToggle.innerHTML = state.layoutMode === 'grid' ? ICONS.LIST : ICONS.GRID;
        elements.btnLayoutToggle.title = state.layoutMode === 'grid' ? 'リスト表示にする' : 'タイル表示にする';
    }

    if (state.isCollectionLoading) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="icon">${ICONS.COLLECTION}</div>
        <p>読み込み中...</p>
      </div>
    `;
        return;
    }

    if (!items || items.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="icon">${ICONS.PAGE}</div>
        <p>アイテムがありません</p>
        <p>ページ上で右クリック→「コレクションに追加」</p>
      </div>
    `;
        return;
    }

    container.innerHTML = '';

    // 大量データでサイドパネルを固めないよう、描画をフレーム単位に分割する。
    const renderBatch = (startIndex) => {
        if (renderGeneration !== itemsRenderGeneration || state.currentCollectionId !== collectionId) {
            return;
        }

        const endIndex = Math.min(startIndex + ITEM_RENDER_BATCH_SIZE, items.length);
        const html = items.slice(startIndex, endIndex).map(item => renderItem(item)).join('');
        container.insertAdjacentHTML('beforeend', html);
        applyImageCaches(container);

        if (!scrollRestored) {
            scrollRestored = restoreScrollAnchor(scrollContainer, container, scrollAnchor, endIndex === items.length);
        }

        if (startIndex === 0) {
            prefetchImagesAroundViewport(collectionId, 0, 20);
        }

        if (endIndex < items.length) {
            requestAnimationFrame(() => renderBatch(endIndex));
        }
    };

    renderBatch(0);

    // Attach click listener for event delegation if not already attached
    if (!scrollContainer.dataset.hasScrollListener) {
        scrollContainer.addEventListener('click', (e) => {
            const target = e.target;
            
            // 1. Item Menu Toggle
            const menuBtn = target.closest('.btn-item-menu');
            if (menuBtn) {
                e.stopPropagation();
                const dropdown = menuBtn.parentElement?.querySelector('.item-menu-dropdown');
                const shouldOpen = dropdown && !dropdown.classList.contains('active');

                elements.itemsList.querySelectorAll('.item-menu-dropdown.active').forEach(menu => {
                    menu.classList.remove('active', 'open-upward');
                    menu.closest('.item-actions')?.classList.remove('menu-open');
                    menu.closest('.item-card')?.classList.remove('menu-open');
                    menu.parentElement?.querySelector('.btn-item-menu')?.setAttribute('aria-expanded', 'false');
                });

                if (dropdown && shouldOpen) {
                    dropdown.classList.add('active');
                    dropdown.closest('.item-actions')?.classList.add('menu-open');
                    dropdown.closest('.item-card')?.classList.add('menu-open');

                    const menuRect = dropdown.getBoundingClientRect();
                    const viewportRect = scrollContainer.getBoundingClientRect();
                    const buttonRect = menuBtn.getBoundingClientRect();
                    if (menuRect.bottom > viewportRect.bottom && buttonRect.top - menuRect.height >= viewportRect.top) {
                        dropdown.classList.add('open-upward');
                    }
                }
                menuBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
                return;
            }

            // Item Card Click (Open Link)
            const card = target.closest('.item-card');
            if (card) {
                if (target.closest('button') || target.closest('a') || target.closest('.item-select-control') || target.closest('.item-menu-dropdown')) {
                    return;
                }
                const id = card.dataset.id;
                if (state.selectionMode) {
                    const event = new CustomEvent('itemSelectionToggle', { detail: { id } });
                    scrollContainer.dispatchEvent(event);
                    return;
                }
                // Dispatches a custom event to be handled by Actions/Events
                const event = new CustomEvent('itemClick', { detail: { id } });
                scrollContainer.dispatchEvent(event);
            }

            // Close all menus when clicking elsewhere
            elements.itemsList.querySelectorAll('.item-menu-dropdown.active').forEach(menu => {
                menu.classList.remove('active', 'open-upward');
                menu.closest('.item-actions')?.classList.remove('menu-open');
                menu.closest('.item-card')?.classList.remove('menu-open');
                menu.parentElement?.querySelector('.btn-item-menu')?.setAttribute('aria-expanded', 'false');
            });
        });
        scrollContainer.dataset.hasScrollListener = 'true';
    }

    // スクロール時に前後20件のプリフェッチをトリガーする
    if (!scrollContainer.dataset.hasScrollPrefetchListener) {
        let scrollTimeout = null;
        scrollContainer.addEventListener('scroll', () => {
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const cards = Array.from(container.querySelectorAll('.item-card'));
                if (cards.length === 0) return;

                const containerRect = scrollContainer.getBoundingClientRect();
                const containerCenter = containerRect.top + containerRect.height / 2;

                // ビューポート中央付近にあるカードを特定する
                let centerCardIndex = 0;
                let minDistance = Infinity;

                cards.forEach((card, index) => {
                    const rect = card.getBoundingClientRect();
                    const cardCenter = rect.top + rect.height / 2;
                    
                    const distance = Math.abs(cardCenter - containerCenter);
                    if (distance < minDistance) {
                        minDistance = distance;
                        centerCardIndex = index;
                    }
                });

                prefetchImagesAroundViewport(state.currentCollectionId, centerCardIndex, 20);
            }, 200);
        });
        scrollContainer.dataset.hasScrollPrefetchListener = 'true';
    }
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
                ? `<img src="${escapeHtml(item.faviconUrl)}" alt="" loading="lazy">`
                : `<span class="icon">${ICONS.PAGE}</span>`;
            content = `
        <div class="item-title"><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.title || item.url)}</a></div>
        <div class="item-domain">${getDomain(item.url)}</div>
      `;
            break;

        case 'image':
            thumbContent = item.imageUrl
                ? `<img data-original-src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
                : `<span class="icon">${ICONS.IMAGE}</span>`;
            content = `
        <div class="item-title"><a href="${escapeHtml(item.url || item.sourceUrl)}" target="_blank">${escapeHtml(item.title || '画像')}</a></div>
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
            content = `<div class="item-title">${escapeHtml(item.title || 'アイテム')}</div>`;
    }

    const memoContent = item.memo
        ? `<div class="item-memo">${ICONS.MEMO} ${escapeHtml(item.memo)}</div>`
        : '';
    const escapedId = escapeHtml(item.id);
    const isSelected = state.selectedItemIds.has(item.id);

    return `
    <div class="item-card type-${item.type}${isSelected ? ' selected' : ''}" data-id="${escapedId}">
      <label class="item-select-control" title="選択">
        <input type="checkbox" class="item-select-checkbox" data-id="${escapedId}" ${isSelected ? 'checked' : ''}>
      </label>
      <div class="item-thumb">${thumbContent}</div>
      <div class="item-content">${content}${memoContent}</div>
      <div class="item-actions">
        <div class="item-menu-container">
          <button type="button" class="icon-btn btn-item-menu" data-id="${escapedId}" title="メニュー" aria-label="アイテムメニュー" aria-expanded="false">${ICONS.MENU}</button>
          <div class="item-menu-dropdown" data-id="${escapedId}">
            <button type="button" class="menu-item btn-add-memo" data-id="${escapedId}">${ICONS.MEMO} メモを追加</button>
            <button type="button" class="menu-item btn-rename-item" data-id="${escapedId}">${ICONS.RENAME} 名前を変更</button>
            <button type="button" class="menu-item btn-delete-item" data-id="${escapedId}">${ICONS.DELETE} 削除</button>
          </div>
        </div>
      </div>
    </div>
  `;
}


function captureScrollAnchor(scrollContainer, container) {
    if (!scrollContainer || scrollContainer.scrollTop <= 0) return null;

    const viewportTop = scrollContainer.getBoundingClientRect().top;
    const anchorCard = Array.from(container.querySelectorAll('.item-card')).find(card => {
        return card.getBoundingClientRect().bottom > viewportTop;
    });

    return {
        id: anchorCard?.dataset.id || null,
        offset: anchorCard ? anchorCard.getBoundingClientRect().top - viewportTop : 0,
        scrollTop: scrollContainer.scrollTop
    };
}

function restoreScrollAnchor(scrollContainer, container, anchor, finalBatch) {
    if (!anchor) return true;

    if (anchor.id) {
        const anchorCard = Array.from(container.querySelectorAll('.item-card')).find(card => {
            return card.dataset.id === anchor.id;
        });
        if (anchorCard) {
            const viewportTop = scrollContainer.getBoundingClientRect().top;
            scrollContainer.scrollTop += anchorCard.getBoundingClientRect().top - viewportTop - anchor.offset;
            return true;
        }
    }

    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    scrollContainer.scrollTop = Math.min(anchor.scrollTop, maxScrollTop);
    return finalBatch || maxScrollTop >= anchor.scrollTop;
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

let imageCacheObserver = null;
const directImageCachePromises = new Map();
const TRANSPARENT_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function cacheDirectImage(url) {
    if (!url || url.startsWith('local-cache://') || directImageCachePromises.has(url)) return;

    const promise = (async () => {
        try {
            const resizedDataUrl = await resizeImageToWebp(url);
            await chrome.runtime.sendMessage({
                action: 'saveImageCache',
                url,
                dataUrl: resizedDataUrl
            });
        } catch (err) {
            console.warn('Rendering: Failed to create direct image cache:', url, err);
        }
    })();

    directImageCachePromises.set(url, promise);
    promise.finally(() => directImageCachePromises.delete(url));
}

async function loadDriveFallback(img, hash) {
    if (!img.isConnected || img.dataset.hash !== hash || img.dataset.driveFallbackPending === 'true') {
        return;
    }

    img.dataset.driveFallbackPending = 'true';
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getImageCacheFromDrive',
            hash
        });
        if (img.isConnected && img.dataset.hash === hash && response?.success && response.data) {
            img.dataset.imageResolved = 'drive';
            img.src = response.data;
        } else if (img.isConnected && img.dataset.hash === hash) {
            img.src = TRANSPARENT_PLACEHOLDER;
        }
    } catch (err) {
        console.warn('Rendering: Drive fallback failed:', err);
        if (img.isConnected && img.dataset.hash === hash) {
            img.src = TRANSPARENT_PLACEHOLDER;
        }
    } finally {
        delete img.dataset.driveFallbackPending;
    }
}

async function loadImageBatch(images) {
    const targets = images.filter(img => img.isConnected && img.dataset.originalSrc);
    if (targets.length === 0) return;

    const entries = await Promise.all(targets.map(async img => ({
        img,
        url: img.dataset.originalSrc,
        hash: await getImageHash(img.dataset.originalSrc)
    })));

    let localCaches = {};
    try {
        localCaches = await getLocalCachesBulk(entries.map(entry => entry.hash));
    } catch (err) {
        console.warn('Rendering: Bulk local image cache read failed:', err);
    }

    const missingEntries = [];
    for (const entry of entries) {
        const { img, url, hash } = entry;
        if (!img.isConnected) continue;
        img.dataset.hash = hash;

        const localData = localCaches[hash];
        if (localData) {
            img.dataset.imageResolved = 'local';
            img.src = localData;
            continue;
        }

        missingEntries.push({ hash, url });
        if (url.startsWith('local-cache://')) {
            img.src = TRANSPARENT_PLACEHOLDER;
            continue;
        }

        const directLoadTimeout = setTimeout(() => {
            if (img.isConnected && img.dataset.hash === hash && !img.src.startsWith('data:')) {
                loadDriveFallback(img, hash);
            }
        }, 10000);

        img.addEventListener('load', () => {
            clearTimeout(directLoadTimeout);
            if (!img.src.startsWith('data:')) cacheDirectImage(url);
        }, { once: true });
        img.addEventListener('error', () => {
            clearTimeout(directLoadTimeout);
            loadDriveFallback(img, hash);
        }, { once: true });

        // 元URLとDriveキャッシュを並列に開始し、先に成功した方を表示する。
        img.src = url;
    }

    if (missingEntries.length > 0) {
        chrome.runtime.sendMessage({
            action: 'prefetchImageCachesFromDrive',
            entries: missingEntries
        }).catch(err => console.warn('Rendering: Drive image prefetch request failed:', err));
    }
}

/**
 * ビューポート周辺のDriveキャッシュをまとめて先読みする。
 */
export async function prefetchImagesAroundViewport(collectionId, centerIndex = 0, range = 20) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const items = state.currentItems || [];
    if (items.length === 0) return;

    const start = Math.max(0, centerIndex - range);
    const end = Math.min(items.length - 1, centerIndex + range);
    const urls = new Set();

    for (let i = start; i <= end; i++) {
        const item = items[i];
        if (!item || item.isDeleted) continue;
        const imageUrl = item.type === 'image'
            ? (item.imageUrl || item.content)
            : item.imageUrl;
        if (imageUrl && !imageUrl.startsWith('data:')) urls.add(imageUrl);
    }

    const entries = await Promise.all(Array.from(urls).map(async url => ({
        url,
        hash: await getImageHash(url)
    })));
    if (entries.length === 0) return;

    chrome.runtime.sendMessage({
        action: 'prefetchImageCachesFromDrive',
        entries
    }).catch(err => console.warn('Prefetch: Drive request failed:', err));
}

/**
 * レンダリングされた画像要素に対してビューポート優先遅延ロードを適用します
 */
function applyImageCaches(container) {
    const images = Array.from(container.querySelectorAll(
        'img[data-original-src]:not([data-image-load-bound])'
    ));
    if (images.length === 0) return;

    if (!imageCacheObserver) {
        imageCacheObserver = new IntersectionObserver((entries) => {
            const visibleImages = [];
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                imageCacheObserver.unobserve(entry.target);
                visibleImages.push(entry.target);
            }
            loadImageBatch(visibleImages).catch(err => {
                console.error('Rendering: Image batch load failed:', err);
            });
        }, {
            root: null,
            rootMargin: '300px',
            threshold: 0.01
        });
    }

    for (const img of images) {
        img.dataset.imageLoadBound = 'true';
        imageCacheObserver.observe(img);
    }
}

/**
 * 画像キャッシュのダウンロード完了時に呼び出され、該当するすべてのimg要素の画像を更新します
 */
export function onImageDownloaded(hash, dataUrl) {
    const images = document.querySelectorAll(`img[data-hash="${hash}"]`);
    images.forEach(img => {
        img.dataset.imageResolved = 'drive';
        img.src = dataUrl;
    });
}
