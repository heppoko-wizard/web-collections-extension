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

test('mergeItem handles missing local/remote', () => {
    const data = { id: '1', title: 'Data', updatedAt: 100 };
    assert.deepStrictEqual(mergeItem(null, data), data);
    assert.deepStrictEqual(mergeItem(data, null), data);
});
