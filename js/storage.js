/**
 * storage.js - ローカルストレージ管理モジュール
 * コレクションデータのCRUD操作を提供
 */

const CollectionStorage = {
    STORAGE_KEY: 'collections',
    SETTINGS_KEY: 'settings',

    /**
     * 全コレクションを取得
     * @returns {Promise<Array>} コレクション配列
     */
    async getAllCollections() {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        return result[this.STORAGE_KEY] || [];
    },

    /**
     * 全コレクションを保存
     * @param {Array} collections
     */
    async saveAllCollections(collections) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: collections });
    },

    /**
     * 新しいコレクションを作成
     * @param {string} name - コレクション名
     * @returns {Promise<object>} 作成されたコレクション
     */
    async createCollection(name) {
        const collections = await this.getAllCollections();
        const newCollection = {
            id: this.generateId(),
            name: name || '新しいコレクション',
            items: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        collections.push(newCollection);
        await this.saveAllCollections(collections);
        return newCollection;
    },

    /**
     * コレクションを取得
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async getCollection(id) {
        const collections = await this.getAllCollections();
        return collections.find(c => c.id === id) || null;
    },

    /**
     * コレクションを更新
     * @param {string} id
     * @param {object} updates
     */
    async updateCollection(id, updates) {
        const collections = await this.getAllCollections();
        const index = collections.findIndex(c => c.id === id);
        if (index !== -1) {
            collections[index] = { ...collections[index], ...updates, updatedAt: Date.now() };
            await this.saveAllCollections(collections);
        }
    },

    /**
     * コレクションを削除
     * @param {string} id
     */
    async deleteCollection(id) {
        const collections = await this.getAllCollections();
        const filtered = collections.filter(c => c.id !== id);
        await this.saveAllCollections(filtered);
    },

    /**
     * コレクションにアイテムを追加
     * @param {string} collectionId
     * @param {object} item - {type, url, title, content, imageUrl, sourceUrl}
     * @returns {Promise<object>} 追加されたアイテム
     */
    async addItem(collectionId, item) {
        const collections = await this.getAllCollections();
        const collection = collections.find(c => c.id === collectionId);
        if (!collection) throw new Error('Collection not found');

        // 画像の場合、可能ならBase64変換を試みる
        if (item.type === 'image' && item.imageUrl && typeof ImageProcessor !== 'undefined') {
            try {
                await ImageProcessor.optimizeItemImages(item);
            } catch (error) {
                console.warn('Image optimization skipped:', error);
            }
        }

        const newItem = {
            id: this.generateId(),
            ...item,
            savedAt: Date.now(),
            sortOrder: collection.items.length
        };
        collection.items.unshift(newItem);
        collection.updatedAt = Date.now();
        await this.saveAllCollections(collections);
        return newItem;
    },

    /**
     * アイテムを削除
     * @param {string} collectionId
     * @param {string} itemId
     */
    async removeItem(collectionId, itemId) {
        const collections = await this.getAllCollections();
        const collection = collections.find(c => c.id === collectionId);
        if (collection) {
            collection.items = collection.items.filter(i => i.id !== itemId);
            collection.updatedAt = Date.now();
            await this.saveAllCollections(collections);
        }
    },

    /**
     * アイテムの順序を更新
     * @param {string} collectionId
     * @param {Array<string>} itemIds - 新しい順序のアイテムID配列
     */
    async reorderItems(collectionId, itemIds) {
        const collections = await this.getAllCollections();
        const collection = collections.find(c => c.id === collectionId);
        if (collection) {
            const itemMap = new Map(collection.items.map(i => [i.id, i]));
            collection.items = itemIds.map((id, index) => {
                const item = itemMap.get(id);
                if (item) item.sortOrder = index;
                return item;
            }).filter(Boolean);
            collection.updatedAt = Date.now();
            await this.saveAllCollections(collections);
        }
    },

    /**
     * アイテムを更新
     * @param {string} collectionId
     * @param {string} itemId
     * @param {object} updates - 更新データ
     */
    async updateItem(collectionId, itemId, updates) {
        const collections = await this.getAllCollections();
        const collection = collections.find(c => c.id === collectionId);
        if (collection) {
            const itemIndex = collection.items.findIndex(i => i.id === itemId);
            if (itemIndex !== -1) {
                // 既存のアイテムと新規データをマージ
                collection.items[itemIndex] = {
                    ...collection.items[itemIndex],
                    ...updates
                };
                collection.updatedAt = Date.now();
                await this.saveAllCollections(collections);
                return collection.items[itemIndex];
            }
        }
        throw new Error('Item not found');
    },

    /**
     * 設定を取得
     * @returns {Promise<object>}
     */
    async getSettings() {
        const result = await chrome.storage.local.get(this.SETTINGS_KEY);
        return result[this.SETTINGS_KEY] || {
            syncEnabled: false,
            syncPassword: '',
            lastSyncTime: null
        };
    },

    /**
     * 設定を保存
     * @param {object} settings
     */
    async saveSettings(settings) {
        await chrome.storage.local.set({ [this.SETTINGS_KEY]: settings });
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
        const collections = await this.getAllCollections();
        return JSON.stringify({ collections, exportedAt: Date.now() }, null, 2);
    },

    /**
     * JSONデータをインポート
     * @param {string} jsonString
     */
    async importFromJson(jsonString) {
        const data = JSON.parse(jsonString);
        if (data.collections && Array.isArray(data.collections)) {
            await this.saveAllCollections(data.collections);
        }
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.CollectionStorage = CollectionStorage;
}
