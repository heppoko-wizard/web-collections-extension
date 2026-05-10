// js/device-manager.js
import { generateUUID } from './crypto-utils.js';

/**
 * DeviceManager - デバイスIDとデバイス名の管理
 */
export const DeviceManager = {
    STORAGE_KEY: 'sync_device_info',

    /**
     * プラットフォーム情報からデバイス名を自動生成
     */
    async getDefaultDeviceName() {
        return new Promise((resolve) => {
            chrome.runtime.getPlatformInfo((info) => {
                const os = info.os.charAt(0).toUpperCase() + info.os.slice(1);
                const ua = navigator.userAgent;
                let browser = 'Browser';
                if (ua.includes('Edg/')) browser = 'Edge';
                else if (ua.includes('Chrome/')) browser = 'Chrome';
                else if (ua.includes('Brave/')) browser = 'Brave';
                
                resolve(`${os} ${browser}`);
            });
        });
    },

    /**
     * 現在のデバイス情報を取得（存在しなければ新規生成）
     */
    async getDeviceInfo() {
        const info = await chrome.storage.local.get(this.STORAGE_KEY);
        if (info[this.STORAGE_KEY]) {
            return info[this.STORAGE_KEY];
        }

        // 新規デバイス情報の初期化
        const deviceName = await this.getDefaultDeviceName();
        const newInfo = {
            deviceId: generateUUID(),
            deviceName: deviceName,
            createdAt: Date.now()
        };
        await chrome.storage.local.set({ [this.STORAGE_KEY]: newInfo });
        return newInfo;
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
