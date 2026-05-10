/**
 * Folder Sync Module using File System Access API
 * Allows syncing collections data with a local folder (e.g., OneDrive, Google Drive)
 */

export const FolderSync = {
    DB_NAME: 'WebCollectionsSyncDB',
    STORE_NAME: 'handles',
    HANDLE_KEY: 'sync_folder_handle',
    MANIFESTS_DIR: 'manifests',
    COLLECTIONS_DIR: 'collections',

    /**
     * デバイス固有のマニフェストファイル名を取得
     */
    getManifestName(deviceId) {
        return `manifest_${deviceId}.json`;
    },

    /**
     * デバイス固有のコレクションファイル名を取得
     */
    getCollectionFileName(collectionId, deviceId) {
        return `collection_${collectionId}_${deviceId}.json`;
    },

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
     * ハンドルの権限を確認し、必要に応じて要求する
     * @param {FileSystemHandle} handle
     * @param {boolean} readWrite - 書き込み権限が必要か
     * @returns {Promise<boolean>} 許可されたらtrue
     */
    async verifyPermission(handle, readWrite = false) {
        const options = { mode: readWrite ? 'readwrite' : 'read' };

        // 1. 現在の権限状態を確認
        if ((await handle.queryPermission(options)) === 'granted') {
            return true;
        }

        // 2. 権限を要求（注意: ユーザージェスチャーが必要）
        if ((await handle.requestPermission(options)) === 'granted') {
            return true;
        }

        return false;
    },

    /**
     * 権限があるかのみを確認（UIを妨げない）
     * @param {FileSystemHandle} handle
     * @param {boolean} readWrite
     * @returns {Promise<boolean>}
     */
    async hasPermission(handle, readWrite = false) {
        const options = { mode: readWrite ? 'readwrite' : 'read' };
        return (await handle.queryPermission(options)) === 'granted';
    },

    /**
     * 指定された名前のディレクトリハンドルを取得（存在しなければ作成）
     */
    async getDirectoryHandle(parentHandle, name, create = true) {
        return await parentHandle.getDirectoryHandle(name, { create });
    },

    /**
     * ファイルを書き込む（ディレクトリ指定対応）
     * @param {string} filename 
     * @param {string} content 
     * @param {FileSystemDirectoryHandle} [dirHandle] 
     */
    async writeFile(filename, content, dirHandle = null) {
        const targetDir = dirHandle || await this.getSavedDirectoryHandle();
        if (!targetDir) throw new Error('No target directory');
        
        const hasPermission = await this.hasPermission(targetDir, true);
        if (!hasPermission) throw new Error('Permission denied or expired');

        const fileHandle = await targetDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    },

    /**
     * ファイルを読み込む（ディレクトリ指定対応）
     */
    async readFile(filename, dirHandle = null) {
        const targetDir = dirHandle || await this.getSavedDirectoryHandle();
        if (!targetDir) throw new Error('No target directory');

        const hasPermission = await this.hasPermission(targetDir, false);
        if (!hasPermission) throw new Error('Permission denied or expired');

        const fileHandle = await targetDir.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return await file.text();
    },

    /**
     * manifests/ ディレクトリ内のマニフェスト一覧を取得
     */
    async listManifests() {
        const rootHandle = await this.getSavedDirectoryHandle();
        if (!rootHandle) throw new Error('No folder selected');
        
        const manifestDirHandle = await this.getDirectoryHandle(rootHandle, this.MANIFESTS_DIR, true);
        const files = [];
        for await (const entry of manifestDirHandle.values()) {
            if (entry.kind === 'file' && entry.name.startsWith('manifest_') && entry.name.endsWith('.json')) {
                files.push(entry.name);
            }
        }
        return files;
    },

    /**
     * collections/ ディレクトリ内のファイル一覧を取得
     */
    async listCollections() {
        const rootHandle = await this.getSavedDirectoryHandle();
        if (!rootHandle) throw new Error('No folder selected');
        
        const colDirHandle = await this.getDirectoryHandle(rootHandle, this.COLLECTIONS_DIR, true);
        const files = [];
        for await (const entry of colDirHandle.values()) {
            if (entry.kind === 'file' && entry.name.startsWith('collection_') && entry.name.endsWith('.json')) {
                files.push(entry.name);
            }
        }
        return files;
    },

};

// 互換性維持
if (typeof window !== 'undefined') {
    window.FolderSync = FolderSync;
}
