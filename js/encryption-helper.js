// js/encryption-helper.js
/**
 * 注：本モジュールで提供される暗号化は、Google Drive上の暗号化データを第三者による高度な解読から保護する完全なセキュリティを提供するものではなく、簡易的なデータ難読化を目的としています。本番環境で本格的なセキュリティが必要な場合は、ユーザーによる固有パスフレーズ設定などの実装を検討してください。
 */

const ENCRYPTION_KEY_RAW = 'web-collections-extension-default-key-2026';
let cachedKey = null;

/**
 * 固定パスフレーズからSHA256ハッシュを経由してAES鍵を取得します
 */
async function getEncryptionKey() {
    if (cachedKey) {
        return cachedKey;
    }
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(ENCRYPTION_KEY_RAW);
    const hash = await crypto.subtle.digest('SHA-256', keyData);
    
    cachedKey = await crypto.subtle.importKey(
        'raw',
        hash,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
    return cachedKey;
}

/**
 * 符号なしバイト配列をBase64文字列に変換します
 */
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Base64文字列を符号なしバイト配列に変換します
 */
function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * 文字列をAES-GCMで暗号化してBase64形式で取得します
 */
export async function encrypt(text) {
    try {
        const key = await getEncryptionKey();
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            data
        );
        
        const encryptedBytes = new Uint8Array(encrypted);
        const combined = new Uint8Array(iv.length + encryptedBytes.length);
        combined.set(iv, 0);
        combined.set(encryptedBytes, iv.length);
        
        return arrayBufferToBase64(combined);
    } catch (e) {
        console.error('Encryption failed:', e);
        throw e;
    }
}

/**
 * Base64形式のAES-GCM暗号文を復号して元の文字列に戻します
 */
export async function decrypt(base64Str) {
    try {
        const key = await getEncryptionKey();
        const combined = base64ToArrayBuffer(base64Str);
        
        if (combined.length < 12) {
            throw new Error('Invalid encrypted data length');
        }
        
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);
        
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            ciphertext
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (e) {
        console.error('Decryption failed:', e);
        throw e;
    }
}
