# Web Collections (Edge Collections Alternative)

A cross-browser extension that replicates Microsoft Edge's "Collections" feature, bringing it to Chrome, Brave, Vivaldi, and other Chromium browsers.
It features a unique hybrid sync system that gives you full ownership of your data, free from vendor lock-in.

![Icon](icons/icon128.png)

---

**[日本語版はこちら (Japanese Version)](#-web-collections-edge-collections-alternative)**

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

## 🇯🇵 Web Collections (Edge Collections Alternative)

Microsoft Edgeの便利な「コレクション」機能を、ChromeやBrave、Vivaldiなどの他のChromiumブラウザでも使えるようにするクロスブラウザ拡張機能です。
特定のブラウザベンダーに依存せず（Vendor Lock-inなし）、ユーザー自身がデータを完全に所有できる独自のハイブリッド同期システムを特徴としています。

## ✨ なぜ Web Collections なのか？

### 1. データの未来を守る (Future-Proof Your Data)

Edge Collectionsは素晴らしい機能ですが、単一のブラウザベンダーに依存することにはリスクが伴います。企業の都合で機能が突然削除されたり、仕様が変更されたりする可能性があるからです。
**Web Collections** は、「データはユーザー自身のもの」という思想で作られています。もし明日Edgeがコレクション機能を廃止したとしても、あなたのデータはこの拡張機能を入れたあらゆるChromiumブラウザで安全に使い続けることができます。

### 2. ベンダーロックインからの解放

生産性をEdgeだけのものにする必要はありません。Chrome、Brave、Vivaldiなど、あなたの好きなブラウザでコレクション機能を使いましょう。この拡張機能は、ブラウザ間を横断して統一された体験を提供します。

### 3. 独自のハイブリッド同期システム

プライバシーと柔軟性を最優先し、データの保存場所をユーザー自身が選べます：

- **GitHub Gist 同期 (実装済み)**:
  - 開発者に最適です。GitHub Gist (Secret) をあなた個人のデータベースとして利用します。
  - サーバーレス、無料、そしてセキュアです。画像は自動的に軽量化（WebP/320px）され、Base64形式で保存されます。
  - サブスクリプション料金も、ストレージ容量制限も（Gistの常識的な範囲内で）ありません。

- **ローカルフォルダ / クラウドドライブ同期 (v1.1 実装予定)**:
  - あなたのPCのファイルシステム経由で同期します（OneDrive, Google Drive, Dropboxなど）。
  - 拡張機能はローカルのJSONファイルを書き込み、クラウド同期は専用アプリに任せる仕組みです。
  - **信頼できる環境からデータが外に出ることは一切ありません。**

### 4. 強力な移行ツール

Edgeの既存データを抽出するためのPythonスクリプト（`scripts/migrate_collections.py`）を同梱しています。

- **Windows, Linux, macOS 対応**: `collectionsSQLite` というファイルパスさえ特定できれば、どこからでもデータを移行できます。
- **画像抽出**: Edgeの内部データベースにキャッシュされた画像を自動的に抽出し、最適化して取り込みます。

## 🚀 機能

- **ページの保存**: 現在開いているタブをワンクリックで保存。
- **画像の保存**: 画像を右クリックして、直接コレクションに追加。
- **メモ機能**: 付箋のようなメモや、選択したテキストをコンテキストとして追加。
- **スマート最適化**: 同期を高速・軽量に保つため、画像は自動的にリサイズ・圧縮されます。

## 📦 インストールと設定

### 1. インストール

1. このリポジトリをクローンまたはダウンロードします。
2. ブラウザで `chrome://extensions/` を開きます。
3. 右上の「デベロッパーモード」をオンにします。
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、拡張機能のフォルダを選択します。

### 2. Gist同期のセットアップ

1. サイドパネルを開き、設定アイコン (⚙️) をクリックします。
2. [GitHubの設定ページ](https://github.com/settings/tokens/new?scopes=gist&description=Web%20Collections%20Sync) から、`gist` スコープを持った Personal Access Token を発行します。
3. トークンを設定画面に貼り付け、「保存」をクリックします。
4. 「接続テスト」を実行し、問題なければ「今すぐ同期」をクリックしてください。

## License

MIT
