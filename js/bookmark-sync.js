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
    async ensureRootFolder(storage) {
        let settings = {};
        if (storage && typeof storage.getSettings === 'function') {
            settings = await storage.getSettings();
        }
        
        let rootFolderId = settings.bookmarkRootId || null;
        
        if (rootFolderId) {
            try {
                const results = await chrome.bookmarks.get(rootFolderId);
                if (results && results[0]) {
                    return results[0];
                }
            } catch (e) {
                console.warn('Specified root folder not found, falling back to default', rootFolderId);
            }
        }

        let parentFolder = null;
        try {
            const results = await chrome.bookmarks.get('2');
            parentFolder = results[0];
        } catch (e) {
            try {
                const results = await chrome.bookmarks.get('1');
                parentFolder = results[0];
            } catch (err) {
                throw new Error('Failed to find system bookmark folder');
            }
        }

        const tree = await chrome.bookmarks.getSubTree(parentFolder.id);
        const parentNode = tree[0];
        let root = (parentNode.children || []).find(c => c.title === this.ROOT_FOLDER_NAME);
        
        if (!root) {
            root = await chrome.bookmarks.create({
                parentId: parentFolder.id,
                title: this.ROOT_FOLDER_NAME
            });
        }

        if (storage && typeof storage.saveSettings === 'function' && root.id !== rootFolderId && !rootFolderId) {
            settings.bookmarkRootId = root.id;
            await storage.saveSettings(settings);
        }

        return root;
    },

    /**
     * メタデータをタイトルに埋め込む
     */
    encodeMetadata(item, title) {
        const meta = {
            id: item.id,
            t: item.type || 'webpage',
            u: item.updatedAt || item.savedAt || Date.now(),
            m: item.memo || '',
            f: item.faviconUrl || '',
            i: item.imageUrl || '',
            c: item.content || '',
            sU: item.sourceUrl || '',
            sT: item.sourceTitle || ''
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
                type: meta.t || 'webpage',
                updatedAt: meta.u,
                memo: meta.m || '',
                title: originalTitle,
                faviconUrl: meta.f || '',
                imageUrl: meta.i || '',
                content: meta.c || '',
                sourceUrl: meta.sU || '',
                sourceTitle: meta.sT || ''
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
        const root = await this.ensureRootFolder(storage);
        const collections = await storage.getAllCollections(true);

        // 1. ブックマーク側の現在の構造を取得
        const rootTree = (await chrome.bookmarks.getSubTree(root.id))[0];
        const remoteFolders = (rootTree.children || []).filter(c => !c.url);

        for (const col of collections) {
            const colFolder = remoteFolders.find(f => {
                const meta = this.decodeMetadata(f);
                return meta && meta.id === col.id;
            });

            if (col.isDeleted) {
                // ローカルで削除されている場合、ブックマーク側も削除
                if (colFolder) {
                    await chrome.bookmarks.removeTree(colFolder.id);
                }
                continue;
            }

            const items = await storage.getItemsByCollection(col.id);
            const remoteItems = colFolder ? (colFolder.children || []) : [];

            let targetFolder = colFolder;
            const colTitle = this.encodeMetadata(col, col.name);

            if (!targetFolder) {
                targetFolder = await chrome.bookmarks.create({
                    parentId: root.id,
                    title: colTitle
                });
            } else if (targetFolder.title !== colTitle) {
                await chrome.bookmarks.update(targetFolder.id, { title: colTitle });
            }

            // 先に削除対象を処理
            for (const item of items) {
                if (item.isDeleted) {
                    const remoteItem = remoteItems.find(r => {
                        const meta = this.decodeMetadata(r);
                        return meta && meta.id === item.id;
                    });
                    if (remoteItem) {
                        await chrome.bookmarks.remove(remoteItem.id);
                    }
                }
            }

            // 次に有効なアイテムの同期と順序調整
            let activeIdx = 0;
            for (const item of items) {
                if (item.isDeleted) continue;

                const remoteItem = remoteItems.find(r => {
                    const meta = this.decodeMetadata(r);
                    return meta && meta.id === item.id;
                });

                const itemTitle = this.encodeMetadata(item, item.title);

                if (!remoteItem) {
                    await chrome.bookmarks.create({
                        parentId: targetFolder.id,
                        title: itemTitle,
                        url: item.url || 'about:blank',
                        index: activeIdx
                    });
                } else {
                    const remoteMeta = this.decodeMetadata(remoteItem);
                    if (item.updatedAt > remoteMeta.updatedAt) {
                        await chrome.bookmarks.update(remoteItem.id, {
                            title: itemTitle,
                            url: item.url || 'about:blank'
                        });
                    }
                    if (remoteItem.index !== activeIdx) {
                        await chrome.bookmarks.move(remoteItem.id, {
                            parentId: targetFolder.id,
                            index: activeIdx
                        });
                    }
                }
                activeIdx++;
            }
        }
        console.log('BookmarkSync: Push completed.');
        return { success: true };
    },

    /**
     * ブックマークからローカルデータをマージ (Pull)
     */
    async pull(storage) {
        console.log('BookmarkSync: Pulling from bookmarks...');
        const root = await this.ensureRootFolder(storage);
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
                let idx = 0;
                for (const bItem of (colFolder.children || [])) {
                    const itemMeta = this.decodeMetadata(bItem);
                    if (!itemMeta) continue;

                    mergedItems.push({
                        id: itemMeta.id,
                        title: itemMeta.title,
                        url: bItem.url || '',
                        type: itemMeta.type,
                        updatedAt: itemMeta.updatedAt,
                        memo: itemMeta.memo,
                        faviconUrl: itemMeta.faviconUrl,
                        imageUrl: itemMeta.imageUrl,
                        content: itemMeta.content,
                        sourceUrl: itemMeta.sourceUrl,
                        sourceTitle: itemMeta.sourceTitle,
                        sortOrder: idx,
                        isDeleted: false
                    });
                    idx++;
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
