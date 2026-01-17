# Web Collections (Edge Collections Alternative)

A cross-browser extension that replicates Microsoft Edge's "Collections" feature, bringing it to Chrome, Brave, Vivaldi, and other Chromium browsers.
It features a unique hybrid sync system that gives you full ownership of your data, free from vendor lock-in.

![Icon](icons/icon128.png)

---

**[日本語の説明はこちら (Japanese)](#-web-collections-日本語)**

---

## ✨ Why Web Collections?

### 1. Future-Proff Your Data

Edge Collections is a great feature, but relying on a single browser vendor carries risks. Features can be deprecated or changed at any time.
**Web Collections** ensures your data belongs to you. Even if Edge removes the feature tomorrow, your collections remain safe and accessible in any Chromium browser.

### 2. Freedom from Vendor Lock-in

Why limit your productivity to just Edge? Use your collections in Chrome, Brave, or Vivaldi. This extension provides a unified experience across all your favorite browsers.

### 3. Unique Hybrid Sync System

We prioritize privacy and flexibility. You choose how your data lives:

- **GitHub Gist Sync (Implemented)**:
  - Perfect for developers. Uses GitHub Gist (Secret) as your personal database.
  - Serverless, free, and secure. Images are automatically optimized (WebP/320px) and stored as Base64.
  - No subscription fees, no storage limits (within Gist/GitHub reasonable use).

- **Local Folder / Cloud Drive Sync (Planned for v1.1)**:
  - Sync via your own file system (OneDrive, Google Drive, Dropbox, etc.).
  - The extension writes to a local JSON file, and your cloud drive app handles the sync.
  - **Zero data leaves your trusted environment.**

### 4. Powerful Migration Tool

Includes a Python script (`scripts/migrate_collections.py`) to extract your existing data from Edge.

- **Works on Windows, Linux, and macOS**: As long as you can locate the `collectionsSQLite` file path, you can migrate everything.
- **Image Extraction**: Automatically extracts and optimizes cached images from Edge's internal database.

## 🚀 Features

- **Save Pages**: One-click to save the current tab.
- **Save Images**: Right-click on any image to add it directly.
- **Notes**: Add sticky notes or selected text for context.
- **Smart Optimization**: Images are resized and compressed to keep sync fast and light.

## 📦 Installation & Setup

### 1. Installation

1. Clone or download this repository.
2. Open `chrome://extensions/` in your browser.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the extension directory.

### 2. Setting up Gist Sync

1. Open the side panel and click the Settings icon (⚙️).
2. Generate a GitHub Personal Access Token with `gist` scope [here](https://github.com/settings/tokens/new?scopes=gist&description=Web%20Collections%20Sync).
3. Paste the token in the settings and click "Save".
4. Run "Connection Test" & "Sync Now".

---

## 🇯🇵 Web Collections (日本語)

Microsoft Edgeの便利な「コレクション」機能を、Chromeやその他のChromiumブラウザでも使えるようにする拡張機能です。
特定のブラウザに依存せず、自分のデータを自分で管理するためのツールです。

### 🌟 なぜこの拡張機能が必要なのか？

1. **機能削除リスクへの備え**: ブラウザの機能は突然変更・削除されることがあります。この拡張機能を使えば、Microsoftの都合に左右されず、大切なコレクションを永続的に保持できます。
2. **ブラウザの自由**: Edge以外のブラウザでもコレクション機能が使えます。
3. **プライバシー重視の同期**: 企業のサーバーにデータを預けるのではなく、自分のGitHub Gistやローカルフォルダ（OneDrive/GoogleDrive等）を使って同期できます。

### 🔄 Edgeからの移行（エクスポート）

付属の `scripts/migrate_collections.py` を使えば、現在Edgeにあるコレクションをすべて移行できます。

- WindowsのEdgeデータパス（`collectionsSQLite`）さえわかれば、画像も含めて完全に抽出可能です。
- **Windowsパスの例**: `C:\Users\<User>\AppData\Local\Microsoft\Edge\User Data\Default\Collections\collectionsSQLite`

### 🗺️ ロードマップ

- **v1.0.0 (Current)**: Gist同期、画像最適化、Edge移行ツール
- **v1.1.0 (Next)**: ローカルフォルダ同期 (File System Access API) - 自動クラウド同期用
- **v1.2.0**: 全文検索、タグ付け

## License

MIT
