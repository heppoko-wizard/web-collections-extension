/**
 * drive-sync.js - Google Drive同期モジュール
 * コレクションデータをGoogle Driveに暗号化保存・取得するためのAPI連携
 */

const DriveSync = {
    // 設定
    SYNC_FILENAME: 'web-collections-data.enc',
    SCOPES: 'https://www.googleapis.com/auth/drive.appdata',

    /**
     * OAuth認証を行い、アクセストークンを取得
     * @returns {Promise<string>} アクセストークン
     */
    async authenticate() {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(token);
                }
            });
        });
    },

    /**
     * アクセストークンを無効化（ログアウト用）
     * @param {string} token
     */
    async revokeToken(token) {
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
        return new Promise((resolve) => {
            chrome.identity.removeCachedAuthToken({ token }, resolve);
        });
    },

    /**
     * AppDataフォルダ内のファイル一覧を取得
     * @param {string} token - アクセストークン
     * @returns {Promise<Array>} ファイル一覧
     */
    async listFiles(token) {
        const response = await fetch(
            'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder',
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        const data = await response.json();
        return data.files || [];
    },

    /**
     * 同期ファイルのIDを取得（存在しない場合はnull）
     * @param {string} token
     * @returns {Promise<string|null>} ファイルID
     */
    async getSyncFileId(token) {
        const files = await this.listFiles(token);
        const syncFile = files.find(f => f.name === this.SYNC_FILENAME);
        return syncFile ? syncFile.id : null;
    },

    /**
     * 暗号化データをGoogle Driveにアップロード
     * @param {string} token - アクセストークン
     * @param {object} encryptedData - {encrypted, salt, iv}
     * @returns {Promise<object>} アップロード結果
     */
    async upload(token, encryptedData) {
        const fileId = await this.getSyncFileId(token);
        const content = JSON.stringify(encryptedData);
        const blob = new Blob([content], { type: 'application/json' });

        const metadata = {
            name: this.SYNC_FILENAME,
            mimeType: 'application/json'
        };

        // 新規作成の場合はappDataFolderに配置
        if (!fileId) {
            metadata.parents = ['appDataFolder'];
        }

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const url = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const method = fileId ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { Authorization: `Bearer ${token}` },
            body: form
        });

        return response.json();
    },

    /**
     * Google Driveから暗号化データをダウンロード
     * @param {string} token - アクセストークン
     * @returns {Promise<object|null>} {encrypted, salt, iv} または null
     */
    async download(token) {
        const fileId = await this.getSyncFileId(token);
        if (!fileId) {
            return null;
        }

        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * 同期ファイルを削除
     * @param {string} token
     */
    async deleteFile(token) {
        const fileId = await this.getSyncFileId(token);
        if (fileId) {
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
        }
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.DriveSync = DriveSync;
}
