// js/sync-manager.js

/**
 * sync-manager.js - マルチライター対応分散型同期オーケストレーター
 * デバイス固有の manifest_[DeviceID].json と collection_[UUID]_[DeviceID].json を制御する
 */

import { mergeItem } from './sync-strategy.js';
import { FolderSync } from './folder-sync.js';
import { DeviceManager } from './device-manager.js';

export const SyncManager = {
    /**
     * ローカルフォルダへのマルチライター形式でのプッシュ
     * @param {object} storage - CollectionStorage
     */
    async pushToLocalFolder(storage) {
        console.log('SyncManager: Starting multi-writer push...');
        
        try {
            const rootHandle = await FolderSync.getSavedDirectoryHandle();
            if (!rootHandle || !(await FolderSync.hasPermission(rootHandle, true))) {
                throw new Error('PermissionDenied');
            }

            const { deviceId, deviceName } = await DeviceManager.getDeviceInfo();
            
            // ディレクトリハンドルの取得
            const manifestDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.MANIFESTS_DIR, true);
            const colDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.COLLECTIONS_DIR, true);
            
            const collections = await storage.getAllCollections(true);

            // 1. 各コレクションをデバイス固有のファイルとして保存
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

            // 2. デバイス固有のマニフェストを保存
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
     * ローカルフォルダからのマルチライター形式でのプル＆マージ
     * @param {object} storage - CollectionStorage
     */
    async pullFromLocalFolder(storage) {
        console.log('SyncManager: Starting multi-writer pull and merge...');

        try {
            const rootHandle = await FolderSync.getSavedDirectoryHandle();
            if (!rootHandle || !(await FolderSync.hasPermission(rootHandle, false))) {
                throw new Error('PermissionDenied');
            }

            const { deviceId: currentDeviceId } = await DeviceManager.getDeviceInfo();
            const manifestDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.MANIFESTS_DIR, true);
            const colDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.COLLECTIONS_DIR, true);

            // 1. 全デバイスのマニフェストをリストアップ
            const manifestFiles = await FolderSync.listManifests();
            
            // 2. 全アイテムの最新状態を追跡するためのMap
            // Key: CollectionID, Value: Map<ItemID, ItemData>
            const collectionLatestItems = new Map();
            // コレクション自体のメタデータ管理
            const collectionLatestMeta = new Map();

            for (const fileName of manifestFiles) {
                try {
                    const content = await FolderSync.readFile(fileName, manifestDirHandle);
                    const remoteManifest = JSON.parse(content);
                    
                    // 自分自身のファイルはスキップ（ローカルIndexedDBが正であるため）
                    // ただし初回同期などの場合は考慮が必要だが、基本は他人の変更を取り込む
                    if (remoteManifest.deviceId === currentDeviceId) continue;

                    for (const remoteColMeta of remoteManifest.collections) {
                        // コレクションメタデータのマージ (LWW)
                        const existingMeta = collectionLatestMeta.get(remoteColMeta.id);
                        if (!existingMeta || remoteColMeta.updatedAt > existingMeta.updatedAt) {
                            collectionLatestMeta.set(remoteColMeta.id, {
                                ...remoteColMeta,
                                deviceId: remoteManifest.deviceId // どのデバイスから取得すべきか保持
                            });
                        }

                        // アイテムのマージ準備（あとで実体ファイルを読み込む必要がある）
                    }
                } catch (e) {
                    console.warn(`SyncManager: Failed to read manifest ${fileName}`, e);
                }
            }

            // 3. 各コレクションの実体ファイルを読み込み、アイテムレベルでマージ
            for (const [colId, latestMeta] of collectionLatestMeta.entries()) {
                const localCol = await storage.getCollection(colId);
                
                // ローカルより新しい、またはローカルに存在しない場合
                if (!localCol || latestMeta.updatedAt > (localCol.updatedAt || 0)) {
                    // 全デバイスの該当コレクションファイルを読み込んでマージ
                    const mergedItems = new Map();
                    
                    // まずローカルのアイテムを入れる
                    const localItems = await storage.getItemsByCollection(colId);
                    localItems.forEach(item => mergedItems.set(item.id, item));

                    // 他デバイスの該当コレクションファイルを読み込む
                    // (本当は manifest で更新があるデバイスだけに絞るのが効率的だが、
                    //  今はシンプルに全デバイスの当該ファイルをスキャンする方針とする)
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
                        } catch (e) {
                            // ファイルが存在しないデバイスはスキップ
                        }
                    }

                    // 4. マージ結果を保存
                    const finalCollection = {
                        ...latestMeta,
                        items: Array.from(mergedItems.values())
                    };
                    await storage.importCollectionData(finalCollection);
                }
            }

            console.log('SyncManager: Multi-writer pull completed.');
            return { success: true };
        } catch (error) {
            console.error('SyncManager: Pull failed:', error);
            throw error;
        }
    },

    /**
     * 旧互換メソッド
     */
    async sync(storage, localStorage) {
        return this.pushToLocalFolder(localStorage);
    }
};
