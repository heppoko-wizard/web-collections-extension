/**
 * crypto-utils.js - AES-GCM暗号化・復号化ユーティリティ
 * クライアントサイドでデータを暗号化し、クラウドに安全に保存するためのモジュール
 */

const CryptoUtils = {
    /**
     * 固定キーを導出 (chrome.runtime.id ベース)
     * @returns {Promise<CryptoKey>} 導出されたAES-GCMキー
     */
    async deriveFixedKey() {
        const encoder = new TextEncoder();
        // 開発者モード(Unpacked)ではデバイスごとに chrome.runtime.id が異なるため、
        // デバイス間で一貫して復号できるよう固定のシード文字列を使用します。
        // （目的：クラウドドライブのクローラー回避）
        const FIXED_SEED = 'web-collections-sync-fixed-key-for-anti-crawler';
        const hash = await crypto.subtle.digest('SHA-256', encoder.encode(FIXED_SEED));
        return crypto.subtle.importKey(
            'raw',
            hash,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    },

    /**
     * データを暗号化
     * @param {string} data - 暗号化するJSON文字列
     * @returns {Promise<{encrypted: string, iv: string}>} Base64エンコードされた暗号化データ
     */
    async encrypt(data) {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveFixedKey();

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoder.encode(data)
        );

        return {
            encrypted: this.arrayBufferToBase64(encrypted),
            iv: this.arrayBufferToBase64(iv)
        };
    },

    /**
     * データを復号化
     * @param {string} encryptedBase64 - Base64エンコードされた暗号化データ
     * @param {string} ivBase64 - Base64エンコードされたIV
     * @returns {Promise<string>} 復号化されたJSON文字列
     */
    async decrypt(encryptedBase64, ivBase64) {
        const decoder = new TextDecoder();
        const iv = this.base64ToArrayBuffer(ivBase64);
        const encrypted = this.base64ToArrayBuffer(encryptedBase64);
        const key = await this.deriveFixedKey();

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv) },
            key,
            encrypted
        );

        return decoder.decode(decrypted);
    },

    /**
     * ArrayBufferをBase64文字列に変換
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    /**
     * Base64文字列をArrayBufferに変換
     */
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
};

// ES Modules用エクスポート (Service Workerで使用)
if (typeof globalThis !== 'undefined') {
    globalThis.CryptoUtils = CryptoUtils;
}
