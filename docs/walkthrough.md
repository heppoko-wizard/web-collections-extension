# Walkthrough: Web Collections 拡張機能

## 概要

Microsoft Edge Collections の廃止に対応するため、同等機能を持つブラウザ拡張機能を実装しました。

## 作成したファイル一覧

| ファイル | 説明 |
|----------|------|
| [manifest.json](file:///home/heppo/ドキュメント/DEV/web-collections-extension/manifest.json) | Manifest V3 設定、OAuth2、権限定義 |
| [js/background.js](file:///home/heppo/ドキュメント/DEV/web-collections-extension/js/background.js) | Service Worker、コンテキストメニュー、メッセージ処理 |
| [js/panel.js](file:///home/heppo/ドキュメント/DEV/web-collections-extension/js/panel.js) | サイドパネルUIロジック（状態管理、レンダリング、D&D） |
| [js/storage.js](file:///home/heppo/ドキュメント/DEV/web-collections-extension/js/storage.js) | ローカルストレージCRUD操作 |
| [js/crypto-utils.js](file:///home/heppo/ドキュメント/DEV/web-collections-extension/js/crypto-utils.js) | AES-GCM暗号化・復号化 |
| [js/drive-sync.js](file:///home/heppo/ドキュメント/DEV/web-collections-extension/js/drive-sync.js) | Google Drive API連携 |
| [html/sidepanel.html](file:///home/heppo/ドキュメント/DEV/web-collections-extension/html/sidepanel.html) | サイドパネルHTML構造 |
| [css/panel.css](file:///home/heppo/ドキュメント/DEV/web-collections-extension/css/panel.css) | モダンダークテーマ |
| [_locales/ja/messages.json](file:///home/heppo/ドキュメント/DEV/web-collections-extension/_locales/ja/messages.json) | 日本語ロケール |
| [_locales/en/messages.json](file:///home/heppo/ドキュメント/DEV/web-collections-extension/_locales/en/messages.json) | 英語ロケール |
| icons/ | 16/48/128px アイコン |
| [README.md](file:///home/heppo/ドキュメント/DEV/web-collections-extension/README.md) | セットアップ手順 |

---

## 主要機能

### ✅ 実装済み機能

- **コレクション管理**: 作成・削除・名前変更
- **4種類のアイテム**: Webページ、テキスト抜粋、画像、メモ
- **右クリックメニュー**: ページ/テキスト/画像/リンクを追加
- **ドラッグ＆ドロップ**: アイテム並び替え
- **一括オープン**: コレクション内の全リンクをタブで開く
- **エクスポート**: JSON/CSV形式
- **インポート**: JSONファイルから復元
- **暗号化同期**: Google DriveにAES-256暗号化で保存
- **キーボードショートカット**: `Ctrl+Shift+Y`

---

## セットアップ手順

### 1. 拡張機能を読み込む

```
edge://extensions/ → 開発者モード ON → パッケージ化されていない拡張機能を読み込む
```

### 2. Google Drive同期を有効にする（オプション）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Google Drive API を有効化
3. OAuth Client ID (Chrome拡張機能タイプ) を作成
4. `manifest.json` の `oauth2.client_id` を書き換え
5. 拡張機能を再読み込み

---

## 今後の改善候補

- サムネイル自動生成（現在はファビコンとリンク画像のみ）
- リアルタイム同期（現在は手動）
- 複数コレクション間のアイテム移動
- タグ/ラベル機能
- 検索機能
