# Web Collections (Edge Collections Alternative)

Microsoft Edgeの便利な「コレクション」機能を、Chromeやその他のChromiumブラウザでも使えるようにする拡張機能です。
さらに、独自の同期システムにより、特定のブラウザベンダーに依存しない、自由でプライベートなデータ管理を実現します。

![Icon](icons/icon128.png)

## ✨ 特徴と独自性 (Why Web Collections?)

### 1. ベンダーロックインからの解放

Edge Collectionsは素晴らしい機能ですが、Edgeブラウザでしか使えません。この拡張機能を使えば、Chrome、Brave、Vivaldiなど、好きなChromiumブラウザでコレクション機能が使えます。

### 2. 選べる同期バックエンド

ユーザーのプライバシーと利便性を最優先し、同期方法を柔軟に選べます。

- **GitHub Gist 同期 (実装済み)**:
  - 開発者に最適。GitHub Gist (Secret) をデータベースとして使用。
  - 無料で容量制限を気にする必要がありません（画像は自動で最適化してBase64保存）。
  - APIトークンを入れるだけの簡単セットアップ。

- **ローカルフォルダ/クラウドストレージ同期 (v1.1 実装予定)**:
  - OneDrive、Google Drive、DropboxなどのPC内同期フォルダを指定するだけ。
  - ファイルの変更を検知してリアルタイムに同期。
  - 外部サーバーにトークンを渡す必要がなく、最もセキュアでプライベート。

### 3. Edgeからの完全移行

専用の移行スクリプト (`scripts/migrate_collections.py`) を提供。現在Edgeに保存されている数百のコレクションや画像を、ワンクリックでJSON化してインポートできます。

## 🚀 機能一覧

- **Webページの保存**: 現在見ているページをワンクリックで追加
- **画像の保存**: 画像右クリックで直接コレクションに追加
- **テキストメモ**: 選択したテキストや、自由記述のメモを追加
- **ドラッグ&ドロップ**: アイテムの並び替え（実装中）
- **スマートリサイズ**: 保存した画像は視認性を保ったまま自動軽量化 (WebP/320px)

## 📦 インストールと設定

### インストール

1. このリポジトリをクローンまたはダウンロード
2. Chromeの `chrome://extensions/` を開く
3. 「デベロッパーモード」をONにする
4. 「パッケージ化されていない拡張機能を読み込む」でフォルダを選択

### Gist同期のセットアップ

1. サイドパネルを開き、設定アイコン (⚙️) をクリック
2. [GitHub Settings](https://github.com/settings/tokens/new?scopes=gist&description=Web%20Collections%20Sync) から `gist` スコープを持つトークンを発行
3. 設定画面にトークンを貼り付けて「保存」
4. 「接続テスト」で成功すれば完了！

## 🗺️ ロードマップ

### v1.0.0 (Current)

- [x] 基本的なコレクション機能（追加・削除・編集）
- [x] サイドパネル UI
- [x] GitHub Gist 同期の実装
- [x] 画像最適化ロジック
- [x] Edgeデータ移行スクリプト (Python)

### v1.1.0 (Next)

- [ ] **File System Access API によるローカルフォルダ同期**
  - OneDrive/Google Driveフォルダを直接指定して同期
- [ ] コンフリクト解決ロジック（最終更新優先マージ）

### v1.2.0

- [ ] 全文検索機能
- [ ] タグ付け機能
- [ ] オフラインモードの強化

### v2.0.0

- [ ] Android / iOS 対応 (PWAまたはReact Native)
- [ ] チーム共有機能

## 🛠️ 技術スタック

- **Frontend**: Vanilla JS (No Framework) - 軽量・高速動作のため
- **Styling**: CSS Variables (Dark mode ready)
- **Sync**: GitHub REST API / File System Access API
- **Storage**: chrome.storage.local (unlimitedStorage)

## 📄 ドキュメント

- [セットアップガイド](docs/SETUP_SYNC.md)
- [同期機能の設計](docs/sync_feature_planning/implementation_plan.md)

## License

MIT
