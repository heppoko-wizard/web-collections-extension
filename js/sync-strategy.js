// js/sync-strategy.js

/**
 * 2つのアイテム（またはコレクション）をマージする
 * Last Write Wins (LWW) 戦略を採用し、updatedAt が新しい方を優先する
 * @param {object|null} local
 * @param {object|null} remote
 * @returns {object|null} マージされたオブジェクト
 */
export function mergeItem(local, remote) {
    if (!local) return remote;
    if (!remote) return local;

    const localTime = local.updatedAt || 0;
    const remoteTime = remote.updatedAt || 0;

    // updatedAt が新しい方を採用（フィールド単位ではなくオブジェクト単位での LWW）
    if (remoteTime > localTime) {
        return { ...local, ...remote };
    } else {
        return { ...remote, ...local };
    }
}
