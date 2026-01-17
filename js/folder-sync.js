/**
 * Folder Sync Module using File System Access API
 * Allows syncing collections data with a local folder (e.g., OneDrive, Google Drive)
 */

const FolderSync = {
    DB_NAME: 'WebCollectionsSyncDB',
    STORE_NAME: 'handles',
    HANDLE_KEY: 'sync_folder_handle',
    FILENAME: 'collections.json',

    /**
     * Open DB and get object store
     */
    async getStore(mode = 'readonly') {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(this.STORE_NAME, mode);
                const store = transaction.objectStore(this.STORE_NAME);
                resolve(store);
            };

            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Save directory handle to IndexedDB
     */
    async saveDirectoryHandle(handle) {
        const store = await this.getStore('readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(handle, this.HANDLE_KEY);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get directory handle from IndexedDB
     */
    async getSavedDirectoryHandle() {
        try {
            const store = await this.getStore('readonly');
            return new Promise((resolve, reject) => {
                const request = store.get(this.HANDLE_KEY);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Failed to get saved directory handle:', error);
            return null;
        }
    },

    /**
     * Clear saved directory handle
     */
    async clearSavedHandle() {
        const store = await this.getStore('readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(this.HANDLE_KEY);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Request user to select a directory
     */
    async requestDirectoryAccess() {
        try {
            const handle = await window.showDirectoryPicker();
            await this.saveDirectoryHandle(handle);
            return handle;
        } catch (error) {
            if (error.name === 'AbortError') {
                return null; // User cancelled
            }
            throw error;
        }
    },

    /**
     * Verify permission for the handle
     */
    async verifyPermission(handle, readWrite = false) {
        const options = { mode: readWrite ? 'readwrite' : 'read' };

        // Check if permission was already granted
        if ((await handle.queryPermission(options)) === 'granted') {
            return true;
        }

        // Request permission
        if ((await handle.requestPermission(options)) === 'granted') {
            return true;
        }

        return false;
    },

    /**
     * Push data to folder
     */
    async pushToFolder(collectionsData, onProgress) {
        if (onProgress) onProgress('Checking folder access...');

        const dirHandle = await this.getSavedDirectoryHandle();
        if (!dirHandle) {
            throw new Error('No folder selected');
        }

        const hasPermission = await this.verifyPermission(dirHandle, true);
        if (!hasPermission) {
            throw new Error('Permission denied');
        }

        if (onProgress) onProgress('Writing file...');

        const fileHandle = await dirHandle.getFileHandle(this.FILENAME, { create: true });
        const writable = await fileHandle.createWritable();

        await writable.write(JSON.stringify(collectionsData, null, 2));
        await writable.close();

        if (onProgress) onProgress('Export complete!');
    },

    /**
     * Pull data from folder
     */
    async pullFromFolder(onProgress) {
        if (onProgress) onProgress('Checking folder access...');

        const dirHandle = await this.getSavedDirectoryHandle();
        if (!dirHandle) {
            throw new Error('No folder selected');
        }

        const hasPermission = await this.verifyPermission(dirHandle, false);
        if (!hasPermission) {
            throw new Error('Permission denied');
        }

        if (onProgress) onProgress('Reading file...');

        try {
            const fileHandle = await dirHandle.getFileHandle(this.FILENAME);
            const file = await fileHandle.getFile();
            const text = await file.text();

            if (onProgress) onProgress('Import complete!');

            return JSON.parse(text);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                throw new Error('collections.json not found in selected folder');
            }
            throw error;
        }
    }
};

// Make available globally
window.FolderSync = FolderSync;
