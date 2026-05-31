// js/panel-render.js

/**
 * panel-render.js - HTMLテンプレート生成とレンダリング
 */

import { state } from './panel-state.js';
import { resizeImageToWebp, getImageHash } from './image-cache-helper.js';

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
        elements.btnLayoutToggle.title = state.layoutMode === 'grid' ? 'リスト表示にする' : 'タイル表示にする';
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

    // Direct native scroll rendering
    container.innerHTML = items.map(item => renderItem(item)).join('');

    // Attach click listener for event delegation if not already attached
    const scrollContainer = elements.itemsContainer;
    if (!scrollContainer.dataset.hasScrollListener) {
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
        scrollContainer.dataset.hasScrollListener = 'true';
    }

    // Setup drag and drop
    if (setupDragAndDrop) setupDragAndDrop();

    applyImageCaches(container);

    // 初期表示時に最初の20件をプリフェッチ
    prefetchImagesAroundViewport(state.currentCollectionId, 0, 20);

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

    return `
    <div class="item-card type-${item.type}" draggable="true" data-id="${item.id}">
      <div class="item-thumb">${thumbContent}</div>
      <div class="item-content">${content}${memoContent}</div>
      <div class="item-actions">
        <div class="item-menu-container">
          <button class="icon-btn btn-item-menu" data-id="${item.id}" title="メニュー">${ICONS.MENU}</button>
          <div class="item-menu-dropdown" data-id="${item.id}">
            <button class="menu-item btn-add-memo" data-id="${item.id}">${ICONS.MEMO} メモを追加</button>
            <button class="menu-item btn-rename-item" data-id="${item.id}">${ICONS.RENAME} 名前を変更</button>
            <button class="menu-item btn-delete-item" data-id="${item.id}">${ICONS.DELETE} 削除</button>
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

let imageCacheObserver = null;

/**
 * 画像を指定の優先順位であるキャッシュ、直リンク、ドライブでロードし、結果を画像要素へ適用します
 * @param {HTMLImageElement} img - 対象の画像要素
 * @param {string} url - 画像のオリジナルURL
 */
async function loadAndFallbackImage(img, url) {
    if (!url) return;
    const hash = await getImageHash(url);
    
    // すでに処理済みであればスキップする
    if (img.src && img.src.startsWith('data:') && !img.src.includes('sidepanel.html')) {
        return;
    }

    // 段階1：ローカルキャッシュ
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getLocalCache', hash });
        if (response && response.success && response.data) {
            img.src = response.data;
            return;
        }
    } catch (err) {
        console.warn('Rendering: Local cache read failed:', err);
    }

    // 段階2：直リンク
    const isLocalCacheUrl = url.startsWith('local-cache://');
    if (!isLocalCacheUrl) {
        try {
            const isLoaded = await new Promise((resolve) => {
                const temp = new Image();
                temp.onload = () => resolve(true);
                temp.onerror = () => resolve(false);
                temp.src = url;
            });

            if (isLoaded) {
                img.src = url;
                try {
                    const resizedDataUrl = await resizeImageToWebp(url);
                    await chrome.runtime.sendMessage({
                        action: 'saveImageCache',
                        url: url,
                        dataUrl: resizedDataUrl
                    });
                } catch (resizeErr) {
                    console.warn('Rendering: Failed to resize and cache direct image:', resizeErr);
                }
                return;
            }
        } catch (err) {
            console.warn('Rendering: Direct link load failed for:', url, err);
        }
    }

    // 段階3：ドライブ
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getImageCacheFromDrive', hash });
        if (response && response.success && response.data) {
            img.src = response.data;
            return;
        }
    } catch (err) {
        console.error('Rendering: Google Drive image fallback failed:', err);
    }

    // すべて失敗した場合は透明なプレースホルダーを設定する
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
}

/**
 * ビューポートの中心位置付近にあるアイテムを特定し、その前後20件の画像を非同期でプリフェッチします
 * @param {string} collectionId - 対象のコレクションID
 * @param {number} centerIndex - 基準となる表示インデックス
 * @param {number} range - 前後の取得件数
 */
export async function prefetchImagesAroundViewport(collectionId, centerIndex = 0, range = 20) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const items = state.currentItems || [];
    if (items.length === 0) return;

    const start = Math.max(0, centerIndex - range);
    const end = Math.min(items.length - 1, centerIndex + range);

    console.log(`Rendering: Prefetching images in range ${start} to ${end} for collection ${collectionId}`);

    const targets = [];
    for (let i = start; i <= end; i++) {
        const item = items[i];
        if (!item || item.isDeleted) continue;
        
        let imageUrl = null;
        if (item.type === 'image') {
            imageUrl = item.imageUrl || item.content;
        } else if (item.imageUrl) {
            imageUrl = item.imageUrl;
        }

        if (imageUrl && !imageUrl.startsWith('data:')) {
            targets.push(imageUrl);
        }
    }

    const uniqueUrls = Array.from(new Set(targets));

    uniqueUrls.forEach(async (url) => {
        const hash = await getImageHash(url);
        
        try {
            const cacheResponse = await chrome.runtime.sendMessage({ action: 'getLocalCache', hash });
            if (cacheResponse && cacheResponse.success && cacheResponse.data) {
                return;
            }
        } catch (e) {
            console.warn('Prefetch: Local cache check failed:', e);
        }

        if (!url.startsWith('local-cache://')) {
            try {
                const temp = new Image();
                temp.onload = async () => {
                    try {
                        const resizedDataUrl = await resizeImageToWebp(url);
                        await chrome.runtime.sendMessage({
                            action: 'saveImageCache',
                            url: url,
                            dataUrl: resizedDataUrl
                        });
                    } catch (resizeErr) {
                        console.warn('Prefetch: Resize failed:', resizeErr);
                    }
                };
                temp.src = url;
                return;
            } catch (err) {
                console.warn('Prefetch: Direct load failed:', err);
            }
        }

        try {
            await chrome.runtime.sendMessage({ action: 'getImageCacheFromDrive', hash });
        } catch (driveErr) {
            console.error('Prefetch: Drive download failed:', driveErr);
        }
    });
}

/**
 * レンダリングされた画像要素に対してビューポート優先遅延キャッシュを適用します
 */
async function applyImageCaches(container) {
    const images = container.querySelectorAll('img[data-original-src]');
    if (images.length === 0) return;
    
    if (!imageCacheObserver) {
        imageCacheObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const originalSrc = img.getAttribute('data-original-src');
                    
                    imageCacheObserver.unobserve(img);
                    
                    if (originalSrc) {
                        loadAndFallbackImage(img, originalSrc);
                    }
                }
            });
        }, {
            root: null,
            rootMargin: '300px',
            threshold: 0.01
        });
    }
    
    images.forEach(img => {
        if (img.src && !img.src.includes('sidepanel.html') && img.src.startsWith('data:')) {
            return;
        }
        imageCacheObserver.observe(img);
    });
}
