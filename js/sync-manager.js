// js/sync-manager.js

/**
 * sync-manager.js - 分散型同期オーケストレーター
 * manifest.json と collections/*.json を用いた差分同期を制御する
 */

import { mergeItem } from './sync-strategy.js';
import { FolderSync } from './folder-sync.js';

export const SyncManager = {
    /**
     * ローカルフォルダへの分散プッシュ
     * @param {object} storage - CollectionStorage
     */
    async pushToLocalFolder(storage) {
        console.log('SyncManager: Starting decentralized push...');
        
        try {
            const rootHandle = await FolderSync.getSavedDirectoryHandle();
            if (!rootHandle || !(await FolderSync.hasPermission(rootHandle, true))) {
                throw new Error('PermissionDenied');
            }

            const colDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.COLLECTIONS_DIR, true);
            const collections = await storage.getAllCollections(true); // 削除済みも含む

            // 1. 各コレクションを個別ファイルとして保存
            const manifest = [];
            for (const col of collections) {
                const fullData = await storage.exportCollection(col.id);
                await FolderSync.writeFile(`${col.id}.json`, JSON.stringify(fullData), colDirHandle);
                
                // マニフェスト用メタデータ
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
                version: 2,
                collections: manifest,
                exportedAt: Date.now()
            };
            await FolderSync.writeFile(FolderSync.FILENAME, JSON.stringify(manifestData), rootHandle);

            console.log('SyncManager: Decentralized push completed.');
            return { success: true };
        } catch (error) {
            console.error('SyncManager: Push failed:', error);
            throw error;
        }
    },

    /**
     * ローカルフォルダからの分散プル
     * @param {object} storage - CollectionStorage
     */
    async pullFromLocalFolder(storage) {
        console.log('SyncManager: Starting decentralized pull...');

        try {
            const rootHandle = await FolderSync.getSavedDirectoryHandle();
            if (!rootHandle || !(await FolderSync.hasPermission(rootHandle, false))) {
                throw new Error('PermissionDenied');
            }

            // 1. マニフェストの読み込み
            const manifestText = await FolderSync.readFile(FolderSync.FILENAME, rootHandle);
            if (!manifestText) return { success: true, message: 'No manifest found' };
            
            const remoteManifest = JSON.parse(manifestText);
            const colDirHandle = await FolderSync.getDirectoryHandle(rootHandle, FolderSync.COLLECTIONS_DIR, true);

            // 2. 各コレクションの更新確認
            for (const remoteCol of remoteManifest.collections) {
                const localCol = await storage.getCollection(remoteCol.id);
                
                // リモートの方が新しい、またはローカルに存在しない場合にプル
                if (!localCol || remoteCol.updatedAt > (localCol.updatedAt || 0)) {
                    console.log(`SyncManager: Pulling updated collection: ${remoteCol.name}`);
                    const colText = await FolderSync.readFile(`${remoteCol.id}.json`, colDirHandle);
                    if (colText) {
                        const colData = JSON.parse(colText);
                        await storage.importCollectionData(colData);
                    }
                }
            }

            console.log('SyncManager: Decentralized pull completed.');
            return { success: true };
        } catch (error) {
            console.error('SyncManager: Pull failed:', error);
            throw error;
        }
    },

    /**
     * 旧互換メソッド（プレースホルダ）
     */
    async sync(storage, localStorage) {
        return this.pushToLocalFolder(localStorage);
    }
};
