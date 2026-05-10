/**
 * GitHub Gist Sync Module
 * Handles synchronization of collections data via GitHub Gist
 */

export const GistSync = {
    GIST_API_BASE: 'https://api.github.com',
    STORAGE_KEY_TOKEN: 'gist_token',
    STORAGE_KEY_GIST_ID: 'gist_id',
    GIST_FILENAME: 'collections.json',

    /**
     * Get stored GitHub token
     */
    async getToken() {
        const result = await chrome.storage.local.get(this.STORAGE_KEY_TOKEN);
        return result[this.STORAGE_KEY_TOKEN] || null;
    },

    /**
     * Save GitHub token
     */
    async saveToken(token) {
        await chrome.storage.local.set({ [this.STORAGE_KEY_TOKEN]: token });
    },

    /**
     * Get stored Gist ID
     */
    async getGistId() {
        const result = await chrome.storage.local.get(this.STORAGE_KEY_GIST_ID);
        return result[this.STORAGE_KEY_GIST_ID] || null;
    },

    /**
     * Save Gist ID
     */
    async saveGistId(gistId) {
        await chrome.storage.local.set({ [this.STORAGE_KEY_GIST_ID]: gistId });
    },

    /**
     * Validate token by attempting to fetch user info
     */
    async validateToken(token) {
        try {
            const response = await fetch(`${this.GIST_API_BASE}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Token validation failed:', error);
            return false;
        }
    }
};

// 互換性維持
if (typeof globalThis !== 'undefined') {
    globalThis.GistSync = GistSync;
}
