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
            try {
                // 1. Fetch image
                const response = await fetch(item.imageUrl);
                if (!response.ok) throw new Error('Failed to fetch image');
                const blob = await response.blob();

                // 2. Create ImageBitmap
                const bitmap = await createImageBitmap(blob);

                // 3. Calculate dimensions (Max 320px)
                const MAX_DIMENSION = 320;
                let width = bitmap.width;
                let height = bitmap.height;

                if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    const ratio = width / height;
                    if (width > height) {
                        width = MAX_DIMENSION;
                        height = Math.round(MAX_DIMENSION / ratio);
                    } else {
                        height = MAX_DIMENSION;
                        width = Math.round(MAX_DIMENSION * ratio);
                    }
                }

                // 4. Use OffscreenCanvas to resize
                const canvas = new OffscreenCanvas(width, height);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0, width, height);

                // 5. Convert to Blob (WebP) then base64
                // Note: convertToBlob is standard for OffscreenCanvas
                const optimizedBlob = await canvas.convertToBlob({
                    type: 'image/webp',
                    quality: 0.7
                });

                // 6. Convert Blob to Base64
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                });
                reader.readAsDataURL(optimizedBlob);
                const base64 = await base64Promise;

                // 7. Update item
                item.thumbnailBase64 = base64; // Fallback / standard field
                item.imageUrl = base64; // Replace original URL with optimized data for storage
                item.thumbnailOptimized = true;

                // Cleanup
                bitmap.close();

            } catch (error) {
                console.warn('Image optimization failed (using original):', error);

                // Fallback to simple fetch if optimization fails
                try {
                    const simpleBase64 = await this.urlToBase64(item.imageUrl);
                    if (simpleBase64) {
                        item.imageUrl = simpleBase64;
                    }
                } catch (e) {
                    console.error('Fallback failed:', e);
                }
            }
        }
        return item;
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.ImageProcessor = ImageProcessor;
}
