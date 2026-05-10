// tests/migration.test.js
import test from 'node:test';
import assert from 'node:assert';
import { migrateDataToUUIDs } from '../js/migration.js';

// Polyfill crypto for node test environment if needed
if (!globalThis.crypto) {
    import('node:crypto').then(crypto => {
        globalThis.crypto = crypto.webcrypto;
    });
}

test('migrates old IDs to UUIDs', () => {
    const oldItems = [{ id: 'old-123', content: 'test', updatedAt: 100 }];
    const newItems = migrateDataToUUIDs(oldItems);
    assert.match(newItems[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.strictEqual(newItems[0].content, 'test');
});
