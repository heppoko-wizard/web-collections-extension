// js/google-drive-sync.js

import { encrypt, decrypt } from './encryption-helper.js';
import { getImageHash, getLocalCache, saveLocalCache, getLocalCachesBulk } from './image-cache-helper.js';

/**
 * 指定した時間だけ非同期で待機します
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GoogleDriveSync - Google Drive (appDataFolder) 同期プロバイダー
 * アプリ専用の隠し保存領域にGZIP圧縮および暗号化を施した単一ファイルを配置します
 */
export const GoogleDriveSync = {
    FILE_NAME: 'web-collections-all.enc',
    IMAGE_INDEX_FILE_NAME: 'web-collections-images-index.enc',

    /**
     * アップロード失敗した画像のハッシュとURLを未処理リストへ保存します
     */
    async addPendingImageUpload(hash, url) {
        try {
            const result = await chrome.storage.local.get('wc_pending_image_uploads');
            const pending = result.wc_pending_image_uploads || [];
            if (!pending.some(p => p.hash === hash)) {
                pending.push({ hash, url });
                await chrome.storage.local.set({ wc_pending_image_uploads: pending });
                console.log(`GoogleDriveSync: Registered pending image upload: ${hash}`);
            }
        } catch (err) {
            console.error('GoogleDriveSync: Failed to save pending image upload:', err);
        }
    },

    /**
     * Google OAuth アクセストークンを取得します
     */
    async getAuthToken(interactive = true) {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(token);
                }
            });
        });
    },

    /**
     * キャッシュされたトークンを破棄します（認証エラー時のリカバリ用）
     */
    async removeCachedToken(token) {
        return new Promise((resolve) => {
            chrome.identity.removeCachedAuthToken({ token }, () => {
                resolve();
            });
        });
    },

    /**
     * 認証ヘッダ付きでAPIリクエストを実行します（401エラー時は自動的にトークンをクリアして再試行）
     */
    async fetchWithAuth(url, options = {}, interactive = true) {
        let token = await this.getAuthToken(interactive);
        
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
        
        let response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            console.warn('GoogleDriveSync: Unauthorized access. Clearing token cache and retrying...');
            await this.removeCachedToken(token);
            token = await this.getAuthToken(interactive);
            
            headers['Authorization'] = `Bearer ${token}`;
            response = await fetch(url, { ...options, headers });
        }
        
        return response;
    },

    /**
     * appDataFolder 内にある同期ファイルを検索します
     */
    async findSyncFile(interactive = true) {
        const query = encodeURIComponent(`name = '${this.FILE_NAME}' and 'appDataFolder' in parents`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`;
        
        const response = await this.fetchWithAuth(url, { method: 'GET' }, interactive);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to query drive files: ${response.status} ${response.statusText} - ${errText}`);
        }
        
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0] : null;
    },

    /**
     * GZIP形式で文字列データを高圧縮し、Base64文字列として返却します
     */
    async compressData(stringData) {
        const stream = new Blob([stringData]).stream();
        const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
        const response = new Response(compressedStream);
        const buffer = await response.arrayBuffer();
        
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    /**
     * GZIP圧縮されたBase64文字列を展開し、元の文字列へデコードします
     */
    async decompressData(base64Str) {
        const binary = atob(base64Str);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        const stream = new Blob([bytes]).stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
        const response = new Response(decompressedStream);
        return await response.text();
    },

    /**
     * コレクションデータ内の巨大な埋め込み画像（Base64）を抽出し、
     * 個別画像キャッシュへ退避させてJSONをダイエットさせます。
     */
    async cleanAndExtractEmbeddedImages(storage) {
        console.log('GoogleDriveSync: Scanning for embedded Base64 images to cleanse JSON...');
        const collections = await storage._getCollectionsRaw();
        let modified = false;
        const tasks = [];

        for (const col of collections) {
            if (col.items && Array.isArray(col.items)) {
                for (const item of col.items) {
                    if (item.imageUrl && item.imageUrl.startsWith('data:image/')) {
                        const dataUrl = item.imageUrl;
                        const hash = await getImageHash(dataUrl);
                        
                        console.log(`GoogleDriveSync: Found embedded imageUrl in item "${item.title || 'Untitled'}". Extracting...`);
                        await saveLocalCache(hash, dataUrl);
                        
                        item.imageUrl = `local-cache://${hash}`;
                        item.updatedAt = Date.now();
                        col.updatedAt = Date.now();
                        modified = true;
                        
                        tasks.push({ hash, dataUrl, url: item.url || '' });
                    }

                    if (item.type === 'image' && item.content && item.content.startsWith('data:image/')) {
                        const dataUrl = item.content;
                        const hash = await getImageHash(dataUrl);
                        
                        console.log(`GoogleDriveSync: Found embedded content image in item "${item.title || 'Untitled'}". Extracting...`);
                        await saveLocalCache(hash, dataUrl);
                        
                        item.content = `local-cache://${hash}`;
                        item.updatedAt = Date.now();
                        col.updatedAt = Date.now();
                        modified = true;
                        
                        tasks.push({ hash, dataUrl, url: item.url || '' });
                    }
                }
            }
        }

        if (modified) {
            await storage._saveCollectionsRaw(collections);
            console.log('GoogleDriveSync: Local JSON successfully cleansed and lightweighted.');

            (async () => {
                console.log(`GoogleDriveSync: Starting background upload of ${tasks.length} cleansed images...`);
                for (const task of tasks) {
                    try {
                        await this.uploadImageOnRegistration(task.hash, task.dataUrl, task.url);
                    } catch (uploadErr) {
                        console.error(`GoogleDriveSync: Failed to upload cleansed image in background for hash ${task.hash}:`, uploadErr);
                    }
                }
                console.log('GoogleDriveSync: Background upload of cleansed images completed.');
            })();
        } else {
            console.log('GoogleDriveSync: No embedded images detected. Clean.');
        }

        return modified;
    },

    /**
     * ローカルの全データを圧縮および暗号化してGoogleドライブへプッシュします
     */
    async push(storage, forceAll = false, interactive = true) {
        console.log('GoogleDriveSync: Pushing to Google Drive...');

        // 未処理画像のアップロードを再試行
        try {
            const pending = await chrome.storage.local.get('wc_pending_image_uploads');
            const pendingUploads = pending.wc_pending_image_uploads || [];
            if (pendingUploads.length > 0) {
                console.log(`GoogleDriveSync: Retrying ${pendingUploads.length} pending image uploads...`);
                await chrome.storage.local.remove('wc_pending_image_uploads');
                for (const task of pendingUploads) {
                    const localData = await getLocalCache(task.hash);
                    if (localData) {
                        await this.uploadImageOnRegistration(task.hash, localData, task.url);
                    }
                }
            }
        } catch (pendingErr) {
            console.warn('GoogleDriveSync: Failed to process pending image uploads:', pendingErr);
        }

        const startTime = performance.now();
        const report = {};
        
        try {
            const cleanseStart = performance.now();
            const cleansed = await this.cleanAndExtractEmbeddedImages(storage);
            report.cleanseTime = Math.round(performance.now() - cleanseStart);
            if (cleansed) {
                console.log('GoogleDriveSync: Database was cleansed. Forcing upload.');
                forceAll = true;
            }

            const purgeStart = performance.now();
            // 猶予期間三十日を過ぎた論理削除データを物理パージして軽量化
            await storage.purgeDeletedData(30);
            report.purgeTime = Math.round(performance.now() - purgeStart);

            // 不要なプッシュ同期のスキップチェック
            if (!forceAll) {
                const settings = await storage.getSettings();
                const lastSyncTime = settings.lastSyncTime || 0;
                
                if (lastSyncTime > 0) {
                    const collections = await storage._getCollectionsRaw();
                    const hasLocalChanges = collections.some(c => (c.updatedAt || 0) > lastSyncTime);
                    
                    if (!hasLocalChanges) {
                        console.log('GoogleDriveSync: No local changes since last sync. Skipping push.');
                        report.skipped = true;
                        report.totalTime = Math.round(performance.now() - startTime);
                        return { success: true, report };
                    }
                }
            }
        } catch (purgeErr) {
            console.warn('GoogleDriveSync: Failed to execute purge or change detection before push:', purgeErr);
        }

        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`GoogleDriveSync: Push attempt ${attempt}/${maxRetries}`);
            
            if (attempt > 1) {
                const delay = attempt * 2000;
                console.log(`GoogleDriveSync: Waiting ${delay}ms before retry...`);
                await sleep(delay);
            }
            
            try {
                // 1. ローカルデータベースから全データをJSONとしてエクスポート
                const exportStart = performance.now();
                const rawJson = await storage.exportToJson();
                report.exportTime = Math.round(performance.now() - exportStart);
                
                // 2. ブラウザ標準の機能でGZIP圧縮を施しBase64にエンコード
                const compressStart = performance.now();
                const compressedBase64 = await this.compressData(rawJson);
                report.compressTime = Math.round(performance.now() - compressStart);
                
                // 3. 圧縮データをAES-GCMで暗号化して堅牢なBase64暗号文を取得
                const encryptStart = performance.now();
                const encryptedData = await encrypt(compressedBase64);
                report.encryptTime = Math.round(performance.now() - encryptStart);
                
                // 4. Googleドライブ内の既存ファイルを検索
                const searchStart = performance.now();
                const syncFile = await this.findSyncFile(interactive);
                report.searchTime = Math.round(performance.now() - searchStart);
                
                const storageResult = await chrome.storage.local.get('wc_last_modified_time');
                const lastModifiedTime = storageResult.wc_last_modified_time;
                
                if (syncFile) {
                    // 事前競合チェック: ドライブ上のmodifiedTimeとローカルの最終既知modifiedTimeが異なる場合
                    // ただし最大試行回数に達した最後のイテレーションでは、同期デッドロックを回避するために競合チェックをスキップして強制プッシュします
                    if (!forceAll && lastModifiedTime && syncFile.modifiedTime !== lastModifiedTime && attempt < maxRetries) {
                        console.warn(`GoogleDriveSync: Conflict detected before push (Cloud modifiedTime: ${syncFile.modifiedTime}, Local modifiedTime: ${lastModifiedTime}). Merging cloud data...`);
                        try {
                            await this.pull(storage, interactive);
                        } catch (pullErr) {
                            console.error('GoogleDriveSync: Failed to pull cloud data during conflict resolution:', pullErr);
                            throw pullErr;
                        }
                        // マージされたので、次のリトライイテレーションで最新データを再エクスポートして再試行
                        continue;
                    }
                    
                    // 既存ファイルが存在する場合はメディア上書き（PATCH）を実行
                    const uploadStart = performance.now();
                    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${syncFile.id}?uploadType=media`;
                    
                    const headers = {
                        'Content-Type': 'text/plain'
                    };
                    
                    const response = await this.fetchWithAuth(uploadUrl, {
                        method: 'PATCH',
                        headers,
                        body: encryptedData
                    }, interactive);
                    
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Failed to update drive file: ${response.status} ${response.statusText} - ${errText}`);
                    }
                    
                    report.uploadTime = Math.round(performance.now() - uploadStart);
                    
                    // 成功したら新しい modifiedTime を取得して保存するため、再度検索を実行
                    const updatedFile = await this.findSyncFile(interactive);
                    const newModifiedTime = updatedFile ? updatedFile.modifiedTime : null;
                    
                    if (newModifiedTime) {
                        await chrome.storage.local.set({ wc_last_modified_time: newModifiedTime });
                        console.log('GoogleDriveSync: Saved new modifiedTime after PATCH:', newModifiedTime);
                    }
                    
                    console.log('GoogleDriveSync: Successfully updated existing sync file.');
                    console.log('GoogleDriveSync: Push completed successfully.');
                    report.totalTime = Math.round(performance.now() - startTime);
                    return { success: true, report };
                } else {
                    // 新規ファイルを作成（マルチパートリクエストによるメタデータとファイルの同時POST）
                    const uploadStart = performance.now();
                    const metadata = {
                        name: this.FILE_NAME,
                        parents: ['appDataFolder']
                    };
                    
                    const boundary = '-------314159265358979323846';
                    const delimiter = `\r\n--${boundary}\r\n`;
                    const closeDelimiter = `\r\n--${boundary}--`;
                    
                    const multipartBody = 
                        delimiter +
                        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                        JSON.stringify(metadata) +
                        delimiter +
                        'Content-Type: text/plain\r\n\r\n' +
                        encryptedData +
                        closeDelimiter;
                        
                    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
                    const response = await this.fetchWithAuth(uploadUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/related; boundary=${boundary}`
                        },
                        body: multipartBody
                    }, interactive);
                    
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Failed to create drive file: ${response.status} ${response.statusText} - ${errText}`);
                    }
                    
                    report.uploadTime = Math.round(performance.now() - uploadStart);
                    
                    // 新規作成成功後に最新の modifiedTime を取得して保存
                    const updatedFile = await this.findSyncFile(interactive);
                    const newModifiedTime = updatedFile ? updatedFile.modifiedTime : null;
                    
                    if (newModifiedTime) {
                        await chrome.storage.local.set({ wc_last_modified_time: newModifiedTime });
                        console.log('GoogleDriveSync: Successfully created new file. Saved modifiedTime:', newModifiedTime);
                    }
                    
                    console.log('GoogleDriveSync: Successfully created new sync file.');
                    console.log('GoogleDriveSync: Push completed successfully.');
                    report.totalTime = Math.round(performance.now() - startTime);
                    return { success: true, report };
                }
            } catch (err) {
                console.error(`GoogleDriveSync: Error occurred during push attempt ${attempt}:`, err);
                if (attempt === maxRetries) {
                    throw err;
                }
            }
        }
        
        throw new Error('GoogleDriveSync: Push failed due to persistent concurrent conflicts after maximum retries.');
    },

    /**
     * Googleドライブから暗号化データをダウンロードし、復号および展開してマージします
     */
    async pull(storage, interactive = true) {
        console.log('GoogleDriveSync: Pulling from Google Drive...');
        const startTime = performance.now();
        const report = {};
        
        // 1. 同期ファイルがあるかを検索します
        const t0 = performance.now();
        const syncFile = await this.findSyncFile(interactive);
        report.findFileTime = Math.round(performance.now() - t0);
        
        if (!syncFile) {
            console.log('GoogleDriveSync: No sync file found on drive. Skipping pull.');
            await chrome.storage.local.remove('wc_last_modified_time');
            report.totalTime = Math.round(performance.now() - startTime);
            return { success: true, updated: false, report };
        }
        
        // 2. 暗号化されたBase64文字列をダウンロード
        const t1 = performance.now();
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${syncFile.id}?alt=media`;
        const response = await this.fetchWithAuth(downloadUrl, { method: 'GET' }, interactive);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to download drive file: ${response.status} ${response.statusText} - ${errText}`);
        }
        
        const encryptedData = await response.text();
        report.downloadTime = Math.round(performance.now() - t1);
        
        if (!encryptedData) {
            console.warn('GoogleDriveSync: Downloaded file is empty.');
            report.totalTime = Math.round(performance.now() - startTime);
            return { success: true, updated: false, report };
        }
        
        // 3. 暗号をAES-GCMで復号し、圧縮データのBase64文字列を復元
        const t2 = performance.now();
        const compressedBase64 = await decrypt(encryptedData);
        report.decryptTime = Math.round(performance.now() - t2);
        
        // 4. GZIP圧縮を展開して元のJSONテキストを完全復元
        const t3 = performance.now();
        const rawJson = await this.decompressData(compressedBase64);
        report.decompressTime = Math.round(performance.now() - t3);
        
        // 5. ローカルデータベースへマージして取り込みます
        const t4 = performance.now();
        await storage.importFromJson(rawJson);
        report.mergeTime = Math.round(performance.now() - t4);
        
        // 6. 成功したため最新の modifiedTime を保存
        if (syncFile.modifiedTime) {
            await chrome.storage.local.set({ wc_last_modified_time: syncFile.modifiedTime });
            console.log('GoogleDriveSync: Saved last modifiedTime:', syncFile.modifiedTime);
        }
        
        report.totalTime = Math.round(performance.now() - startTime);
        console.log('GoogleDriveSync: Pull and merge completed successfully.', report);
        return { success: true, updated: true, report };
    },

    /**
     * appDataFolder 内にある画像キャッシュファイルを検索します
     */
    async findImageCacheFiles() {
        const query = encodeURIComponent("name contains 'cache_' and 'appDataFolder' in parents and trashed = false");
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`;
        
        const response = await this.fetchWithAuth(url, { method: 'GET' });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to query image cache files: ${response.status} ${response.statusText} - ${errText}`);
        }
        
        const data = await response.json();
        return data.files || [];
    },

    /**
     * appDataFolder 内にある画像キャッシュインデックスファイルを検索します
     */
    async findImageIndexFile(interactive = true) {
        const query = encodeURIComponent(`name = '${this.IMAGE_INDEX_FILE_NAME}' and 'appDataFolder' in parents`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`;
        
        const response = await this.fetchWithAuth(url, { method: 'GET' }, interactive);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to query image index file: ${response.status} ${response.statusText} - ${errText}`);
        }
        
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0] : null;
    },

    /**
     * 特定のハッシュ値に一致する画像キャッシュファイルを検索します
     */
    async findImageCacheFileByHash(hash, interactive = true) {
        const query = encodeURIComponent(`name = 'cache_${hash}' and 'appDataFolder' in parents and trashed = false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)`;
        
        const response = await this.fetchWithAuth(url, { method: 'GET' }, interactive);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to query image cache: ${response.status} ${response.statusText} - ${errText}`);
        }
        
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0] : null;
    },

    /**
     * 暗号化された画像キャッシュをGoogleドライブに個別アップロードします
     */
    async uploadImageCache(hash, encryptedData) {
        const metadata = {
            name: `cache_${hash}`,
            parents: ['appDataFolder']
        };
        
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;
        
        const multipartBody = 
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: text/plain\r\n\r\n' +
            encryptedData +
            closeDelimiter;
            
        const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        const response = await this.fetchWithAuth(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to upload image cache: ${response.status} ${response.statusText} - ${errText}`);
        }

        const data = await response.json();
        return data.id;
    },

    /**
     * 新しく登録またはキャッシュされた画像を個別にGoogleドライブへ非同期アップロードし、インデックスを更新します
     */
    async uploadImageOnRegistration(hash, dataUrl, url = '') {
        console.log(`GoogleDriveSync: uploadImageOnRegistration called for hash: ${hash}`);
        try {
            const encryptedData = await encrypt(dataUrl);
            const fileId = await this.uploadImageCache(hash, encryptedData);
            if (!fileId) {
                throw new Error('Failed to get file ID after upload');
            }

            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const pullResult = await this.pullImageIndex(false);
                    const cloudIndex = pullResult.data;
                    const expectedModifiedTime = pullResult.modifiedTime;

                    if (!cloudIndex.images) {
                        cloudIndex.images = {};
                    }

                    cloudIndex.images[hash] = {
                        fileId: fileId,
                        url: url,
                        syncedAt: Date.now()
                    };

                    const forceWrite = (attempt === maxRetries);
                    await this.pushImageIndex(cloudIndex, expectedModifiedTime, forceWrite, false);
                    console.log(`GoogleDriveSync: Successfully registered and indexed image: ${hash}`);
                    break;
                } catch (indexErr) {
                    if (indexErr.message === 'ImageIndexConflict' && attempt < maxRetries) {
                        console.warn(`GoogleDriveSync: Index conflict during on-registration upload, retry attempt ${attempt}`);
                        await sleep(attempt * 1000);
                        continue;
                    }
                    throw indexErr;
                }
            }
        } catch (err) {
            console.error(`GoogleDriveSync: Failed to upload image on registration for ${hash}:`, err);
            await this.addPendingImageUpload(hash, url);
        }
    },

    /**
     * 暗号化された画像キャッシュをGoogleドライブから個別ダウンロードします
     */
    async downloadImageCache(fileId, interactive = true) {
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await this.fetchWithAuth(downloadUrl, { method: 'GET' }, interactive);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to download image cache file: ${response.status} ${response.statusText} - ${errText}`);
        }
        return await response.text();
    },

    /**
     * 画像インデックスファイルをダウンロードして復号します
     * @param {boolean} interactive - 対話型認証を行うか
     * @param {boolean} isRebuilding - 再構築中であるかを示すフラグ
     */
    async pullImageIndex(interactive = true, isRebuilding = false) {
        const indexFile = await this.findImageIndexFile(interactive);
        if (!indexFile) {
            if (!isRebuilding) {
                console.warn('GoogleDriveSync: Image index file not found. Triggering automatic rebuild...');
                try {
                    const rebuildResult = await this.rebuildImageIndex(interactive);
                    if (rebuildResult.success) {
                        return await this.pullImageIndex(interactive, true);
                    }
                } catch (rebuildErr) {
                    console.error('GoogleDriveSync: Automatic image index rebuild failed:', rebuildErr);
                }
            }
            return { data: { version: 1, images: {} }, modifiedTime: null };
        }
        
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${indexFile.id}?alt=media`;
        const response = await this.fetchWithAuth(downloadUrl, { method: 'GET' }, interactive);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to download image index file: ${response.status} ${response.statusText} - ${errText}`);
        }
        
        const encryptedData = await response.text();
        if (!encryptedData) {
            return { data: { version: 1, images: {} }, modifiedTime: indexFile.modifiedTime };
        }
        
        const compressedBase64 = await decrypt(encryptedData);
        const rawJson = await this.decompressData(compressedBase64);
        return { data: JSON.parse(rawJson), modifiedTime: indexFile.modifiedTime };
    },

    /**
     * ドライブ上のすべての画像ファイルをスキャンし、画像インデックスファイルを再構築します
     */
    async rebuildImageIndex(interactive = true) {
        console.log('GoogleDriveSync: Rebuilding image index by scanning drive files...');
        const driveFiles = await this.findImageCacheFiles();
        
        let cloudIndex = { version: 1, images: {} };
        let expectedModifiedTime = null;
        try {
            const pullResult = await this.pullImageIndex(interactive, true);
            cloudIndex = pullResult.data;
            expectedModifiedTime = pullResult.modifiedTime;
        } catch (pullErr) {
            console.warn('GoogleDriveSync: Failed to pull existing image index during rebuild, creating fresh one:', pullErr);
        }

        if (!cloudIndex.images) {
            cloudIndex.images = {};
        }

        const newImages = {};
        let rebuiltCount = 0;

        for (const file of driveFiles) {
            if (file.name && file.name.startsWith('cache_')) {
                const hash = file.name.substring('cache_'.length);
                
                if (cloudIndex.images[hash]) {
                    newImages[hash] = {
                        ...cloudIndex.images[hash],
                        fileId: file.id
                    };
                } else {
                    newImages[hash] = {
                        fileId: file.id,
                        url: '',
                        syncedAt: Date.now()
                    };
                    rebuiltCount++;
                }
            }
        }

        cloudIndex.images = newImages;
        console.log(`GoogleDriveSync: Rebuilt ${rebuiltCount} unregistered images into index.`);
        
        await this.pushImageIndex(cloudIndex, expectedModifiedTime, true, interactive);
        console.log('GoogleDriveSync: Image index successfully rebuilt and saved to drive.');
        
        return { success: true, rebuiltCount };
    },

    /**
     * 画像インデックスファイルを暗号化してアップロードします（楽観的ロックを適用）
     */
    async pushImageIndex(indexData, expectedModifiedTime, force = false, interactive = true) {
        const rawJson = JSON.stringify(indexData);
        const compressedBase64 = await this.compressData(rawJson);
        const encryptedData = await encrypt(compressedBase64);
        
        const indexFile = await this.findImageIndexFile(interactive);
        
        if (indexFile) {
            // 楽観的ロックチェック
            if (!force && expectedModifiedTime && indexFile.modifiedTime !== expectedModifiedTime) {
                throw new Error('ImageIndexConflict');
            }
            
            const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${indexFile.id}?uploadType=media`;
            const response = await this.fetchWithAuth(uploadUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'text/plain' },
                body: encryptedData
            }, interactive);
            
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Failed to update image index: ${response.status} ${response.statusText} - ${errText}`);
            }
            
            const updatedFile = await this.findImageIndexFile(interactive);
            return updatedFile ? updatedFile.modifiedTime : null;
        } else {
            const metadata = {
                name: this.IMAGE_INDEX_FILE_NAME,
                parents: ['appDataFolder']
            };
            
            const boundary = '-------314159265358979323846';
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;
            
            const multipartBody = 
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: text/plain\r\n\r\n' +
                encryptedData +
                closeDelimiter;
                
            const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            const response = await this.fetchWithAuth(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: multipartBody
            }, interactive);
            
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Failed to create image index: ${response.status} ${response.statusText} - ${errText}`);
            }
            
            const updatedFile = await this.findImageIndexFile(interactive);
            return updatedFile ? updatedFile.modifiedTime : null;
        }
    },

    /**
     * 画像キャッシュの非破壊的差分同期処理をインデックスファイルと楽観的ロックを用いて実行します
     */
    async syncImages(storage, interactive = true) {
        console.log('GoogleDriveSync: Starting image cache sync using index file...');
        
        // 全アイテムから有効な画像URLを収集します
        const collections = await storage._getCollectionsRaw();
        const activeUrls = new Set();
        
        collections.forEach(col => {
            if (col.isDeleted) return;
            const items = col.items || [];
            items.forEach(item => {
                if (item.isDeleted) return;
                if (item.imageUrl) {
                    activeUrls.add(item.imageUrl);
                }
            });
        });
        
        if (activeUrls.size === 0) {
            console.log('GoogleDriveSync: No active images to sync.');
            return { success: true };
        }
        
        // URLとハッシュの紐付けマップを作成します（Promise.all を用いて並行処理化し劇的に高速化）
        const localActiveHashes = new Map();
        const urlArray = Array.from(activeUrls);
        const hashes = await Promise.all(urlArray.map(url => getImageHash(url)));
        for (let i = 0; i < urlArray.length; i++) {
            localActiveHashes.set(hashes[i], urlArray[i]);
        }
        
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`GoogleDriveSync: Image sync attempt ${attempt}/${maxRetries}`);
            
            if (attempt > 1) {
                const delay = attempt * 2000;
                console.log(`GoogleDriveSync: Waiting ${delay}ms before retry...`);
                await sleep(delay);
            }
            
            try {
                // 1. Google Driveから画像インデックスファイルを取得
                const pullResult = await this.pullImageIndex(interactive);
                
                const cloudIndex = pullResult.data;
                const expectedModifiedTime = pullResult.modifiedTime;
                
                if (!cloudIndex.images) {
                    cloudIndex.images = {};
                }
                
                // 同期に必要なすべてのハッシュ値を集めて一括取得 (ストレージアクセスのバルク化)
                const hashesToFetch = Array.from(localActiveHashes.keys());
                const localCacheMap = await getLocalCachesBulk(hashesToFetch);
                
                // 差分同期リストの抽出
                const toUpload = [];
                const toDownload = [];
                
                // アップロード対象の抽出: ローカルでアクティブであり、かつクラウドインデックスに記録されていない画像
                for (const [hash, url] of localActiveHashes.entries()) {
                    if (!cloudIndex.images[hash]) {
                        const localData = localCacheMap[hash];
                        if (localData) {
                            toUpload.push({ hash, data: localData, url });
                        }
                    }
                }
                
                // ダウンロード対象の抽出: クラウドインデックスに記録されており、ローカルで必要とされているが、ローカルキャッシュにない画像
                for (const [hash, url] of localActiveHashes.entries()) {
                    if (cloudIndex.images[hash]) {
                        const localData = localCacheMap[hash];
                        if (!localData) {
                            toDownload.push({ hash, fileId: cloudIndex.images[hash].fileId });
                        }
                    }
                }
                
                console.log(`GoogleDriveSync: Image sync tasks - Upload: ${toUpload.length}, Download: ${toDownload.length}`);
                
                // 同期実行 (並行処理数3制限)
                const maxConcurrency = 3;
                
                const uploadQueue = [...toUpload];
                const uploadedItems = [];
                let failedUploads = 0;
                let failedDownloads = 0;
                const runUpload = async () => {
                    while (uploadQueue.length > 0) {
                        const item = uploadQueue.shift();
                        try {
                            console.log(`GoogleDriveSync: Uploading image cache: ${item.hash}`);
                            const encryptedData = await encrypt(item.data);
                            
                            // 画像ファイルを単独でアップロード
                            const metadata = {
                                name: `cache_${item.hash}`,
                                parents: ['appDataFolder']
                            };
                            
                            const boundary = '-------314159265358979323846';
                            const delimiter = `\r\n--${boundary}\r\n`;
                            const closeDelimiter = `\r\n--${boundary}--`;
                            
                            const multipartBody = 
                                delimiter +
                                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                                JSON.stringify(metadata) +
                                delimiter +
                                'Content-Type: text/plain\r\n\r\n' +
                                encryptedData +
                                closeDelimiter;
                                
                            const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
                            const response = await this.fetchWithAuth(uploadUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                                body: multipartBody
                            }, interactive);
                            
                            if (!response.ok) {
                                const errText = await response.text();
                                throw new Error(`Failed to upload image file: ${response.status} ${response.statusText} - ${errText}`);
                            }
                            
                            // レスポンスから直接ファイルIDを取得して、追加の検索API呼び出しを排除
                            const responseData = await response.json();
                            if (responseData && responseData.id) {
                                uploadedItems.push({ hash: item.hash, fileId: responseData.id, url: item.url });
                            }
                        } catch (err) {
                            console.error(`GoogleDriveSync: Failed to upload image ${item.hash}:`, err);
                            failedUploads++;
                        }
                    }
                };
                
                const downloadQueue = [...toDownload];
                const runDownload = async () => {
                    while (downloadQueue.length > 0) {
                        const item = downloadQueue.shift();
                        try {
                            console.log(`GoogleDriveSync: Downloading image cache: ${item.hash}`);
                            const encryptedData = await this.downloadImageCache(item.fileId, interactive);
                            const decompressedBase64 = await decrypt(encryptedData);
                            await saveLocalCache(item.hash, decompressedBase64);
                        } catch (err) {
                            console.error(`GoogleDriveSync: Failed to download image ${item.hash}:`, err);
                            failedDownloads++;
                        }
                    }
                };
                
                const uploadWorkers = Array(Math.min(maxConcurrency, uploadQueue.length)).fill(null).map(runUpload);
                const downloadWorkers = Array(Math.min(maxConcurrency, downloadQueue.length)).fill(null).map(runDownload);
                
                await Promise.all([...uploadWorkers, ...downloadWorkers]);
                
                if (failedUploads > 0 || failedDownloads > 0) {
                    console.warn(`GoogleDriveSync: Image sync completed with partial errors. Failed uploads: ${failedUploads}, Failed downloads: ${failedDownloads}`);
                }
                
                // アップロード成功したものをクラウドインデックス情報に追加
                uploadedItems.forEach(item => {
                    cloudIndex.images[item.hash] = {
                        fileId: item.fileId,
                        url: item.url,
                        syncedAt: Date.now()
                    };
                });
                
                // 3. インデックスファイルを楽観的ロックで書き換え
                // 最終試行の時は、競合によるデッドロックを防ぐため強制的に書き込みます
                const forceWrite = (attempt === maxRetries);
                const newModifiedTime = await this.pushImageIndex(cloudIndex, expectedModifiedTime, forceWrite, interactive);
                console.log('GoogleDriveSync: Successfully saved image index. New modifiedTime:', newModifiedTime);
                console.log('GoogleDriveSync: Image cache sync completed.');
                return { success: true };
            } catch (err) {
                console.error(`GoogleDriveSync: Error occurred during image sync attempt ${attempt}:`, err);
                if (err.message === 'ImageIndexConflict') {
                    console.warn(`GoogleDriveSync: Conflict detected in image index file, attempt ${attempt} of ${maxRetries}, retrying with fresh pull...`);
                    continue;
                }
                if (attempt === maxRetries) {
                    throw err;
                }
            }
        }
        
        throw new Error('GoogleDriveSync: Image index sync failed due to persistent conflicts.');
    },

    /**
     * Google ドライブの画像インデックスからローカルに未同期の画像を一括ダウンロードします
     * @param {function} onProgress - 進捗コールバック (detail => void)
     * @param {boolean} interactive - 対話型認証を行うか
     */
    async downloadAllImageCaches(onProgress = () => {}, interactive = true) {
        console.log('GoogleDriveSync: Starting bulk image cache download...');
        onProgress({ status: 'searching', total: 0, completed: 0, failed: 0 });

        // 1. 画像インデックスファイルをダウンロード
        const pullResult = await this.pullImageIndex(interactive);
        const cloudIndex = pullResult.data;

        if (!cloudIndex || !cloudIndex.images || Object.keys(cloudIndex.images).length === 0) {
            console.log('GoogleDriveSync: No images in cloud index to download.');
            onProgress({ status: 'completed', total: 0, completed: 0, failed: 0 });
            return { total: 0, completed: 0, failed: 0 };
        }

        const hashes = Object.keys(cloudIndex.images);
        
        // 2. ローカルキャッシュにすでに存在するものがあるか一括取得
        const localCacheMap = await getLocalCachesBulk(hashes);

        // 3. ダウンロード対象の抽出 (ローカルキャッシュに存在しないもの)
        const toDownload = [];
        for (const hash of hashes) {
            if (!localCacheMap[hash]) {
                toDownload.push({ hash, fileId: cloudIndex.images[hash].fileId });
            }
        }

        const total = toDownload.length;
        console.log(`GoogleDriveSync: Bulk download tasks - Missing: ${total} / Total in Cloud: ${hashes.length}`);

        if (total === 0) {
            onProgress({ status: 'completed', total: 0, completed: 0, failed: 0 });
            return { total: 0, completed: 0, failed: 0 };
        }

        onProgress({ status: 'downloading', total, completed: 0, failed: 0 });

        let completed = 0;
        let failed = 0;

        // 同期実行 (並行処理数3制限)
        const maxConcurrency = 3;
        const queue = [...toDownload];

        const runDownload = async () => {
            while (queue.length > 0) {
                const item = queue.shift();
                try {
                    console.log(`GoogleDriveSync: Bulk downloading image cache: ${item.hash}`);
                    const encryptedData = await this.downloadImageCache(item.fileId, interactive);
                    const decompressedBase64 = await decrypt(encryptedData);
                    await saveLocalCache(item.hash, decompressedBase64);
                    completed++;
                } catch (err) {
                    console.error(`GoogleDriveSync: Failed to bulk download image ${item.hash}:`, err);
                    failed++;
                }

                // 進行状況の報告
                onProgress({
                    status: 'downloading',
                    total,
                    completed,
                    failed
                });
            }
        };

        const workers = Array(Math.min(maxConcurrency, queue.length)).fill(null).map(runDownload);
        await Promise.all(workers);

        console.log(`GoogleDriveSync: Bulk image cache download completed. Completed: ${completed}, Failed: ${failed}`);
        onProgress({
            status: 'completed',
            total,
            completed,
            failed
        });

        return { total, completed, failed };
    }
};
