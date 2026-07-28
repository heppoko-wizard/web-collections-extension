// tests/sync-and-background.test.js
import './mock-chrome.js';
import test from 'node:test';
import assert from 'node:assert';
import { mockStorageStore, mockBadge, indexedDBStore } from './mock-chrome.js';
import { executeAutoSyncPush, executeAutoSyncCycle, handleMessage } from '../js/background-handlers.js';
import { GoogleDriveSync } from '../js/google-drive-sync.js';
import { CollectionStorage } from '../js/storage.js';
import { saveLocalCache } from '../js/image-cache-helper.js';
import { encrypt } from '../js/encryption-helper.js';

// 同期ロックのタイムアウト自動解放の検証
test('Sync Lock - should release lock if expired', async (t) => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    mockStorageStore['wc_sync_lock'] = { timestamp: tenMinutesAgo };
    
    let pushCalled = false;
    const originalPush = GoogleDriveSync.push;
    GoogleDriveSync.push = async () => {
        pushCalled = true;
        return { success: true, report: {} };
    };

    try {
        await executeAutoSyncPush();
        assert.strictEqual(pushCalled, true, 'Expired lock should be auto-released and push should be executed');
        assert.strictEqual(mockStorageStore['wc_sync_lock'], undefined, 'Expired lock should be removed from storage');
    } finally {
        GoogleDriveSync.push = originalPush;
        delete mockStorageStore['wc_sync_lock'];
    }
});

test('Sync Lock - should preserve lock if active', async (t) => {
    const oneMinuteAgo = Date.now() - 1 * 60 * 1000;
    mockStorageStore['wc_sync_lock'] = { timestamp: oneMinuteAgo };

    let pushCalled = false;
    const originalPush = GoogleDriveSync.push;
    GoogleDriveSync.push = async () => {
        pushCalled = true;
        return { success: true, report: {} };
    };

    try {
        await executeAutoSyncPush();
        assert.strictEqual(pushCalled, false, 'Active lock should bypass push');
        assert.ok(mockStorageStore['wc_sync_lock'], 'Active lock should remain in storage');
    } finally {
        GoogleDriveSync.push = originalPush;
        delete mockStorageStore['wc_sync_lock'];
    }
});

test('Auto Sync - should skip a duplicate run while one is active', async () => {
    delete mockStorageStore['wc_sync_lock'];

    const originalPush = GoogleDriveSync.push;
    let releasePush;
    let pushCount = 0;
    GoogleDriveSync.push = async () => {
        pushCount += 1;
        await new Promise(resolve => {
            releasePush = resolve;
        });
        return { success: true, report: {} };
    };

    try {
        const firstRun = executeAutoSyncPush();
        await Promise.resolve();

        const duplicateResult = await executeAutoSyncPush();
        assert.strictEqual(duplicateResult.skipped, true);
        assert.strictEqual(pushCount, 1);

        releasePush();
        await firstRun;
        assert.strictEqual(pushCount, 1);
    } finally {
        GoogleDriveSync.push = originalPush;
    }
});

test('Auto Sync - should pull before push', async () => {
    delete mockStorageStore['wc_sync_lock'];

    const originalPull = GoogleDriveSync.pull;
    const originalPush = GoogleDriveSync.push;
    const calls = [];

    GoogleDriveSync.pull = async () => {
        calls.push('pull');
        return { success: true, updated: true, report: {} };
    };
    GoogleDriveSync.push = async () => {
        calls.push('push');
        return { success: true, report: {} };
    };

    try {
        const result = await executeAutoSyncCycle(() => {});
        assert.strictEqual(result.success, true);
        assert.deepStrictEqual(calls, ['pull', 'push']);
    } finally {
        GoogleDriveSync.pull = originalPull;
        GoogleDriveSync.push = originalPush;
    }
});

