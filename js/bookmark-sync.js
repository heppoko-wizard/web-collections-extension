// js/bookmark-sync.js

/**
 * BookmarkSync - ブックマーク同期プロバイダー
 * Chromeの標準ブックマーク同期をデータ転送層として利用する
 */
export const BookmarkSync = {
    ROOT_FOLDER_NAME: '[WC] Web Collections',
    METADATA_PREFIX: '[WC]',

    /**
     * ルートフォルダ（Other Bookmarks 直下）を取得または作成
     */
    async ensureRootFolder() {
        const tree = await chrome.bookmarks.getTree();
        const otherBookmarks = tree[0].children.find(c => c.id === '2'); // '2' is usually "Other Bookmarks"
        
        let root = otherBookmarks.children.find(c => c.title === this.ROOT_FOLDER_NAME);
        if (!root) {
            root = await chrome.bookmarks.create({
                parentId: otherBookmarks.id,
                title: this.ROOT_FOLDER_NAME
            });
        }
        return root;
    },

    /**
     * メタデータをタイトルに埋め込む
     * 形式: [WC]{"id":"...","u":123,"m":"..."}元のタイトル
     */
    encodeMetadata(item, title) {
        const meta = {
            id: item.id,
            u: item.updatedAt || Date.now(),
            m: item.memo || ''
        };
        return `${this.METADATA_PREFIX}${JSON.stringify(meta)}${title}`;
    },

    /**
     * タイトルからメタデータを抽出
     */
    decodeMetadata(bookmark) {
        if (!bookmark.title.startsWith(this.METADATA_PREFIX)) return null;
        
        try {
            const endIdx = bookmark.title.indexOf('}', this.METADATA_PREFIX.length);
            if (endIdx === -1) return null;
            
            const jsonStr = bookmark.title.substring(this.METADATA_PREFIX.length, endIdx + 1);
            const meta = JSON.parse(jsonStr);
            const originalTitle = bookmark.title.substring(endIdx + 1);
            
            return {
                id: meta.id,
                updatedAt: meta.u,
                memo: meta.m,
                title: originalTitle
            };
        } catch (e) {
            console.warn('Failed to decode bookmark metadata:', bookmark.title);
            return null;
        }
    },

    /**
     * ローカルデータをブックマークへ反映 (Push)
     */
    async push(storage) {
        console.log('BookmarkSync: Pushing to bookmarks...');
        const root = await this.ensureRootFolder();
        const collections = await storage.getAllCollections(true);

        // 1. ブックマーク側の現在の構造を取得
        const rootTree = (await chrome.bookmarks.getSubTree(root.id))[0];
        const remoteFolders = rootTree.children.filter(c => !c.url);

        for (const col of collections) {
            // コレクションフォルダの作成または更新
            let colFolder = remoteFolders.find(f => {
                const meta = this.decodeMetadata(f);
                return meta && meta.id === col.id;
            });

            const colTitle = this.encodeMetadata(col, col.name);

            if (!colFolder) {
                colFolder = await chrome.bookmarks.create({
                    parentId: root.id,
                    title: colTitle
                });
            } else if (colFolder.title !== colTitle) {
                await chrome.bookmarks.update(colFolder.id, { title: colTitle });
            }

            // アイテムの同期
            const items = await storage.getItemsByCollection(col.id, true);
            const remoteItems = colFolder.children || [];

            for (const item of items) {
                let remoteItem = remoteItems.find(r => {
                    const meta = this.decodeMetadata(r);
                    return meta && meta.id === item.id;
                });

                const itemTitle = this.encodeMetadata(item, item.title);

                if (!remoteItem) {
                    await chrome.bookmarks.create({
                        parentId: colFolder.id,
                        title: itemTitle,
                        url: item.url || 'about:blank'
                    });
                } else {
                    const remoteMeta = this.decodeMetadata(remoteItem);
                    if (item.updatedAt > remoteMeta.updatedAt) {
                        await chrome.bookmarks.update(remoteItem.id, {
                            title: itemTitle,
                            url: item.url || 'about:blank'
                        });
                    }
                }
            }
        }
        console.log('BookmarkSync: Push completed.');
    },

    /**
     * ブックマークからローカルデータをマージ (Pull)
     */
    async pull(storage) {
        console.log('BookmarkSync: Pulling from bookmarks...');
        const root = await this.ensureRootFolder();
        const rootTree = (await chrome.bookmarks.getSubTree(root.id))[0];
        let anyUpdated = false;

        for (const colFolder of (rootTree.children || [])) {
            if (colFolder.url) continue; // フォルダのみ処理

            const colMeta = this.decodeMetadata(colFolder);
            if (!colMeta) continue;

            const localCol = await storage.getCollection(colMeta.id);
            if (!localCol || colMeta.updatedAt > (localCol.updatedAt || 0)) {
                console.log(`BookmarkSync: Merging collection ${colMeta.title}`);
                
                // コレクションを保存
                await storage.importCollectionData({
                    id: colMeta.id,
                    name: colMeta.title,
                    updatedAt: colMeta.updatedAt,
                    isDeleted: false, // ブックマークにある＝存在する
                    items: [] // 下で追加
                });

                const mergedItems = [];
                for (const bItem of (colFolder.children || [])) {
                    const itemMeta = this.decodeMetadata(bItem);
                    if (!itemMeta) continue;

                    mergedItems.push({
                        id: itemMeta.id,
                        title: itemMeta.title,
                        url: bItem.url,
                        updatedAt: itemMeta.updatedAt,
                        memo: itemMeta.memo,
                        isDeleted: false
                    });
                }

                await storage.importCollectionData({
                    id: colMeta.id,
                    name: colMeta.title,
                    updatedAt: colMeta.updatedAt,
                    items: mergedItems
                });
                anyUpdated = true;
            }
        }
        return { success: true, updated: anyUpdated };
    }
};
