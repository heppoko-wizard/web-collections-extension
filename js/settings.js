/**
 * Settings Page Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
    const tokenInput = document.getElementById('github-token');
    const saveTokenBtn = document.getElementById('save-token-btn');
    const testTokenBtn = document.getElementById('test-token-btn');
    const tokenStatus = document.getElementById('token-status');
    const gistIdDisplay = document.getElementById('gist-id-display');
    const lastSyncDisplay = document.getElementById('last-sync-display');

    // Show status message
    function showStatus(message, type = 'info') {
        tokenStatus.textContent = message;
        tokenStatus.className = `status ${type}`;
        tokenStatus.style.display = 'block';

        setTimeout(() => {
            tokenStatus.style.display = 'none';
        }, 5000);
    }

    // Load existing token (masked)
    async function loadToken() {
        const token = await GistSync.getToken();
        if (token) {
            tokenInput.value = '●'.repeat(20); // Masked display
            tokenInput.dataset.hasToken = 'true';
        }
    }

    // Load sync info
    async function loadSyncInfo() {
        const gistId = await GistSync.getGistId();
        if (gistId) {
            gistIdDisplay.textContent = gistId;
        }

        const result = await chrome.storage.local.get('last_sync_time');
        if (result.last_sync_time) {
            const date = new Date(result.last_sync_time);
            lastSyncDisplay.textContent = date.toLocaleString('ja-JP');
        }
    }

    // Save token
    saveTokenBtn.addEventListener('click', async () => {
        const token = tokenInput.value.trim();

        if (!token || token === '●'.repeat(20)) {
            showStatus('トークンを入力してください', 'error');
            return;
        }

        try {
            await GistSync.saveToken(token);
            showStatus('トークンを保存しました', 'success');
            tokenInput.value = '●'.repeat(20);
            tokenInput.dataset.hasToken = 'true';
        } catch (error) {
            showStatus('保存に失敗しました: ' + error.message, 'error');
        }
    });

    // Test token
    testTokenBtn.addEventListener('click', async () => {
        let token = tokenInput.value.trim();

        // If showing masked token, get real token from storage
        if (token === '●'.repeat(20)) {
            token = await GistSync.getToken();
        }

        if (!token) {
            showStatus('トークンを入力してください', 'error');
            return;
        }

        showStatus('接続テスト中...', 'info');

        try {
            const isValid = await GistSync.validateToken(token);
            if (isValid) {
                showStatus('✓ 接続成功！トークンは有効です', 'success');
            } else {
                showStatus('✗ 接続失敗。トークンが無効です', 'error');
            }
        } catch (error) {
            showStatus('✗ 接続エラー: ' + error.message, 'error');
        }
    });

    // Clear masked token on focus
    tokenInput.addEventListener('focus', () => {
        if (tokenInput.dataset.hasToken === 'true') {
            tokenInput.value = '';
            tokenInput.dataset.hasToken = 'false';
        }
    });

    // Initialize
    await loadToken();
    await loadSyncInfo();
});
