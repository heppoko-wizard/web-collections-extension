/**
 * image-processor.js - Image processing helper for service worker
 * Provides Base64 conversion utilities for background operations
 */

const ImageProcessor = {
    /**
     * Convert image URL to optimized Base64 (via offscreen document)
     * Service workers can't use Canvas directly, so this uses fetch + offscreen
     */
    async urlToBase64(imageUrl) {
        try {
            // Fetch image as blob
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error('Failed to fetch image');
            }

            const blob = await response.blob();

            //'Base64変換（簡易版 - 最適化なし）
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Failed to convert image to Base64:', error);
            return null;
        }
    },

    /**
     * Optimize images in item data
     * This is a placeholder - full optimization requires UI context
     */
    async optimizeItemImages(item) {
        // 画像タイプの場合のみ処理
        if (item.type === 'image' && item.imageUrl) {
            // Note: Full WebP optimization requires Canvas (UI context)
            // For now, just fetch and convert
            const base64 = await this.urlToBase64(item.imageUrl);
            if (base64) {
                item.thumbnailBase64 = base64;
                item.thumbnailOptimized = false; // Flag that this needs UI optimization
            }
        }
        return item;
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.ImageProcessor = ImageProcessor;
}
