/**
 * GitHub Gist Sync Module
 * Handles synchronization of collections data via GitHub Gist
 */

const GistSync = {
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
    },

    /**
     * Find existing collections Gist
     */
    async findGist(token) {
        try {
            const response = await fetch(`${this.GIST_API_BASE}/gists`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch gists');
            }

            const gists = await response.json();

            // Find gist with our filename
            for (const gist of gists) {
                if (gist.files[this.GIST_FILENAME]) {
                    return gist.id;
                }
            }

            return null;
        } catch (error) {
            console.error('Failed to find gist:', error);
            throw error;
        }
    },

    /**
     * Create a new Gist
     */
    async createGist(token, collectionsData) {
        try {
            const response = await fetch(`${this.GIST_API_BASE}/gists`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: 'Web Collections Sync Data',
                    public: false,
                    files: {
                        [this.GIST_FILENAME]: {
                            content: JSON.stringify(collectionsData, null, 2)
                        }
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create gist');
            }

            const gist = await response.json();
            await this.saveGistId(gist.id);
            return gist.id;
        } catch (error) {
            console.error('Failed to create gist:', error);
            throw error;
        }
    },

    /**
     * Update existing Gist
     */
    async updateGist(token, gistId, collectionsData) {
        try {
            const response = await fetch(`${this.GIST_API_BASE}/gists/${gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: {
                        [this.GIST_FILENAME]: {
                            content: JSON.stringify(collectionsData, null, 2)
                        }
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update gist');
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to update gist:', error);
            throw error;
        }
    },

    /**
     * Fetch data from Gist
     */
    async fetchGist(token, gistId) {
        try {
            const response = await fetch(`${this.GIST_API_BASE}/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch gist');
            }

            const gist = await response.json();
            const fileContent = gist.files[this.GIST_FILENAME]?.content;

            if (!fileContent) {
                throw new Error('Collections file not found in gist');
            }

            return JSON.parse(fileContent);
        } catch (error) {
            console.error('Failed to fetch gist:', error);
            throw error;
        }
    },

    /**
     * Push local data to Gist
     */
    async pushToGist(collectionsData, onProgress) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('GitHub token not configured');
        }

        if (onProgress) onProgress('Checking Gist...');

        let gistId = await this.getGistId();

        if (!gistId) {
            // Try to find existing gist
            gistId = await this.findGist(token);
        }

        if (onProgress) onProgress('Uploading data...');

        if (gistId) {
            await this.updateGist(token, gistId, collectionsData);
        } else {
            gistId = await this.createGist(token, collectionsData);
        }

        if (onProgress) onProgress('Sync complete!');

        return gistId;
    },

    /**
     * Pull data from Gist to local
     */
    async pullFromGist(onProgress) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('GitHub token not configured');
        }

        if (onProgress) onProgress('Fetching from Gist...');

        let gistId = await this.getGistId();

        if (!gistId) {
            gistId = await this.findGist(token);
            if (gistId) {
                await this.saveGistId(gistId);
            } else {
                throw new Error('No existing gist found');
            }
        }

        const data = await this.fetchGist(token, gistId);

        if (onProgress) onProgress('Download complete!');

        return data;
    }
};

// Make available globally
window.GistSync = GistSync;
