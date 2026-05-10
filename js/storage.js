/**
 * storage.js - IndexedDBベースのストレージ管理モジュール
 * コレクションデータのCRUD操作を提供
 * 
 * DB構造:
 *   collections ストア: {id, name, createdAt, updatedAt} メタデータのみ
 *   items ストア: {id, collectionId, type, title, url, content, imageUrl, ...} インデックス: collectionId
 *   settings ストア: key-valueペア
 */

export const CollectionStorage = {
    DB_NAME: 'WebCollectionsDB',
    DB_VERSION: 1,
    _db: null,

    /**
     * データベースを開く（初回はスキーマを作成）
     * @returns {Promise<IDBDatabase>}
     */
    async openDB() {
        if (this._db) return this._db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // collections ストア: メタデータのみ
                if (!db.objectStoreNames.contains('collections')) {
                    db.createObjectStore('collections', { keyPath: 'id' });
                }

                // items ストア: collectionId インデックス付き
                if (!db.objectStoreNames.contains('items')) {
                    const itemStore = db.createObjectStore('items', { keyPath: 'id' });
                    itemStore.createIndex('collectionId', 'collectionId', { unique: false });
                }

                // settings ストア: key-value
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings');
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 全コレクションのメタデータを取得（アイテムは含まない）
     * @param {boolean} includeDeleted - 削除済みのものも含めるか
     * @returns {Promise<Array>} コレクション配列（各要素にitemCountを付与）
     */
    async getAllCollections(includeDeleted = false) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['collections', 'items'], 'readonly');
            const collectionStore = tx.objectStore('collections');
            const itemStore = tx.objectStore('items');
            const collectionIdIndex = itemStore.index('collectionId');

            const collectionsReq = collectionStore.getAll();

            collectionsReq.onsuccess = () => {
                let collections = collectionsReq.result;
                if (!includeDeleted) {
                    collections = collections.filter(c => !c.isDeleted);
                }
                
                let pending = collections.length;

                if (pending === 0) {
                    resolve([]);
                    return;
                }

                collections.forEach((col) => {
                    const countReq = collectionIdIndex.count(IDBKeyRange.only(col.id));
                    countReq.onsuccess = () => {
                        col.itemCount = countReq.result;
                        // 最初のimage型アイテムをサムネイル用に取得
                        const cursorReq = collectionIdIndex.openCursor(IDBKeyRange.only(col.id));
                        col.firstImage = null;
                        cursorReq.onsuccess = (e) => {
                            const cursor = e.target.result;
                            if (cursor) {
                                const item = cursor.value;
                                if ((item.type === 'image' || item.imageUrl) && !col.firstImage) {
                                    col.firstImage = item;
                                }
                                if (!col.firstImage) {
                                    cursor.continue();
                                } else {
                                    pending--;
                                    if (pending === 0) resolve(collections);
                                }
                            } else {
                                pending--;
                                if (pending === 0) resolve(collections);
                            }
                        };
                    };
                });
            };

            collectionsReq.onerror = () => reject(collectionsReq.error);
        });
    },

    /**
     * 新しいコレクションを作成
     * @param {string} name - コレクション名
     * @returns {Promise<object>} 作成されたコレクション
     */
    async createCollection(name) {
        const db = await this.openDB();
        const newCollection = {
            id: this.generateId(),
            name: name || '新しいコレクション',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction('collections', 'readwrite');
            const store = tx.objectStore('collections');
            const request = store.add(newCollection);
            request.onsuccess = () => {
                newCollection.itemCount = 0;
                newCollection.firstImage = null;
                newCollection.items = [];
                resolve(newCollection);
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * コレクションを取得
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async getCollection(id) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('collections', 'readonly');
            const store = tx.objectStore('collections');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * コレクションを更新
     * @param {string} id
     * @param {object} updates
     */
    async updateCollection(id, updates) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('collections', 'readwrite');
            const store = tx.objectStore('collections');
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const existing = getReq.result;
                if (existing) {
                    const updated = { ...existing, ...updates, updatedAt: Date.now() };
                    store.put(updated);
                }
                resolve();
            };
            getReq.onerror = () => reject(getReq.error);
        });
    },

    /**
     * コレクションを論理削除
     * @param {string} id
     */
    async deleteCollection(id) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('collections', 'readwrite');
            const store = tx.objectStore('collections');
            const getReq = store.get(id);

            getReq.onsuccess = () => {
                const data = getReq.result;
                if (data) {
                    const updated = { ...data, isDeleted: true, updatedAt: Date.now() };
                    const putReq = store.put(updated);
                    putReq.onsuccess = () => resolve();
                    putReq.onerror = () => reject(putReq.error);
                } else {
                    resolve();
                }
            };
            getReq.onerror = () => reject(getReq.error);
        });
    },

    /**
     * コレクションに属するアイテムを取得（sortOrder順）
     * @param {string} collectionId
     * @returns {Promise<Array>} アイテム配列
     */
    async getItemsByCollection(collectionId) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('items', 'readonly');
            const store = tx.objectStore('items');
            const index = store.index('collectionId');
            const request = index.getAll(IDBKeyRange.only(collectionId));
            request.onsuccess = () => {
                const items = request.result;
                items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * コレクションにアイテムを追加
     * @param {string} collectionId
     * @param {object} item - {type, url, title, content, imageUrl, sourceUrl}
     * @returns {Promise<object>} 追加されたアイテム
     */
    async addItem(collectionId, item) {
        const db = await this.openDB();

        const newItem = {
            id: this.generateId(),
            collectionId: collectionId,
            ...item,
            savedAt: Date.now(),
            sortOrder: 0,
            updatedAt: Date.now()
        };

        // 既存アイテムのsortOrderを+1して新アイテムを先頭に挿入
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['items', 'collections'], 'readwrite');
            const itemStore = tx.objectStore('items');
            const collectionStore = tx.objectStore('collections');
            const index = itemStore.index('collectionId');

            // 既存アイテムのsortOrderをインクリメント
            const cursorReq = index.openCursor(IDBKeyRange.only(collectionId));
            cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const record = cursor.value;
                    record.sortOrder = (record.sortOrder ?? 0) + 1;
                    cursor.update(record);
                    cursor.continue();
                }
            };

            // 新アイテムをsortOrder 0で追加
            itemStore.add(newItem);

            // コレクションのupdatedAtを更新
            const colReq = collectionStore.get(collectionId);
            colReq.onsuccess = () => {
                const col = colReq.result;
                if (col) {
                    col.updatedAt = Date.now();
                    collectionStore.put(col);
                }
            };

            tx.oncomplete = () => resolve(newItem);
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * アイテムを削除
     * @param {string} collectionId
     * @param {string} itemId
     */
    async removeItem(collectionId, itemId) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['items', 'collections'], 'readwrite');
            const itemStore = tx.objectStore('items');
            const collectionStore = tx.objectStore('collections');

            itemStore.delete(itemId);

            // コレクションのupdatedAtを更新
            const colReq = collectionStore.get(collectionId);
            colReq.onsuccess = () => {
                const col = colReq.result;
                if (col) {
                    col.updatedAt = Date.now();
                    collectionStore.put(col);
                }
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * アイテムの順序を更新
     * @param {string} collectionId
     * @param {Array<string>} itemIds - 新しい順序のアイテムID配列
     */
    async reorderItems(collectionId, itemIds) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['items', 'collections'], 'readwrite');
            const itemStore = tx.objectStore('items');
            const collectionStore = tx.objectStore('collections');

            itemIds.forEach((id, index) => {
                const getReq = itemStore.get(id);
                getReq.onsuccess = () => {
                    const item = getReq.result;
                    if (item) {
                        item.sortOrder = index;
                        itemStore.put(item);
                    }
                };
            });

            // コレクションのupdatedAtを更新
            const colReq = collectionStore.get(collectionId);
            colReq.onsuccess = () => {
                const col = colReq.result;
                if (col) {
                    col.updatedAt = Date.now();
                    collectionStore.put(col);
                }
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * アイテムを更新
     * @param {string} collectionId
     * @param {string} itemId
     * @param {object} updates - 更新データ
     */
    async updateItem(collectionId, itemId, updates) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['items', 'collections'], 'readwrite');
            const itemStore = tx.objectStore('items');
            const collectionStore = tx.objectStore('collections');

            const getReq = itemStore.get(itemId);
            getReq.onsuccess = () => {
                const existing = getReq.result;
                if (!existing) {
                    reject(new Error('Item not found'));
                    return;
                }
                const updated = { ...existing, ...updates, updatedAt: Date.now() };
                itemStore.put(updated);

                // コレクションのupdatedAtを更新
                const colReq = collectionStore.get(collectionId);
                colReq.onsuccess = () => {
                    const col = colReq.result;
                    if (col) {
                        col.updatedAt = Date.now();
                        collectionStore.put(col);
                    }
                };

                tx.oncomplete = () => resolve(updated);
            };
            getReq.onerror = () => reject(getReq.error);
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * 設定を取得
     * @returns {Promise<object>}
     */
    async getSettings() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const request = store.get('app_settings');
            request.onsuccess = () => {
                resolve(request.result || {
                    syncEnabled: false,
                    syncPassword: '',
                    lastSyncTime: null
                });
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 設定を保存
     * @param {object} settings
     */
    async saveSettings(settings) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            const request = store.put(settings, 'app_settings');
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * UUID風のIDを生成
     * @returns {string}
     */
    generateId() {
        return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
            Math.floor(Math.random() * 16).toString(16)
        );
    },

    /**
     * 全データをJSON文字列としてエクスポート
     * @returns {Promise<string>}
     */
    async exportToJson() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['collections', 'items'], 'readonly');
            const collectionStore = tx.objectStore('collections');
            const itemStore = tx.objectStore('items');

            const collectionsReq = collectionStore.getAll();
            const itemsReq = itemStore.getAll();

            tx.oncomplete = () => {
                const collections = collectionsReq.result;
                const allItems = itemsReq.result;

                // 旧フォーマット互換: 各コレクションにitemsを埋め込む
                collections.forEach(col => {
                    col.items = allItems
                        .filter(item => item.collectionId === col.id)
                        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                });

                resolve(JSON.stringify({ collections, exportedAt: Date.now() }, null, 2));
            };
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * JSONデータをインポート
     * @param {string} jsonString
     */
    async importFromJson(jsonString) {
        const data = JSON.parse(jsonString);
        if (!data.collections || !Array.isArray(data.collections)) {
            throw new Error('Invalid import data format');
        }

        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['collections', 'items'], 'readwrite');
            const collectionStore = tx.objectStore('collections');
            const itemStore = tx.objectStore('items');

            // 既存データをクリア
            collectionStore.clear();
            itemStore.clear();

            data.collections.forEach(col => {
                const items = col.items || [];
                // コレクションメタデータのみ保存
                const colMeta = {
                    id: col.id,
                    name: col.name,
                    createdAt: col.createdAt || Date.now(),
                    updatedAt: col.updatedAt || Date.now()
                };
                collectionStore.put(colMeta);

                // アイテムを個別にitemsストアに保存
                items.forEach((item, index) => {
                    const itemRecord = {
                        ...item,
                        collectionId: col.id,
                        sortOrder: item.sortOrder ?? index,
                        updatedAt: item.updatedAt || item.savedAt || Date.now()
                    };
                    itemStore.put(itemRecord);
                });
            });

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * chrome.storage.local からデータをマイグレーション
     * @returns {Promise<boolean>} マイグレーションが実行されたらtrue
     */
    async migrateFromChromeStorage() {
        const result = await chrome.storage.local.get('collections');
        const collections = result.collections;

        if (!collections || !Array.isArray(collections) || collections.length === 0) {
            return false;
        }

        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['collections', 'items'], 'readwrite');
            const collectionStore = tx.objectStore('collections');
            const itemStore = tx.objectStore('items');

            collections.forEach(col => {
                const items = col.items || [];
                // コレクションメタデータ
                const colMeta = {
                    id: col.id,
                    name: col.name,
                    createdAt: col.createdAt || Date.now(),
                    updatedAt: col.updatedAt || Date.now()
                };
                collectionStore.put(colMeta);

                // アイテムを個別保存
                items.forEach((item, index) => {
                    const itemRecord = {
                        ...item,
                        collectionId: col.id,
                        sortOrder: item.sortOrder ?? index,
                        updatedAt: item.savedAt || Date.now()
                    };
                    itemStore.put(itemRecord);
                });
            });

            tx.oncomplete = async () => {
                // マイグレーション完了後、旧データを削除
                await chrome.storage.local.remove('collections');
                console.log('Migration from chrome.storage.local completed.');
                resolve(true);
            };
            tx.onerror = () => reject(tx.error);
        });
    },
    /**
     * 指定された時刻以降に変更されたコレクションを取得
     * @param {number} since
     */
    async getModifiedCollections(since) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('collections', 'readonly');
            const store = tx.objectStore('collections');
            const request = store.getAll();
            request.onsuccess = () => {
                const all = request.result;
                resolve(all.filter(c => (c.updatedAt || 0) > since));
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 単一のコレクションをアイテム込みでJSONエクスポート
     * @param {string} id
     */
    async exportCollection(id) {
        const collection = await this.getCollection(id);
        if (!collection) return null;

        const items = await this.getItemsByCollection(id);
        return {
            ...collection,
            items
        };
    },

    /**
     * 単一のコレクションデータ（アイテム込み）をインポート
     * @param {object} data
     */
    async importCollectionData(data) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['collections', 'items'], 'readwrite');
            const collectionStore = tx.objectStore('collections');
            const itemStore = tx.objectStore('items');

            // コレクションメタデータ保存
            const colMeta = {
                id: data.id,
                name: data.name,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                isDeleted: data.isDeleted || false
            };
            collectionStore.put(colMeta);

            // アイテム保存（既存を削除してから追加）
            const index = itemStore.index('collectionId');
            const cursorReq = index.openCursor(IDBKeyRange.only(data.id));
            cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    // 古いアイテムの削除が終わってから新しいアイテムを追加
                    if (data.items && Array.isArray(data.items)) {
                        data.items.forEach(item => {
                            itemStore.put({ ...item, collectionId: data.id });
                        });
                    }
                }
            };
            cursorReq.onerror = () => reject(cursorReq.error);

            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
};

