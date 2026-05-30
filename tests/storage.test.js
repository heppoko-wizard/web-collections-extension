// tests/storage.test.js
import test from 'node:test';
import assert from 'node:assert';
import { CollectionStorage } from '../js/storage.js';

// chrome.storage.local のモック
const mockStorage = {
    store: {},
    async get(keys) {
        if (typeof keys === 'string') {
            return { [keys]: this.store[keys] };
        }
        if (Array.isArray(keys)) {
            const res = {};
            keys.forEach(k => {
                res[k] = this.store[k];
            });
            return res;
        }
        return this.store;
    },
    async set(items) {
        Object.assign(this.store, items);
    },
    clear() {
        this.store = {};
    }
};

globalThis.chrome = {
    storage: {
        local: mockStorage
    }
};

test('CollectionStorage - CRUD operations', async (t) => {
    mockStorage.clear();

    await t.test('create and get collections', async () => {
        const col = await CollectionStorage.createCollection('Test Class');
        assert.strictEqual(col.name, 'Test Class');
        assert.strictEqual(col.itemCount, 0);

        const all = await CollectionStorage.getAllCollections();
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].name, 'Test Class');
    });

    await t.test('add and get items', async () => {
        const col = await CollectionStorage.createCollection('Test items');
        const item1 = await CollectionStorage.addItem(col.id, {
            type: 'link',
            url: 'https://example.com',
            title: 'Example',
            content: 'Hello'
        });

        assert.strictEqual(item1.title, 'Example');
        
        const items = await CollectionStorage.getItemsByCollection(col.id);
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].title, 'Example');
    });

    await t.test('update and delete collection', async () => {
        const col = await CollectionStorage.createCollection('Update Me');
        await CollectionStorage.updateCollection(col.id, { name: 'Updated Name' });
        
        const updatedCol = await CollectionStorage.getCollection(col.id);
        assert.strictEqual(updatedCol.name, 'Updated Name');

        await CollectionStorage.deleteCollection(col.id);
        const all = await CollectionStorage.getAllCollections(false);
        assert.strictEqual(all.find(c => c.id === col.id), undefined);
    });

    await t.test('safe merge and preserve items during import', async () => {
        mockStorage.clear();
        
        const col = await CollectionStorage.createCollection('Original Col');
        
        // ローカルコレクションの直接書き換えでテスト用の固定IDアイテムを設定
        const collections = await CollectionStorage._getCollectionsRaw();
        const targetCol = collections.find(c => c.id === col.id);
        targetCol.items = [
            {
                id: 'item-1',
                collectionId: col.id,
                type: 'link',
                url: 'https://example.com/original',
                title: 'Original Item',
                updatedAt: 1000,
                sortOrder: 0,
                isDeleted: false
            }
        ];
        await CollectionStorage._saveCollectionsRaw(collections);

        const partialImportData = {
            id: col.id,
            name: 'Merged Name',
            updatedAt: 2000
        };

        await CollectionStorage.importFromJson(JSON.stringify(partialImportData));

        const updatedCol = await CollectionStorage.getCollection(col.id);
        assert.strictEqual(updatedCol.name, 'Merged Name');

        const items = await CollectionStorage.getItemsByCollection(col.id);
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].title, 'Original Item');

        const mergeImportData = {
            id: col.id,
            name: 'Merged Name V2',
            updatedAt: 3000,
            items: [
                {
                    id: 'item-1',
                    type: 'link',
                    url: 'https://example.com/updated',
                    title: 'Updated Item',
                    updatedAt: 4000
                },
                {
                    id: 'item-2',
                    type: 'link',
                    url: 'https://example.com/new',
                    title: 'New Item',
                    updatedAt: 2000
                }
            ]
        };

        await CollectionStorage.importFromJson(JSON.stringify(mergeImportData));

        const finalItems = await CollectionStorage.getItemsByCollection(col.id);
        assert.strictEqual(finalItems.length, 2);

        const mergedItem1 = finalItems.find(i => i.id === 'item-1');
        assert.strictEqual(mergedItem1.title, 'Updated Item');
        assert.strictEqual(mergedItem1.url, 'https://example.com/updated');

        const newItem = finalItems.find(i => i.id === 'item-2');
        assert.strictEqual(newItem.title, 'New Item');
    });
});