test('Data Operations - should not mutate collections during pull', async () => {
    delete mockStorageStore['wc_sync_lock'];

    const originalPull = GoogleDriveSync.pull;
    const originalAddItem = CollectionStorage.addItem;
    const calls = [];
    let releasePull;

    GoogleDriveSync.pull = async () => {
        calls.push('pull-start');
        await new Promise(resolve => {
            releasePull = resolve;
        });
        calls.push('pull-end');
        return { success: true, updated: false, report: {} };
    };
    CollectionStorage.addItem = async () => {
        calls.push('add');
        return { id: 'queued-item' };
    };

    try {
        const pullRun = handleMessage({ action: 'autoSyncPull', interactive: false });
        while (!releasePull) await Promise.resolve();

        const addRun = handleMessage({
            action: 'addItem',
            collectionId: 'collection-1',
            item: { title: 'Queued' }
        });
        await Promise.resolve();
        assert.deepStrictEqual(calls, ['pull-start']);

        releasePull();
        await Promise.all([pullRun, addRun]);
        assert.deepStrictEqual(calls, ['pull-start', 'pull-end', 'add']);
    } finally {
        GoogleDriveSync.pull = originalPull;
        CollectionStorage.addItem = originalAddItem;
    }
});

test('Manual Sync - should run pull then push in one exclusive cycle', async () => {
    delete mockStorageStore['wc_sync_lock'];

    const originalPull = GoogleDriveSync.pull;
    const originalPush = GoogleDriveSync.push;
    const calls = [];
    let contextMenuRefreshCount = 0;

    GoogleDriveSync.pull = async () => {
        calls.push('pull');
        return { success: true, updated: true, report: { totalTime: 10 } };
    };
    GoogleDriveSync.push = async () => {
        calls.push('push');
        return { success: true, report: { totalTime: 20 } };
    };

    try {
        const result = await handleMessage(
            { action: 'syncNow' },
            () => { contextMenuRefreshCount += 1; }
        );

        assert.deepStrictEqual(calls, ['pull', 'push']);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.pullReport.totalTime, 10);
        assert.strictEqual(result.pushReport.totalTime, 20);
        assert.strictEqual(contextMenuRefreshCount, 1);
        assert.ok(mockStorageStore.wc_settings.lastSyncTime > 0);
    } finally {
        GoogleDriveSync.pull = originalPull;
        GoogleDriveSync.push = originalPush;
    }
});

// 認証失敗時のエラーバッジ警告
test('Auth Failure - should display red badge on auth error', async (t) => {
    mockBadge.text = '';
    mockBadge.color = '';

    const originalPush = GoogleDriveSync.push;
    GoogleDriveSync.push = async () => {
        throw new Error('OAuth2 auth failed or user is not signed in');
    };

    try {
        await executeAutoSyncPush();
        assert.strictEqual(mockBadge.text, '!', 'Badge text should be "!" on auth error');
        assert.strictEqual(mockBadge.color, '#FF5252', 'Badge color should be red on auth error');
    } finally {
        GoogleDriveSync.push = originalPush;
    }
});

