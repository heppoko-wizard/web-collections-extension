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
});
