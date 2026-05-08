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
     * ファイルを書き込む（汎用）
     */
    async writeFile(filename, content) {
        const dirHandle = await this.getSavedDirectoryHandle();
        if (!dirHandle) throw new Error('No folder selected');
        
        const hasPermission = await this.verifyPermission(dirHandle, true);
        if (!hasPermission) throw new Error('Permission denied');

        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    },

    /**
     * ファイルを読み込む（汎用）
     */
    async readFile(filename) {
        const dirHandle = await this.getSavedDirectoryHandle();
        if (!dirHandle) throw new Error('No folder selected');

        const hasPermission = await this.verifyPermission(dirHandle, false);
        if (!hasPermission) throw new Error('Permission denied');

        const fileHandle = await dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return await file.text();
    },

    /**
     * Push data to folder (Legacy support for single file)
     */
    async pushToFolder(data, onProgress) {
        if (onProgress) onProgress('Writing file...');
        await this.writeFile(this.FILENAME, data);
        if (onProgress) onProgress('Export complete!');
    },

    /**
     * Pull data from folder (Legacy support for single file)
     */
    async pullFromFolder(onProgress) {
        if (onProgress) onProgress('Reading file...');
        try {
            const text = await this.readFile(this.FILENAME);
            if (onProgress) onProgress('Import complete!');
            return JSON.parse(text);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                throw new Error('collections.json not found');
            }
            throw error;
        }
    },

    /**
     * ディレクトリ内のファイル一覧を取得
     */
    async listFiles() {
        const dirHandle = await this.getSavedDirectoryHandle();
        if (!dirHandle) throw new Error('No folder selected');
        
        const hasPermission = await this.verifyPermission(dirHandle, false);
        if (!hasPermission) throw new Error('Permission denied');

        const files = [];
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                files.push(entry.name);
            }
        }
        return files;
    }
};

// Make available globally
window.FolderSync = FolderSync;