test('Main Sync - should pull existing cloud data before first push', async () => {
    delete mockStorageStore.wc_last_modified_time;
    delete mockStorageStore.wc_pending_image_uploads;

    const originalFindSync = GoogleDriveSync.findSyncFile;
    const originalPull = GoogleDriveSync.pull;
    const originalCompress = GoogleDriveSync.compressData;
    const originalFetch = GoogleDriveSync.fetchWithAuth;
    let pullCount = 0;
    let patchCount = 0;

    GoogleDriveSync.findSyncFile = async () => ({ id: 'sync-file', modifiedTime: 'cloud-v1' });
    GoogleDriveSync.pull = async () => {
        pullCount += 1;
        mockStorageStore.wc_last_modified_time = 'cloud-v1';
        return { success: true, updated: true, report: {} };
    };
    GoogleDriveSync.compressData = async () => 'compressed';
    GoogleDriveSync.fetchWithAuth = async (_url, options) => {
        if (options.method === 'PATCH') patchCount += 1;
        return { ok: true, text: async () => '' };
    };

    const dummyStorage = {
        async _getCollectionsRaw() { return []; },
        async _saveCollectionsRaw() {},
        async getSettings() { return { lastSyncTime: 0 }; },
        async saveSettings() {},
        async purgeDeletedData() {},
        async exportToJson() { return '{}'; }
    };

    try {
        await GoogleDriveSync.push(dummyStorage, true, false);
        assert.strictEqual(pullCount, 1);
        assert.strictEqual(patchCount, 1);
    } finally {
        GoogleDriveSync.findSyncFile = originalFindSync;
        GoogleDriveSync.pull = originalPull;
        GoogleDriveSync.compressData = originalCompress;
        GoogleDriveSync.fetchWithAuth = originalFetch;
        delete mockStorageStore.wc_last_modified_time;
    }
});

test('Main Sync - should fail instead of force-overwriting persistent conflicts', async () => {
    mockStorageStore.wc_last_modified_time = 'local-v1';
    delete mockStorageStore.wc_pending_image_uploads;

    const originalFindSync = GoogleDriveSync.findSyncFile;
    const originalPull = GoogleDriveSync.pull;
    const originalCompress = GoogleDriveSync.compressData;
    const originalFetch = GoogleDriveSync.fetchWithAuth;
    let pullCount = 0;
    let patchCount = 0;

    GoogleDriveSync.findSyncFile = async () => ({ id: 'sync-file', modifiedTime: 'cloud-v2' });
    GoogleDriveSync.pull = async () => {
        pullCount += 1;
        return { success: true, updated: true, report: {} };
    };
    GoogleDriveSync.compressData = async () => 'compressed';
    GoogleDriveSync.fetchWithAuth = async (_url, options) => {
        if (options.method === 'PATCH') patchCount += 1;
        return { ok: true, text: async () => '' };
    };

    const dummyStorage = {
        async _getCollectionsRaw() { return []; },
        async _saveCollectionsRaw() {},
        async getSettings() { return { lastSyncTime: 0 }; },
        async saveSettings() {},
        async purgeDeletedData() {},
        async exportToJson() { return '{}'; }
    };

    try {
        await assert.rejects(
            GoogleDriveSync.push(dummyStorage, true, false),
            /SyncConflict/
        );
        assert.strictEqual(pullCount, 2);
        assert.strictEqual(patchCount, 0);
    } finally {
        GoogleDriveSync.findSyncFile = originalFindSync;
        GoogleDriveSync.pull = originalPull;
        GoogleDriveSync.compressData = originalCompress;
        GoogleDriveSync.fetchWithAuth = originalFetch;
        delete mockStorageStore.wc_last_modified_time;
    }
});

test('Drive Thumbnails - should share the index and cap concurrent downloads', async () => {
    const hashes = ['thumb-1', 'thumb-2', 'thumb-3', 'thumb-4', 'thumb-5'];
    hashes.forEach(hash => indexedDBStore.delete(hash));

    const originalPullImageIndex = GoogleDriveSync.pullImageIndex;
    const originalDownloadImageCache = GoogleDriveSync.downloadImageCache;
    let indexPullCount = 0;
    let downloadCount = 0;
    let activeDownloads = 0;
    let maxActiveDownloads = 0;
    const encryptedThumbnail = await encrypt('data:image/webp;base64,thumbnail');

    GoogleDriveSync.pullImageIndex = async () => {
        indexPullCount += 1;
        return {
            data: {
                version: 1,
                images: Object.fromEntries(hashes.map(hash => [hash, { fileId: `file-${hash}` }]))
            },
            modifiedTime: 'index-v1'
        };
    };
    GoogleDriveSync.downloadImageCache = async () => {
        downloadCount += 1;
        activeDownloads += 1;
        maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
        await new Promise(resolve => setTimeout(resolve, 5));
        activeDownloads -= 1;
        return encryptedThumbnail;
    };

    try {
        const requests = [...hashes, hashes[0]].map(hash => handleMessage({
            action: 'getImageCacheFromDrive',
            hash
        }));
        const results = await Promise.all(requests);

        assert.strictEqual(indexPullCount, 1);
        assert.strictEqual(downloadCount, hashes.length);
        assert.ok(maxActiveDownloads <= 4);
        results.forEach(result => {
            assert.strictEqual(result.data, 'data:image/webp;base64,thumbnail');
        });
    } finally {
        GoogleDriveSync.pullImageIndex = originalPullImageIndex;
        GoogleDriveSync.downloadImageCache = originalDownloadImageCache;
        hashes.forEach(hash => indexedDBStore.delete(hash));
    }
});

