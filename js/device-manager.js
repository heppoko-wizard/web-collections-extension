// js/device-manager.js
import { generateUUID } from './crypto-utils.js';

/**
 * DeviceManager - デバイスIDとデバイス名の管理
 */
export const DeviceManager = {
    STORAGE_KEY: 'sync_device_info',

    /**
     * 現在のデバイス情報を取得（存在しなければ新規生成）
     */
    async getDeviceInfo() {
        const info = await chrome.storage.local.get(this.STORAGE_KEY);
        if (info[this.STORAGE_KEY]) {
            return info[this.STORAGE_KEY];
        }

        // 新規デバイス情報の初期化
        const newInfo = {
            deviceId: generateUUID(),
            deviceName: this.getDefaultDeviceName(),
            createdAt: Date.now()
        };
        await chrome.storage.local.set({ [this.STORAGE_KEY]: newInfo });
        return newInfo;
    },

    /**
     * UAからデフォルトのデバイス名を推測
     */
    getDefaultDeviceName() {
        const ua = navigator.userAgent;
        if (ua.includes('Edg/')) return 'Edge Browser';
        if (ua.includes('Chrome/')) return 'Chrome Browser';
        if (ua.includes('Brave/')) return 'Brave Browser';
        return 'Web Device';
    },

    /**
     * デバイス名を更新
     */
    async updateDeviceName(newName) {
        const info = await this.getDeviceInfo();
        info.deviceName = newName.trim() || this.getDefaultDeviceName();
        await chrome.storage.local.set({ [this.STORAGE_KEY]: info });
        return info;
    }
};
