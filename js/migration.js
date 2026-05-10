// js/migration.js
import { generateUUID } from './crypto-utils.js';

/**
 * 既存のデータをUUID v4へマイグレーションする
 * @param {Array} items - コレクションまたはアイテムの配列
 * @returns {Array} UUIDが付与/更新された新しい配列
 */
export function migrateDataToUUIDs(items) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return items.map(item => {
        // すでにUUID形式であればそのまま、そうでなければ新しく生成
        if (!item.id || !uuidRegex.test(item.id)) {
            return { ...item, id: generateUUID() };
        }
        return item;
    });
}

/**
 * 既存のアイテムからBase64画像データを削除する
 * @param {Array} items - アイテムの配列
 * @returns {Array} 画像データが削除された新しい配列
 */
export function purgeBase64Images(items) {
    return items.map(item => {
        if (item.imageUrl && item.imageUrl.startsWith('data:image/')) {
            return { ...item, imageUrl: null, updatedAt: Date.now() };
        }
        return item;
    });
}
