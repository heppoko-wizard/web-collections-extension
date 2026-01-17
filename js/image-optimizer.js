/**
 * Image Optimization Module
 * Converts images to WebP format with resizing for efficient storage
 */

const ImageOptimizer = {
    MAX_DIMENSION: 320,
    WEBP_QUALITY: 0.7,
    OUTPUT_FORMAT: 'image/webp',

    /**
     * Load image from URL
     */
    async loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    },

    /**
     * Calculate new dimensions maintaining aspect ratio
     */
    calculateDimensions(width, height) {
        if (width <= this.MAX_DIMENSION && height <= this.MAX_DIMENSION) {
            return { width, height };
        }

        const ratio = width / height;

        if (width > height) {
            return {
                width: this.MAX_DIMENSION,
                height: Math.round(this.MAX_DIMENSION / ratio)
            };
        } else {
            return {
                width: Math.round(this.MAX_DIMENSION * ratio),
                height: this.MAX_DIMENSION
            };
        }
    },

    /**
     * Optimize image to WebP Base64
     */
    async optimizeImage(imageUrl) {
        try {
            // Load the image
            const img = await this.loadImage(imageUrl);

            // Calculate new dimensions
            const { width, height } = this.calculateDimensions(img.width, img.height);

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to WebP Base64
            const base64 = canvas.toDataURL(this.OUTPUT_FORMAT, this.WEBP_QUALITY);

            return {
                data: base64,
                width,
                height,
                originalSize: { width: img.width, height: img.height }
            };
        } catch (error) {
            console.error('Failed to optimize image:', error);
            throw error;
        }
    },

    /**
     * Optimize multiple images with progress callback
     */
    async optimizeImages(imageUrls, onProgress) {
        const results = [];

        for (let i = 0; i < imageUrls.length; i++) {
            if (onProgress) {
                onProgress(i + 1, imageUrls.length);
            }

            try {
                const result = await this.optimizeImage(imageUrls[i]);
                results.push(result);
            } catch (error) {
                console.warn(`Failed to optimize image ${i}:`, error);
                results.push(null);
            }
        }

        return results;
    },

    /**
     * Get estimated size of Base64 string in KB
     */
    getBase64Size(base64String) {
        // Remove data URL prefix if present
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
        // Base64 encoding increases size by ~33%, so actual size is length * 0.75
        return Math.round((base64Data.length * 0.75) / 1024);
    }
};

// Make available globally
window.ImageOptimizer = ImageOptimizer;
