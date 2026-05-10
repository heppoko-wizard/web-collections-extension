// js/panel-state.js

/**
 * panel-state.js - アプリケーションのグローバル状態管理
 */

export const state = {
    collections: [],
    currentCollectionId: null,
    currentItems: [],
    currentView: 'list', // 'list' | 'detail' | 'settings'
    layoutMode: 'list', // 'list' | 'grid'
    settings: {},
    folderSyncEnabled: false
};

const listeners = [];

/**
 * 状態変更を監視するリスナーを登録
 * @param {Function} fn - 状態変更時に呼ばれる関数
 * @returns {Function} 解除用関数
 */
export function subscribe(fn) {
    listeners.push(fn);
    return () => {
        const index = listeners.indexOf(fn);
        if (index > -1) listeners.splice(index, 1);
    };
}

/**
 * 状態変更を通知
 */
export function notify() {
    listeners.forEach(fn => fn(state));
}

/**
 * 状態の一部を更新し通知
 * @param {object} updates 
 */
export function updateState(updates) {
    Object.assign(state, updates);
    notify();
}
