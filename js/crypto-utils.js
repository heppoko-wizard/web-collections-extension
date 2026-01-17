/**
 * crypto-utils.js - AES-GCM暗号化・復号化ユーティリティ
 * クライアントサイドでデータを暗号化し、クラウドに安全に保存するためのモジュール
 */

const CryptoUtils = {
    /**
     * パスワードから暗号化キーを導出 (PBKDF2)
     * @param {string} password - ユーザーが設定したパスワード
     * @param {Uint8Array} salt - ソルト (ランダム生成または保存済み)
     * @returns {Promise<CryptoKey>} 導出されたAES-GCMキー
     */
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    /**
     * データを暗号化
     * @param {string} data - 暗号化するJSON文字列
     * @param {string} password - パスワード
     * @returns {Promise<{encrypted: string, salt: string, iv: string}>} Base64エンコードされた暗号化データ
     */
    async encrypt(data, password) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoder.encode(data)
        );

        return {
            encrypted: this.arrayBufferToBase64(encrypted),
            salt: this.arrayBufferToBase64(salt),
            iv: this.arrayBufferToBase64(iv)
        };
    },

    /**
     * データを復号化
     * @param {string} encryptedBase64 - Base64エンコードされた暗号化データ
     * @param {string} saltBase64 - Base64エンコードされたソルト
     * @param {string} ivBase64 - Base64エンコードされたIV
     * @param {string} password - パスワード
     * @returns {Promise<string>} 復号化されたJSON文字列
     */
    async decrypt(encryptedBase64, saltBase64, ivBase64, password) {
        const decoder = new TextDecoder();
        const salt = this.base64ToArrayBuffer(saltBase64);
        const iv = this.base64ToArrayBuffer(ivBase64);
        const encrypted = this.base64ToArrayBuffer(encryptedBase64);
        const key = await this.deriveKey(password, new Uint8Array(salt));

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
