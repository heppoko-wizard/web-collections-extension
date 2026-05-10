// js/panel-dragdrop.js

/**
 * panel-dragdrop.js - ドラッグ＆ドロップによる並べ替えロジック
 */

/**
 * ドラッグ＆ドロップの初期化
 * @param {object} elements - DOM要素の参照
 * @param {Function} onSaveOrder - 順序保存時のコールバック
 */
export function initDragDrop(elements, onSaveOrder) {
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
            
            // 新しい順序を取得してコールバック
            const itemIds = Array.from(elements.itemsList.querySelectorAll('.item-card'))
                .map(card => card.dataset.id);
            if (onSaveOrder) onSaveOrder(itemIds);
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
