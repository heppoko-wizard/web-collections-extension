// tests/sync-strategy.test.js
import test from 'node:test';
import assert from 'node:assert';
import { mergeItem } from '../js/sync-strategy.js';

test('mergeItem uses LWW at field level (object merge)', () => {
    const local = { id: '1', title: 'Local', updatedAt: 200 };
    const remote = { id: '1', title: 'Remote', isDeleted: true, updatedAt: 300 };
    
    const result = mergeItem(local, remote);
    assert.strictEqual(result.title, 'Remote');
    assert.strictEqual(result.isDeleted, true);
    assert.strictEqual(result.updatedAt, 300);
});

test('mergeItem prefers local if newer', () => {
    const local = { id: '1', title: 'Local', updatedAt: 400 };
    const remote = { id: '1', title: 'Remote', updatedAt: 300 };
    
    const result = mergeItem(local, remote);
    assert.strictEqual(result.title, 'Local');
    assert.strictEqual(result.updatedAt, 400);
});

test('multi-device merge simulation (logic equivalent to SyncManager)', () => {
    // SyncManager performs LWW on all items from all devices
    const deviceA_Item = { id: 'item-1', content: 'From A', updatedAt: 100 };
    const deviceB_Item = { id: 'item-1', content: 'From B (Newer)', updatedAt: 200 };
    const deviceC_Item = { id: 'item-1', content: 'From C (Old)', updatedAt: 50 };

    const items = [deviceA_Item, deviceB_Item, deviceC_Item];
    
    const mergedItems = new Map();
    for (const item of items) {
        const existing = mergedItems.get(item.id);
        if (!existing || item.updatedAt > existing.updatedAt) {
            mergedItems.set(item.id, item);
        }
    }

    const finalItem = mergedItems.get('item-1');
    assert.strictEqual(finalItem.content, 'From B (Newer)');
    assert.strictEqual(finalItem.updatedAt, 200);
});

test('isDeleted propagation in multi-device merge', () => {
    const itemAlive = { id: 'item-2', content: 'Alive', updatedAt: 300 };
    const itemDeleted = { id: 'item-2', isDeleted: true, updatedAt: 400 };
    const itemAliveOld = { id: 'item-2', content: 'Old Alive', updatedAt: 100 };

    const items = [itemAlive, itemDeleted, itemAliveOld];
    
    const mergedItems = new Map();
    for (const item of items) {
        const existing = mergedItems.get(item.id);
        if (!existing || item.updatedAt > existing.updatedAt) {
            mergedItems.set(item.id, item);
        }
    }

    const finalItem = mergedItems.get('item-2');
    assert.strictEqual(finalItem.isDeleted, true);
    assert.strictEqual(finalItem.updatedAt, 400);
});
