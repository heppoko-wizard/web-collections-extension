// js/image-cache-helper.js

const DB_NAME = 'WebCollectionsCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'image_cache';
const MIGRATION_MARKER = 'wc_image_cache_migrated_v1';

let dbInstance = null;
let migrationPromise = null;

/**
 * IndexedDB のデータベースコネクションを取得します
 */
function getDB() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };
        request.onerror = (e) => {
            reject(e.target.error);
        };
    });
}

/**
 * 既存の chrome.storage.local 内の画像キャッシュを IndexedDB へマイグレーションします
 */
async function migrateFromStorageLocal() {
    if (migrationPromise) return migrationPromise;
    
    migrationPromise = (async () => {
        try {
            const migrationState = await chrome.storage.local.get(MIGRATION_MARKER);
            if (migrationState[MIGRATION_MARKER] === true) return;

            const allStorage = await chrome.storage.local.get(null);
            const cacheKeys = Object.keys(allStorage).filter(key => key.startsWith('wc_img_cache_'));

            if (cacheKeys.length === 0) {
                await chrome.storage.local.set({ [MIGRATION_MARKER]: true });
                return;
            }
            
            console.log(`ImageCacheHelper: Migrating ${cacheKeys.length} items from chrome.storage.local to IndexedDB...`);
            const db = await getDB();
            
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            const keysToDelete = [];
            for (const key of cacheKeys) {
                const hash = key.substring('wc_img_cache_'.length);
                const dataUrl = allStorage[key];
                store.put(dataUrl, hash);
                keysToDelete.push(key);
            }
            
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            
            await chrome.storage.local.remove(keysToDelete);
            await chrome.storage.local.set({ [MIGRATION_MARKER]: true });
            console.log('ImageCacheHelper: Migration completed successfully.');
        } catch (err) {
            console.error('ImageCacheHelper: Migration failed:', err);
        }
    })();
    
    return migrationPromise;
}

/**
 * 画像URLのSHA-256ハッシュ値を算出します
 * @param {string} url - 対象の画像URL
 * @returns {Promise<string>} ハッシュ文字列
 */
export async function getImageHash(url) {
    if (!url) return '';
    if (url.startsWith('local-cache://')) {
        return url.substring('local-cache://'.length);
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 画像のリサイズとWebPへのエンコードを行います
 * 注意：この関数はサイドパネルなどのDOMが利用可能なコンテキストで呼び出す必要があります
 * @param {string} imageUrl - オリジナル画像のURL
 * @param {number} maxDimension - リサイズ時の最大辺のピクセル数
 * @returns {Promise<string>} WebP形式のDataURL
 */
export async function resizeImageToWebp(imageUrl, maxDimension = 320, timeoutMs = 10000) {
    let blob;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(imageUrl, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        blob = await response.blob();
    } catch (fetchErr) {
        const message = fetchErr.name === 'AbortError'
            ? `Image fetch timed out after ${timeoutMs} ms`
            : fetchErr.message;
        throw new Error(`Image fetch failed: ${message}`);
    } finally {
        clearTimeout(timeoutId);
    }

    const objectUrl = URL.createObjectURL(blob);
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            try {
                const dataUrl = canvas.toDataURL('image/webp', 0.7);
                URL.revokeObjectURL(objectUrl);
                resolve(dataUrl);
            } catch (e) {
                try {
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    URL.revokeObjectURL(objectUrl);
                    resolve(dataUrl);
                } catch (jpegErr) {
                    URL.revokeObjectURL(objectUrl);
                    reject(jpegErr);
                }
            }
        };
        
        img.onerror = (err) => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Image load failed'));
        };
        
        img.src = objectUrl;
    });
}

/**
 * ローカルストレージ（IndexedDB）から画像キャッシュを取得します
 * @param {string} hash - 画像URL의 ハッシュ値
 * @returns {Promise<string|null>} キャッシュされたDataURL
 */
export async function getLocalCache(hash) {
    if (!hash) return null;
    await migrateFromStorageLocal();
    
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(hash);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 複数の画像キャッシュデータを一括で取得します（バルク取得）
 * @param {Array<string>} hashes - 画像URLのハッシュ値の配列
 * @returns {Promise<Object>} ハッシュ値をキー、DataURLを値とするオブジェクト
 */
export async function getLocalCachesBulk(hashes) {
    if (!hashes || hashes.length === 0) return {};
    await migrateFromStorageLocal();
    
    const db = await getDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const result = {};
        let pending = hashes.length;
        
        for (const hash of hashes) {
            const request = store.get(hash);
            request.onsuccess = () => {
                if (request.result) {
                    result[hash] = request.result;
                }
                if (--pending === 0) resolve(result);
            };
            request.onerror = (e) => {
                console.error('ImageCacheHelper: Failed to get bulk cache for hash:', hash, e.target.error);
                if (--pending === 0) resolve(result);
            };
        }
    });
}

/**
 * ローカルストレージ（IndexedDB）に画像キャッシュを保存します
 * @param {string} hash - 画像URLのハッシュ値
 * @param {string} dataUrl - リサイズ済みの画像DataURL
 * @returns {Promise<void>}
 */
export async function saveLocalCache(hash, dataUrl) {
    if (!hash || !dataUrl) return;
    await migrateFromStorageLocal();
    
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(dataUrl, hash);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * ローカルストレージ（IndexedDB）から指定した画像キャッシュを削除します
 * @param {string} hash - 画像URLのハッシュ値
 * @returns {Promise<void>}
 */
export async function deleteLocalCache(hash) {
    if (!hash) return;
    await migrateFromStorageLocal();
    
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(hash);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
