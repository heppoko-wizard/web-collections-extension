/**
 * i18n-helper.js - Chrome Extension i18n utility
 */

/**
 * 翻訳テキストを取得する
 * @param {string} key 
 * @param {string|string[]} substitutions 
 * @returns {string}
 */
export function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
}

/**
 * DOM内の data-i18n 属性を持つ要素を翻訳する
 * @param {HTMLElement} container 
 */
export function applyI18n(container = document) {
    // Text content
    container.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const message = t(key);
        if (message && message !== key) {
            el.textContent = message;
        }
    });

    // Placeholders
    container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const message = t(key);
        if (message && message !== key) {
            el.placeholder = message;
        }
    });

    // Titles (tooltips)
    container.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const message = t(key);
        if (message && message !== key) {
            el.title = message;
        }
    });

    // Aria labels
    container.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        const message = t(key);
        if (message && message !== key) {
            el.setAttribute('aria-label', message);
        }
    });
}