// 画像アップロード失敗時のリトライキュー
test('Image Upload Retry Queue - should save to queue on failure and retry on push', async (t) => {
    delete mockStorageStore['wc_pending_image_uploads'];

    // 事前に IndexedDB モックにダミーのキャッシュデータを保存しておく
    await saveLocalCache('test-hash-123', 'data:image/webp;base64,mock');

    const originalUploadCache = GoogleDriveSync.uploadImageCache;
    GoogleDriveSync.uploadImageCache = async () => {
        throw new Error('Network upload failed');
    };

    try {
        await GoogleDriveSync.uploadImageOnRegistration('test-hash-123', 'data:image/webp;base64,mock', 'https://example.com/img');
        
        const pending = mockStorageStore['wc_pending_image_uploads'];
        assert.ok(pending, 'Failed upload should be saved to pending queue');
        assert.strictEqual(pending.length, 1);
        assert.strictEqual(pending[0].hash, 'test-hash-123');
        assert.strictEqual(pending[0].url, 'https://example.com/img');

        let retryCalled = false;
        GoogleDriveSync.uploadImageCache = originalUploadCache;
        
        const originalUploadReg = GoogleDriveSync.uploadImageOnRegistration;
        GoogleDriveSync.uploadImageOnRegistration = async (hash, data, url) => {
            retryCalled = true;
            assert.strictEqual(hash, 'test-hash-123');
            assert.strictEqual(url, 'https://example.com/img');
        };

        const dummyStorage = {
            async _getCollectionsRaw() { return []; },
            async _saveCollectionsRaw() {},
            async getSettings() { return { lastSyncTime: 0 }; },
            async saveSettings() {},
            async purgeDeletedData() {},
            async exportToJson() { return '{}'; }
        };

        const originalFindSync = GoogleDriveSync.findSyncFile;
        GoogleDriveSync.findSyncFile = async () => null;
        const originalCompress = GoogleDriveSync.compressData;
        GoogleDriveSync.compressData = async () => 'compressed';
        const originalFetchWithAuth = GoogleDriveSync.fetchWithAuth;
        GoogleDriveSync.fetchWithAuth = async () => {
            return { ok: true, json: async () => ({ id: 'new-file-id' }) };
        };

        try {
            await GoogleDriveSync.push(dummyStorage, true, false);
            assert.strictEqual(retryCalled, true, 'Pending upload should be retried during push');
            assert.strictEqual(mockStorageStore['wc_pending_image_uploads'], undefined, 'Queue should be cleared after retry');
        } finally {
            GoogleDriveSync.uploadImageOnRegistration = originalUploadReg;
            GoogleDriveSync.findSyncFile = originalFindSync;
            GoogleDriveSync.compressData = originalCompress;
            GoogleDriveSync.fetchWithAuth = originalFetchWithAuth;
        }
    } finally {
        GoogleDriveSync.uploadImageCache = originalUploadCache;
        delete mockStorageStore['wc_pending_image_uploads'];
    }
});
