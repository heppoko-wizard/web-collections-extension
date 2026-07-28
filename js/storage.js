/**
 * storage.js - chrome.storage.localベースのストレージ管理モジュール
 * コレクションデータのCRUD操作を提供
 */

import { getImageHash, saveLocalCache } from './image-cache-helper.js';

export const CollectionStorage = {
    // 互換性のためのダミー定義
    async openDB() {
        return null;
    },

    /**
     * 端末間で共有できる不変値だけを使い、アイテムを新しい保存順に並べる。
     * savedAt がない旧データは updatedAt、最後に ID を使って順序を確定する。
     */
    _compareItemsBySavedAt(a, b) {
        const savedAtA = Number.isFinite(a.savedAt) ? a.savedAt : (a.updatedAt || 0);
        const savedAtB = Number.isFinite(b.savedAt) ? b.savedAt : (b.updatedAt || 0);
        if (savedAtA !== savedAtB) return savedAtB - savedAtA;

        const updatedAtA = a.updatedAt || 0;
        const updatedAtB = b.updatedAt || 0;
        if (updatedAtA !== updatedAtB) return updatedAtB - updatedAtA;

        const idA = String(a.id || '');
        const idB = String(b.id || '');
        if (idA < idB) return -1;
        if (idA > idB) return 1;
        return 0;
    },

    /**
     * ヘルパー：データを取得する
     */
    async _getCollectionsRaw() {
        const result = await chrome.storage.local.get('wc_collections');
        return result.wc_collections || [];
    },

    /**
     * ヘルパー：データを保存する
     */
    async _saveCollectionsRaw(collections) {
        await chrome.storage.local.set({ wc_collections: collections });
    },

    /**
     * 全コレクションのメタデータを取得（アイテムは含まない）
     * @param {boolean} includeDeleted - 削除済みのものも含めるか
     * @returns {Promise<Array>} コレクション配列（各要素にitemCountを付与）
     */
    async getAllCollections(includeDeleted = false) {
        const collections = await this._getCollectionsRaw();
        let filtered = collections;
        if (!includeDeleted) {
            filtered = collections.filter(c => !c.isDeleted);
        }

        // updatedAt の降順でソート（最新を一番上へ）
        filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        // メタデータのみを返す（各要素に itemCount と firstImage を付与、items は含めない）
        return filtered.map(col => {
            const activeItems = (col.items || []).filter(item => !item.isDeleted);
            const firstImage = activeItems.find(item => item.type === 'image' || item.imageUrl) || null;

            return {
                id: col.id,
                name: col.name,
                createdAt: col.createdAt,
                updatedAt: col.updatedAt,
                isDeleted: col.isDeleted || false,
                itemCount: activeItems.length,
                firstImage: firstImage
            };
        });
    },

    /**
     * 新しいコレクションを作成
     * @param {string} name - コレクション名
     * @returns {Promise<object>} 作成されたコレクション
     */
    async createCollection(name) {
        const collections = await this._getCollectionsRaw();
        const newCollection = {
            id: this.generateId(),
            name: name || '新しいコレクション',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isDeleted: false,
            items: []
        };

        collections.push(newCollection);
        await this._saveCollectionsRaw(collections);

        return {
            id: newCollection.id,
            name: newCollection.name,
            createdAt: newCollection.createdAt,
            updatedAt: newCollection.updatedAt,
            isDeleted: false,
            itemCount: 0,
            firstImage: null,
            items: []
        };
    },

    /**
     * コレクションを取得
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async getCollection(id) {
        const collections = await this._getCollectionsRaw();
        const col = collections.find(c => c.id === id);
        if (!col) return null;

        // メタデータのみを返す
        return {
            id: col.id,
            name: col.name,
            createdAt: col.createdAt,
            updatedAt: col.updatedAt,
            isDeleted: col.isDeleted || false
        };
    },

    /**
     * コレクションを更新
     * @param {string} id
     * @param {object} updates
     */
    async updateCollection(id, updates) {
        const collections = await this._getCollectionsRaw();
        const colIndex = collections.findIndex(c => c.id === id);
        if (colIndex === -1) return;

        collections[colIndex] = {
            ...collections[colIndex],
            ...updates,
            updatedAt: Date.now()
        };

        await this._saveCollectionsRaw(collections);
    },

    /**
     * コレクションを論理削除
     * @param {string} id
     */
    async deleteCollection(id) {
        await this.updateCollection(id, { isDeleted: true });
    },

    /**
     * コレクションに属するアイテムを取得（保存日時の新しい順、削除済みを除く）
     * @param {string} collectionId
     * @param {boolean} includeDeleted - 削除済みのものも含めるか
     * @returns {Promise<Array>} アイテム配列
     */
    async getItemsByCollection(collectionId, includeDeleted = false) {
        const collections = await this._getCollectionsRaw();
        const col = collections.find(c => c.id === collectionId);
        if (!col) return [];
 
        let items = [...(col.items || [])];
        if (!includeDeleted) {
            items = items.filter(i => !i.isDeleted);
        }

        items.sort((a, b) => this._compareItemsBySavedAt(a, b));
        return items;
    },

    /**
     * コレクションにアイテムを追加
     * @param {string} collectionId
     * @param {object} item - {type, url, title, content, imageUrl, sourceUrl}
     * @returns {Promise<object>} 追加されたアイテム
     */
    async addItem(collectionId, item) {
        const collections = await this._getCollectionsRaw();
        const colIndex = collections.findIndex(c => c.id === collectionId);
        if (colIndex === -1) throw new Error('Collection not found');

        const col = collections[colIndex];

        // 混入防止ガード：imageUrl が Base64画像の場合
        if (item.imageUrl && item.imageUrl.startsWith('data:image/')) {
            const dataUrl = item.imageUrl;
            const hash = await getImageHash(dataUrl);
            await saveLocalCache(hash, dataUrl);
            item.imageUrl = `local-cache://${hash}`;
            
            chrome.runtime.sendMessage({
                action: 'saveImageCache',
                url: item.url || '',
                dataUrl: dataUrl
            }).catch(err => console.warn('Storage: Failed to send saveImageCache message:', err));
        }

        // 混入防止ガード：imageアイテムの content が Base64画像の場合
        if (item.type === 'image' && item.content && item.content.startsWith('data:image/')) {
            const dataUrl = item.content;
            const hash = await getImageHash(dataUrl);
            await saveLocalCache(hash, dataUrl);
            item.content = `local-cache://${hash}`;
            
            chrome.runtime.sendMessage({
                action: 'saveImageCache',
                url: item.url || '',
                dataUrl: dataUrl
            }).catch(err => console.warn('Storage: Failed to send saveImageCache message:', err));
        }

        const now = Date.now();
        const newItem = {
            id: this.generateId(),
            collectionId: collectionId,
            ...item,
            savedAt: now,
            updatedAt: now,
            isDeleted: false
        };

        const items = col.items || [];
        items.push(newItem);
        col.items = items;
        col.updatedAt = now;

        await this._saveCollectionsRaw(collections);
        return newItem;
    },

    /**
     * アイテムを論理削除
     * @param {string} collectionId
     * @param {string} itemId
     */
    async removeItem(collectionId, itemId) {
        const collections = await this._getCollectionsRaw();
        const colIndex = collections.findIndex(c => c.id === collectionId);
        if (colIndex === -1) return;

        const col = collections[colIndex];
        const items = col.items || [];
        const itemIndex = items.findIndex(i => i.id === itemId);
        if (itemIndex !== -1) {
            items[itemIndex].isDeleted = true;
            items[itemIndex].updatedAt = Date.now();
            col.updatedAt = Date.now();
            await this._saveCollectionsRaw(collections);
        }
    },

    /**
     * アイテムを更新
     * @param {string} collectionId
     * @param {string} itemId
     * @param {object} updates - 更新データ
     */
    async updateItem(collectionId, itemId, updates) {
        const collections = await this._getCollectionsRaw();
        const colIndex = collections.findIndex(c => c.id === collectionId);
        if (colIndex === -1) throw new Error('Collection not found');

        const col = collections[colIndex];
        const items = col.items || [];
        const itemIndex = items.findIndex(i => i.id === itemId);
        if (itemIndex === -1) throw new Error('Item not found');

        // 混入防止ガード：imageUrl が Base64画像の場合
        if (updates.imageUrl && updates.imageUrl.startsWith('data:image/')) {
            const dataUrl = updates.imageUrl;
            const hash = await getImageHash(dataUrl);
            await saveLocalCache(hash, dataUrl);
            updates.imageUrl = `local-cache://${hash}`;
            
            chrome.runtime.sendMessage({
                action: 'saveImageCache',
                url: updates.url || items[itemIndex].url || '',
                dataUrl: dataUrl
            }).catch(err => console.warn('Storage: Failed to send saveImageCache message:', err));
        }

        // 混入防止ガード：imageアイテムの content が Base64画像の場合
        if (updates.type === 'image' && updates.content && updates.content.startsWith('data:image/')) {
            const dataUrl = updates.content;
            const hash = await getImageHash(dataUrl);
            await saveLocalCache(hash, dataUrl);
            updates.content = `local-cache://${hash}`;
            
            chrome.runtime.sendMessage({
                action: 'saveImageCache',
                url: updates.url || items[itemIndex].url || '',
                dataUrl: dataUrl
            }).catch(err => console.warn('Storage: Failed to send saveImageCache message:', err));
        }

        const updated = {
            ...items[itemIndex],
            ...updates,
            updatedAt: Date.now()
        };

        items[itemIndex] = updated;
        col.updatedAt = Date.now();

        await this._saveCollectionsRaw(collections);
        return updated;
    },

    /**
     * 設定を取得します
     * @returns {Promise<object>}
     */
    async getSettings() {
        const result = await chrome.storage.local.get('wc_settings');
        const settings = result.wc_settings || {};
        return {
            lastSyncTime: settings.lastSyncTime || null,
            tileMinWidth: settings.tileMinWidth || 140,
            bookmarkRootId: settings.bookmarkRootId || null,
            theme: settings.theme || null,
            encryptEnabled: true // セキュリティ保護のため強制オンで固定します
        };
    },

    /**
     * 設定を保存
     * @param {object} settings
     */
    async saveSettings(settings) {
        // syncPassword や syncMode が含まれている場合は除外して保存する
        const { syncPassword, syncMode, ...cleanSettings } = settings;
        cleanSettings.encryptEnabled = true; // セキュリティ保護のため強制オンで固定します
        await chrome.storage.local.set({ wc_settings: cleanSettings });
    },

    /**
     * UUID風のIDを生成
     * @returns {string}
     */
    generateId() {
        return crypto.randomUUID();
    },

    /**
     * 全データをJSON文字列としてエクスポート
     * @returns {Promise<string>}
     */
    async exportToJson() {
        const collections = await this._getCollectionsRaw();
        // エクスポートデータでは、items も含んだものを返す
        const exportedData = collections.map(col => {
            const items = [...(col.items || [])].sort((a, b) => this._compareItemsBySavedAt(a, b));
            return {
                id: col.id,
                name: col.name,
                createdAt: col.createdAt,
                updatedAt: col.updatedAt,
                isDeleted: col.isDeleted || false,
                items: items
            };
        });

        return JSON.stringify({ collections: exportedData, exportedAt: Date.now() }, null, 2);
    },

    /**
     * JSONデータをインポート
     * @param {string} jsonString
     */
    async importFromJson(jsonString) {
        const data = JSON.parse(jsonString);
        let collectionsToImport = [];

        if (data && typeof data === 'object' && Array.isArray(data.collections)) {
            // 形式1: 全体エクスポート形式 { collections: [...] }
            collectionsToImport = data.collections;
        } else if (Array.isArray(data)) {
            // 形式2: コレクション配列形式 [ { id, name, items: [...] }, ... ]
            collectionsToImport = data;
        } else if (data && typeof data === 'object' && data.id && data.name) {
            // 形式3: 単一コレクション形式 { id, name, items: [...] }
            collectionsToImport = [data];
        } else {
            throw new Error('Invalid import data format');
        }

        const currentCollections = await this._getCollectionsRaw();

        for (const col of collectionsToImport) {
            if (!col.id || !col.name) continue;

            const existingIndex = currentCollections.findIndex(c => c.id === col.id);
            if (existingIndex !== -1) {
                // 既存のコレクションがある場合はマージ
                const existingCol = currentCollections[existingIndex];

                // メタデータのマージ
                const importUpdatedAt = col.updatedAt || 0;
                const localUpdatedAt = existingCol.updatedAt || 0;
                if (importUpdatedAt > localUpdatedAt) {
                    existingCol.name = col.name;
                    if (col.createdAt) {
                        existingCol.createdAt = col.createdAt;
                    }
                    existingCol.isDeleted = col.isDeleted ?? existingCol.isDeleted ?? false;
                }
                existingCol.updatedAt = Math.max(localUpdatedAt, importUpdatedAt);

                // アイテムデータのマージ
                if (col.items && Array.isArray(col.items)) {
                    const localItems = existingCol.items || [];
                    const formattedItems = col.items.map(item => ({
                        ...item,
                        collectionId: col.id,
                        updatedAt: item.updatedAt || item.savedAt || Date.now(),
                        isDeleted: item.isDeleted || false
                    }));

                    const localItemMap = new Map(localItems.map(i => [i.id, i]));

                    for (const impItem of formattedItems) {
                        const localItem = localItemMap.get(impItem.id);
                        if (localItem) {
                            if (impItem.updatedAt > (localItem.updatedAt || 0)) {
                                localItemMap.set(impItem.id, {
                                    ...localItem,
                                    ...impItem
                                });
                            }
                        } else {
                            localItemMap.set(impItem.id, impItem);
                        }
                    }
                    existingCol.items = Array.from(localItemMap.values());
                }
                // itemsが未定義の場合は既存のアイテムを保持する
            } else {
                // 新規コレクションとして追加
                const items = col.items || [];
                const formattedItems = items.map(item => ({
                    ...item,
                    collectionId: col.id,
                    updatedAt: item.updatedAt || item.savedAt || Date.now(),
                    isDeleted: item.isDeleted || false
                }));

                const importedCol = {
                    id: col.id,
                    name: col.name,
                    createdAt: col.createdAt || Date.now(),
                    updatedAt: col.updatedAt || Date.now(),
                    isDeleted: col.isDeleted || false,
                    items: formattedItems
                };
                currentCollections.push(importedCol);
            }
        }

        await this._saveCollectionsRaw(currentCollections);
    },

    /**
     * 指定された時刻以降に変更されたコレクションを取得
     * @param {number} since
     */
    async getModifiedCollections(since) {
        const collections = await this._getCollectionsRaw();
        return collections.filter(c => (c.updatedAt || 0) > since);
    },

    /**
     * 単一のコレクションをアイテム込みでJSONエクスポート
     * @param {string} id
     */
    async exportCollection(id) {
        const collections = await this._getCollectionsRaw();
        const col = collections.find(c => c.id === id);
        if (!col) return null;

        const items = (col.items || [])
            .filter(i => !i.isDeleted)
            .sort((a, b) => this._compareItemsBySavedAt(a, b));

        return {
            id: col.id,
            name: col.name,
            createdAt: col.createdAt,
            updatedAt: col.updatedAt,
            isDeleted: col.isDeleted || false,
            items: items
        };
    },

    /**
     * 単一のコレクションデータ（アイテム込み）をインポート
     * @param {object} data
     */
    async importCollectionData(data) {
        const collections = await this._getCollectionsRaw();
        const colIndex = collections.findIndex(c => c.id === data.id);

        if (colIndex !== -1) {
            // 既存のコレクションがある場合はマージ
            const existingCol = collections[colIndex];

            const importUpdatedAt = data.updatedAt || 0;
            const localUpdatedAt = existingCol.updatedAt || 0;
            if (importUpdatedAt > localUpdatedAt) {
                existingCol.name = data.name;
                if (data.createdAt) {
                    existingCol.createdAt = data.createdAt;
                }
                existingCol.isDeleted = data.isDeleted ?? existingCol.isDeleted ?? false;
            }
            existingCol.updatedAt = Math.max(localUpdatedAt, importUpdatedAt);

            if (data.items && Array.isArray(data.items)) {
                const localItems = existingCol.items || [];
                const newItems = data.items.map(item => ({
                    ...item,
                    collectionId: data.id,
                    updatedAt: item.updatedAt || item.savedAt || Date.now(),
                    isDeleted: item.isDeleted || false
                }));

                const localItemMap = new Map(localItems.map(i => [i.id, i]));

                for (const impItem of newItems) {
                    const localItem = localItemMap.get(impItem.id);
                    if (localItem) {
                        if (impItem.updatedAt > (localItem.updatedAt || 0)) {
                            localItemMap.set(impItem.id, {
                                ...localItem,
                                ...impItem
                            });
                        }
                    } else {
                        localItemMap.set(impItem.id, impItem);
                    }
                }
                existingCol.items = Array.from(localItemMap.values());
            }
        } else {
            // 新規コレクションとして追加
            const newItems = (data.items || []).map(item => ({
                ...item,
                collectionId: data.id,
                updatedAt: item.updatedAt || item.savedAt || Date.now(),
                isDeleted: item.isDeleted || false
            }));

            const importedCol = {
                id: data.id,
                name: data.name,
                createdAt: data.createdAt || Date.now(),
                updatedAt: data.updatedAt || Date.now(),
                isDeleted: data.isDeleted || false,
                items: newItems
            };
            collections.push(importedCol);
        }

        await this._saveCollectionsRaw(collections);
        return true;
    },

    /**
     * 論理削除されたアイテムおよびコレクションを物理削除してストレージを軽量化します
     * @param {number} daysThreshold - 猶予日数
     */
    async purgeDeletedData(daysThreshold = 30) {
        const collections = await this._getCollectionsRaw();
        const thresholdTime = Date.now() - (daysThreshold * 24 * 60 * 60 * 1000);
        let modified = false;

        const remainingCollections = collections.filter(c => {
            if (c.isDeleted && (c.updatedAt || 0) < thresholdTime) {
                modified = true;
                return false;
            }
            return true;
        });

        for (const col of remainingCollections) {
            if (col.items && Array.isArray(col.items)) {
                const originalLength = col.items.length;
                col.items = col.items.filter(item => {
                    return !(item.isDeleted && (item.updatedAt || 0) < thresholdTime);
                });
                if (col.items.length !== originalLength) {
                    modified = true;
                    col.updatedAt = Date.now();
                }
            }
        }

        if (modified) {
            await this._saveCollectionsRaw(remainingCollections);
            console.log('CollectionStorage: Expired deleted data physical purge executed.');
        }
        return modified;
    }
};
