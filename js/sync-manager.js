// js/sync-manager.js

/**
 * sync-manager.js - マルチライター対応分散型同期オーケストレーター
 * 効率的なポーリング（段階的フィルタリング）をサポート
 */

import { mergeItem } from './sync-strategy.js';
import { FolderSync } from './folder-sync.js';
import { DeviceManager } from './device-manager.js';

export const SyncManager = {
    LAST_CHECKED_KEY: 'sync_last_checked_stamps',

    /**
     * ローカルフォルダへのマルチライター形式でのプッシュ
     */
    async pushToLocalFolder(storage) {
        console.log('SyncManager: Starting multi-writer push...');
        
        try {
            const rootHandle = await FolderSync.getSavedDirectoryHandle();
            if (!rootHandle || !(await FolderSync.hasPermission(rootHandle, true))) {
                throw new Error('PermissionDenied');
            }

            const { deviceId, deviceName } = await DeviceManager.getDeviceInfo();
            const manifestDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.MANIFESTS_DIR, true);
            const colDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.COLLECTIONS_DIR, true);
            
            const collections = await storage.getAllCollections(true);

            // 1. 各コレクションを個別ファイルとして保存
            const manifest = [];
            for (const col of collections) {
                const fullData = await storage.exportCollection(col.id);
                const fileName = FolderSync.getCollectionFileName(col.id, deviceId);
                await FolderSync.writeFile(fileName, JSON.stringify(fullData), colDirHandle);
                
                manifest.push({
                    id: col.id,
                    name: col.name,
                    updatedAt: col.updatedAt,
                    itemCount: col.itemCount,
                    isDeleted: col.isDeleted || false
                });
            }

            // 2. マニフェストを保存
            const manifestData = {
                version: 3,
                deviceId,
                deviceName,
                collections: manifest,
                exportedAt: Date.now()
            };
            const manifestFileName = FolderSync.getManifestName(deviceId);
            await FolderSync.writeFile(manifestFileName, JSON.stringify(manifestData), manifestDirHandle);

            console.log('SyncManager: Multi-writer push completed.');
            return { success: true };
        } catch (error) {
            console.error('SyncManager: Push failed:', error);
            throw error;
        }
    },

    /**
     * 効率的なプル＆マージ
     * OSタイムスタンプ -> マニフェスト内容 -> 個別ファイルの順でフィルタリング
     */
    async pullFromLocalFolder(storage) {
        console.log('SyncManager: Starting efficient multi-writer pull...');

        try {
            const rootHandle = await FolderSync.getSavedDirectoryHandle();
            if (!rootHandle || !(await FolderSync.hasPermission(rootHandle, false))) {
                throw new Error('PermissionDenied');
            }

            const { deviceId: currentDeviceId } = await DeviceManager.getDeviceInfo();
            const manifestDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.MANIFESTS_DIR, true);
            const colDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.COLLECTIONS_DIR, true);

            // 前回のチェック時のタイムスタンプをロード
            const stampsResult = await chrome.storage.local.get(this.LAST_CHECKED_KEY);
            const lastStamps = stampsResult[this.LAST_CHECKED_KEY] || {};
            const newStamps = {};

            // 1. 全マニフェストファイルをリストアップ
            const manifestFiles = await FolderSync.listManifests();
            const updatedManifests = [];

            for (const fileName of manifestFiles) {
                const deviceId = fileName.replace('manifest_', '').replace('.json', '');
                if (deviceId === currentDeviceId) continue;

                // 【第1段階】OSレベルのタイムスタンプ比較
                const currentTs = await FolderSync.getFileTimestamp(fileName, manifestDirHandle);
                newStamps[deviceId] = currentTs;

                if (currentTs > (lastStamps[deviceId] || 0)) {
                    updatedManifests.push(fileName);
                }
            }

            if (updatedManifests.length === 0) {
                console.log('SyncManager: No remote changes detected (via OS timestamps).');
                return { success: true, message: 'No changes' };
            }

            // 【第2段階】変更があったマニフェストの中身を精査
            const collectionLatestMeta = new Map();

            for (const fileName of updatedManifests) {
                try {
                    const content = await FolderSync.readFile(fileName, manifestDirHandle);
                    const remoteManifest = JSON.parse(content);

                    for (const remoteColMeta of remoteManifest.collections) {
                        const existingMeta = collectionLatestMeta.get(remoteColMeta.id);
                        if (!existingMeta || remoteColMeta.updatedAt > existingMeta.updatedAt) {
                            collectionLatestMeta.set(remoteColMeta.id, {
                                ...remoteColMeta,
                                deviceId: remoteManifest.deviceId
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`SyncManager: Failed to parse manifest ${fileName}`, e);
                }
            }

            // 【第3段階】本当に新しいデータを持つコレクションのみをプル
            let anyChanges = false;
            for (const [colId, latestMeta] of collectionLatestMeta.entries()) {
                const localCol = await storage.getCollection(colId);
                
                if (!localCol || latestMeta.updatedAt > (localCol.updatedAt || 0)) {
                    console.log(`SyncManager: Pulling changed collection: ${latestMeta.name}`);
                    
                    // アイテムレベルのマージ（全デバイスから収集）
                    const mergedItems = new Map();
                    const localItems = await storage.getItemsByCollection(colId, true);
                    localItems.forEach(item => mergedItems.set(item.id, item));

                    for (const fileName of manifestFiles) {
                        const deviceIdSuffix = fileName.replace('manifest_', '').replace('.json', '');
                        const colFileName = FolderSync.getCollectionFileName(colId, deviceIdSuffix);
                        
                        try {
                            const colContent = await FolderSync.readFile(colFileName, colDirHandle);
                            const colData = JSON.parse(colContent);
                            for (const remoteItem of (colData.items || [])) {
                                const existing = mergedItems.get(remoteItem.id);
                                if (!existing || (remoteItem.updatedAt || 0) > (existing.updatedAt || 0)) {
                                    mergedItems.set(remoteItem.id, remoteItem);
                                }
                            }
                        } catch (e) { /* ignore missing files */ }
                    }

                    await storage.importCollectionData({
                        ...latestMeta,
                        items: Array.from(mergedItems.values())
                    });
                    anyChanges = true;
                }
            }

            // タイムスタンプを保存
            await chrome.storage.local.set({ [this.LAST_CHECKED_KEY]: newStamps });

            console.log('SyncManager: Efficient pull completed.');
            return { success: true, updated: anyChanges };
        } catch (error) {
            console.error('SyncManager: Pull failed:', error);
            throw error;
        }
    }
};
