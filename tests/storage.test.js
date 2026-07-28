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
        targetCol.updatedAt = 1000;
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

    await t.test('importCollectionData safe merge', async () => {
        mockStorage.clear();
        const col = await CollectionStorage.createCollection('ImportCol');
        
        const collections = await CollectionStorage._getCollectionsRaw();
        const targetCol = collections.find(c => c.id === col.id);
        targetCol.updatedAt = 1000;
        targetCol.items = [
            {
                id: 'item-a',
                collectionId: col.id,
                type: 'link',
                url: 'https://example.com/a',
                title: 'Item A',
                updatedAt: 1000,
                isDeleted: false
            }
        ];
        await CollectionStorage._saveCollectionsRaw(collections);

        const importData = {
            id: col.id,
            name: 'ImportCol Updated',
            updatedAt: 2000,
            items: [
                {
                    id: 'item-a',
                    type: 'link',
                    url: 'https://example.com/a-updated',
                    title: 'Item A Updated',
                    updatedAt: 2000
                },
                {
                    id: 'item-b',
                    type: 'link',
                    url: 'https://example.com/b',
                    title: 'Item B',
                    updatedAt: 1500
                }
            ]
        };

        await CollectionStorage.importCollectionData(importData);

        const items = await CollectionStorage.getItemsByCollection(col.id);
        assert.strictEqual(items.length, 2);

        const itemA = items.find(i => i.id === 'item-a');
        assert.strictEqual(itemA.title, 'Item A Updated');
        assert.strictEqual(itemA.url, 'https://example.com/a-updated');

        const itemB = items.find(i => i.id === 'item-b');
        assert.strictEqual(itemB.title, 'Item B');
    });

    await t.test('purgeDeletedData physically deletes old logical deleted records', async () => {
        mockStorage.clear();

        const colActive = await CollectionStorage.createCollection('Active Col');
        const colDeletedNew = await CollectionStorage.createCollection('Deleted New');
        const colDeletedOld = await CollectionStorage.createCollection('Deleted Old');

        const collections = await CollectionStorage._getCollectionsRaw();
        
        const cActive = collections.find(c => c.id === colActive.id);
        cActive.updatedAt = Date.now();
        cActive.isDeleted = false;

        const cDelNew = collections.find(c => c.id === colDeletedNew.id);
        cDelNew.updatedAt = Date.now() - 10 * 24 * 60 * 60 * 1000;
        cDelNew.isDeleted = true;

        const cDelOld = collections.find(c => c.id === colDeletedOld.id);
        cDelOld.updatedAt = Date.now() - 40 * 24 * 60 * 60 * 1000;
        cDelOld.isDeleted = true;

        cActive.items = [
            {
                id: 'item-active',
                collectionId: colActive.id,
                updatedAt: Date.now(),
                isDeleted: false
            },
            {
                id: 'item-del-new',
                collectionId: colActive.id,
                updatedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
                isDeleted: true
            },
            {
                id: 'item-del-old',
                collectionId: colActive.id,
                updatedAt: Date.now() - 35 * 24 * 60 * 60 * 1000,
                isDeleted: true
            }
        ];

        await CollectionStorage._saveCollectionsRaw(collections);

        const purged = await CollectionStorage.purgeDeletedData(30);
        assert.strictEqual(purged, true);

        const finalCollections = await CollectionStorage._getCollectionsRaw();
        
        assert.strictEqual(finalCollections.find(c => c.id === colDeletedOld.id), undefined);
        assert.ok(finalCollections.find(c => c.id === colActive.id));
        assert.ok(finalCollections.find(c => c.id === colDeletedNew.id));

        const activeColRecord = finalCollections.find(c => c.id === colActive.id);
        assert.strictEqual(activeColRecord.items.length, 2);
        
        assert.strictEqual(activeColRecord.items.find(i => i.id === 'item-del-old'), undefined);
        assert.ok(activeColRecord.items.find(i => i.id === 'item-active'));
        assert.ok(activeColRecord.items.find(i => i.id === 'item-del-new'));
    });

    await t.test('generateId generates valid UUID', async () => {
        const id = CollectionStorage.generateId();
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        assert.ok(uuidPattern.test(id));
    });

    await t.test('savedAt ordering ignores conflicting sortOrder values', async () => {
        mockStorage.clear();

        const col = await CollectionStorage.createCollection('SavedAt Test');
        const mergeData = {
            id: col.id,
            name: 'SavedAt Test',
            updatedAt: Date.now(),
            items: [
                {
                    id: 'item-old',
                    type: 'link',
                    url: 'https://example.com/old',
                    title: 'Old Item',
                    sortOrder: 0,
                    savedAt: 1000,
                    updatedAt: 3000
                },
                {
                    id: 'item-new',
                    type: 'link',
                    url: 'https://example.com/new',
                    title: 'New Item',
                    sortOrder: 0,
                    savedAt: 2000,
                    updatedAt: 2000
                },
                {
                    id: 'item-new-b',
                    type: 'link',
                    url: 'https://example.com/new-b',
                    title: 'New Item B',
                    sortOrder: 99,
                    savedAt: 2000,
                    updatedAt: 2000
                }
            ]
        };

        await CollectionStorage.importFromJson(JSON.stringify(mergeData));

        const items = await CollectionStorage.getItemsByCollection(col.id);
        assert.deepStrictEqual(items.map(item => item.id), [
            'item-new',
            'item-new-b',
            'item-old'
        ]);
    });
});
