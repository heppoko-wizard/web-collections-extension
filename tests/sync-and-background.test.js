// tests/sync-and-background.test.js
import './mock-chrome.js';
import test from 'node:test';
import assert from 'node:assert';
import { mockStorageStore, mockBadge } from './mock-chrome.js';
import { executeAutoSyncPush } from '../js/background-handlers.js';
import { GoogleDriveSync } from '../js/google-drive-sync.js';
import { saveLocalCache } from '../js/image-cache-helper.js';

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
