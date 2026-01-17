# Edge Collections代替拡張機能 実装計画

## 1. 同期戦略: "Encrypted Drive Sync"

ユーザーの要望（簡単・自動・無料・暗号化）を満たすため、以下のアーキテクチャを採用します。

### アーキテクチャ概要

1. **ストレージ**: Google Drive (App Data folder または 指定ファイル)
2. **認証**: `chrome.identity` API を使用 (OAuth 2.0)
3. **暗号化**: 転送前にクライアントサイド（ブラウザ内）で `AES-GCM` 暗号化を実行。Google Drive上には暗号化されたデータのみが保存され、Google側も中身を見れません。
4. **APIキー**: 「完全無料・自立型」にするため、ユーザー自身のGoogle Cloudプロジェクト（無料枠）のClient IDを使用する方式とします。
    * *理由*: 開発者がAPIキーを提供すると、ユーザー数が増えた瞬間に無料枠を超え、課金が発生するため。ユーザー自身が取得すれば永久に無料です。

## 2. 実装コンポーネント構成

### Manifest V3 構成

- **Permissions**: `identity`, `storage`, `unlimitedStorage`, `contextMenus`, `sidePanel`
* **Host Permissions**: `https://www.googleapis.com/*`, `<all_urls>` (コンテンツ取得用)
* **Background Service Worker**: 同期ロジック、コンテキストメニュー制御
* **Side Panel**: メインUI（コレクション表示・操作）

### ディレクトリ構造

```
~/ドキュメント/DEV/web-collections-extension/
├── manifest.json          # 設定ファイル
├── _locales/              # 多言語対応（日本語）
├── icons/                 # アイコン
├── css/
│   ├── style.css          # ベーススタイル
│   └── panel.css          # パネル用スタイル
├── lib/
│   ├── crypto-utils.js    # 暗号化・復号化ライブラリ
│   └── drive-sync.js      # Google Drive API連携ライブラリ
├── js/
│   ├── background.js      # バックグラウンド処理
│   ├── panel.js           # パネルUIロジック
│   └── content.js         # ページ内コンテンツ抽出
└── html/
    └── sidepanel.html     # サイドパネルHTML
```

## 3. 暗号化仕様 (Security)

> [!IMPORTANT]
> **復号化機能を埋め込む** という要望通り、拡張機能内に完結させます。

* **アルゴリズム**: AES-GCM (256-bit)
* **鍵生成**: ユーザーが設定する「同期パスワード」から PBKDF2 で鍵を導出
* **保存**: 暗号化されたJSONデータ (`collections.enc`) をアップロード
* **フロー**:
    1. 保存時: JSON → 文字列化 → 圧縮(gzip) → **暗号化** → Google Driveへアップロード
    2. 読込時: ダウンロード → **復号化** → 解凍 → JSONパース → UI表示

## 4. 開発ステップ

### Step 1: 基盤構築 (Core Foundation)

- [ ] manifest.json の作成
* [ ] サイドパネルのHello World表示
* [ ] アイコン生成

### Step 2: ローカルデータ管理 (Local CRUD)

- [ ] `chrome.storage.local` をラップしたデータアクセスクラス
* [ ] コレクションの作成・読み取り・更新・削除

### Step 3: コンテンツ収集 (Capture)

- [ ] コンテキストメニュー実装（右クリック→追加）
* [ ] メッセージパッシングによるページ情報（URL, Title, Selection）取得
* [ ] 画像リンク検出ロジックの実装（`<a>`タグ内の`<img>`判定）

### Step 4: UI実装 (User Interface)

- [ ] Edge Collectionsライクなカード型レイアウト
* [ ] ドラッグ＆ドロップ実装

### Step 5: 暗号化同期 (Encrypted Sync)

- [ ] 暗号化ユーティリティ (`crypto-utils.js`) 実装
* [ ] Google Drive API 連携 (`drive-sync.js`) 実装
* [ ] 設定画面（Client ID入力、パスワード設定）

## 5. ユーザーへの依頼事項（API設定）

実装完了後、ユーザーに以下の「1回だけの作業」を行ってもらう必要があります：

1. Google Cloud Consoleでプロジェクト作成
2. 「Google Drive API」を有効化
3. 「OAuth Client ID」を作成し、IDをコピーして拡張機能に入力

これが「最も安全で無料」な方法です。
