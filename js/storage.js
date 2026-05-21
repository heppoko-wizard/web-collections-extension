/**
 * storage.js - chrome.storage.localベースのストレージ管理モジュール
 * コレクションデータのCRUD操作を提供
 */

export const CollectionStorage = {
    // 互換性のためのダミー定義
    async openDB() {
        return null;
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
     * コレクションに属するアイテムを取得（sortOrder順、削除済みを除く）
     * @param {string} collectionId
     * @param {boolean} includeDeleted - 削除済みのものも含めるか
     * @returns {Promise<Array>} アイテム配列
     */
    async getItemsByCollection(collectionId, includeDeleted = false) {
        const collections = await this._getCollectionsRaw();
        const col = collections.find(c => c.id === collectionId);
        if (!col) return [];

        let items = col.items || [];
        if (!includeDeleted) {
            items = items.filter(i => !i.isDeleted);
        }

        items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
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
        const newItem = {
            id: this.generateId(),
            collectionId: collectionId,
            ...item,
            savedAt: Date.now(),
            sortOrder: 0,
            updatedAt: Date.now(),
            isDeleted: false
        };

        // 既存アイテムのsortOrderを+1して新アイテムを先頭に挿入
        const items = col.items || [];
        items.forEach(record => {
            record.sortOrder = (record.sortOrder ?? 0) + 1;
        });

        items.push(newItem);
        col.items = items;
        col.updatedAt = Date.now();

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
     * アイテムの順序を更新
     * @param {string} collectionId
     * @param {Array<string>} itemIds - 新しい順序のアイテムID配列
     */
    async reorderItems(collectionId, itemIds) {
        const collections = await this._getCollectionsRaw();
        const colIndex = collections.findIndex(c => c.id === collectionId);
        if (colIndex === -1) return;

        const col = collections[colIndex];
        const items = col.items || [];

        itemIds.forEach((id, index) => {
            const item = items.find(i => i.id === id);
            if (item) {
                item.sortOrder = index;
            }
        });

        col.updatedAt = Date.now();
        await this._saveCollectionsRaw(collections);
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
     * 設定を取得
     * @returns {Promise<object>}
     */
    async getSettings() {
        const result = await chrome.storage.local.get('wc_settings');
        return result.wc_settings || {
            lastSyncTime: null
        };
    },

    /**
     * 設定を保存
     * @param {object} settings
     */
    async saveSettings(settings) {
        // syncPassword や syncMode が含まれている場合は除外して保存する
        const { syncPassword, syncMode, ...cleanSettings } = settings;
        await chrome.storage.local.set({ wc_settings: cleanSettings });
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
        const collections = await this._getCollectionsRaw();
        // エクスポートデータでは、items も含んだものを返す
        const exportedData = collections.map(col => {
            const items = (col.items || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
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
        if (!data.collections || !Array.isArray(data.collections)) {
            throw new Error('Invalid import data format');
        }

        const newCollections = data.collections.map(col => {
            const items = col.items || [];
            const formattedItems = items.map((item, index) => ({
                ...item,
                collectionId: col.id,
                sortOrder: item.sortOrder ?? index,
                updatedAt: item.updatedAt || item.savedAt || Date.now(),
                isDeleted: item.isDeleted || false
            }));

            return {
                id: col.id,
                name: col.name,
                createdAt: col.createdAt || Date.now(),
                updatedAt: col.updatedAt || Date.now(),
                isDeleted: col.isDeleted || false,
                items: formattedItems
            };
        });

        await this._saveCollectionsRaw(newCollections);
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
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

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

        const newItems = (data.items || []).map(item => ({
            ...item,
            collectionId: data.id
        }));

        const importedCol = {
            id: data.id,
            name: data.name,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            isDeleted: data.isDeleted || false,
            items: newItems
        };

        if (colIndex !== -1) {
            collections[colIndex] = importedCol;
        } else {
            collections.push(importedCol);
        }

        await this._saveCollectionsRaw(collections);
        return true;
    }
};
