// js/sync-manager.js

/**
 * sync-manager.js - 同期のオーケストレーター
 * 外部ストレージ（Gist, Folder等）とローカルIndexedDBの同期フローを制御する
 */

import { mergeItem } from './sync-strategy.js';

export const SyncManager = {
    /**
     * 同期を実行
     * @param {object} storage - 同期先ストレージ (GistSync, FolderSync等)
     * @param {object} localStorage - ローカルストレージ (CollectionStorage)
     */
    async sync(storage, localStorage) {
        console.log('Starting synchronization...');
        
        try {
            // 1. ローカルとリモートのデータを取得
            const localData = JSON.parse(await localStorage.exportToJson());
            const remoteData = await storage.pull(); // 各ストレージが実装するpullメソッド

            if (!remoteData) {
                // リモートにデータがない場合はローカルをプッシュして終了
                await storage.push(JSON.stringify(localData));
                return { success: true, message: 'First sync: Initial push completed.' };
            }

            const remoteJson = JSON.parse(remoteData);
            const mergedCollections = this.mergeData(localData.collections, remoteJson.collections);

            // 2. マージ結果を保存
            const mergedData = {
                collections: mergedCollections,
                exportedAt: Date.now()
            };

            await localStorage.importFromJson(JSON.stringify(mergedData));
            await storage.push(JSON.stringify(mergedData));

            console.log('Synchronization completed successfully.');
            return { success: true, data: mergedData };
        } catch (error) {
            console.error('Synchronization failed:', error);
            throw error;
        }
    },

    /**
     * 2つのコレクション配列をマージする
     */
    mergeData(localCols, remoteCols) {
        const colMap = new Map();

        // ローカルデータをベースにする
        localCols.forEach(col => colMap.set(col.id, col));

        // リモートデータとマージ
        remoteCols.forEach(remoteCol => {
            const localCol = colMap.get(remoteCol.id);
            if (!localCol) {
                colMap.set(remoteCol.id, remoteCol);
            } else {
                // コレクション自体のメタデータをマージ
                const mergedCol = mergeItem(localCol, remoteCol);
                
                // アイテムをマージ
                mergedCol.items = this.mergeItems(localCol.items || [], remoteCol.items || []);
                
                colMap.set(remoteCol.id, mergedCol);
            }
        });

        return Array.from(colMap.values());
    },

    /**
     * アイテム配列をマージする
     */
    mergeItems(localItems, remoteItems) {
        const itemMap = new Map();
        localItems.forEach(item => itemMap.set(item.id, item));

        remoteItems.forEach(remoteItem => {
            const localItem = itemMap.get(remoteItem.id);
            if (!localItem) {
                itemMap.set(remoteItem.id, remoteItem);
            } else {
                itemMap.set(remoteItem.id, mergeItem(localItem, remoteItem));
            }
        });

        // 削除済みフラグ (isDeleted) を考慮してフィルタリング (オプション)
        // ここでは LWW によって isDeleted が真になったものが残る
        
        return Array.from(itemMap.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
};
