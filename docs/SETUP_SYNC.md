# GitHub Gist 同期機能 - セットアップガイド

## 📋 前提条件

- GitHubアカウント
- Python 3.x（Edge移行時のみ）
- Pillow（画像処理用、Edge移行時のみ）: `pip install pillow`

## 🚀 セットアップ手順

### 1. 拡張機能のインストール

1. Chrome拡張機能ページ（`chrome://extensions/`）を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」
4. `/home/heppo/ドキュメント/DEV/web-collections-extension` を選択

### 2. GitHub Personal Access Token (PAT) の発行

1. <https://github.com/settings/tokens/new?scopes=gist> にアクセス
2. Token name: `Web Collections Sync`
3. **スコープ**: `gist` のみチェック
4. 「Generate token」をクリック
5. 生成されたトークンをコピー（**後で確認できないので注意！**）

### 3. トークンの設定

1. 拡張機能のサイドパネルを開く（拡張機能アイコンクリック or `Ctrl+Shift+Y`）
2. 右上の ⚙️ （設定）をクリック
3. 「GitHub Gist 同期」セクションの「⚙️ トークン設定」をクリック
4. 新しいタブで設定画面が開く
5. コピーしたトークンを貼り付けて「保存」
6. 「接続テスト」をクリックして成功を確認

### 4. Edge からのデータ移行（オプション）

```bash
cd /home/heppo/ドキュメント/DEV/web-collections-extension
python3 scripts/migrate_collections.py
```

- 成功すると `collections_migrated.json` が生成される
- サイドパネルの設定画面から「JSONインポート」でインポート

### 5. 同期テスト

1. サイドパネルでコレクションを作成
2. テストアイテムを追加（ページ、メモ、画像）
3. 設定画面で「🔄 今すぐ同期」をクリック
4. <https://gist.github.com/> で Secret Gist が作成されていることを確認

## 💡 使い方

### 基本的な同期

- **アップロード**: サイドパネルの設定画面で「🔄 今すぐ同期」
- **自動同期**: 現在は手動のみ（今後の機能追加予定）

### 複数デバイス間の同期

1. 各デバイスで同じGitHub PATを設定
2. 2台目以降は、初回同期時に既存Gistが自動検出される
3. データの競合時は最後に同期したものが優先（将来的に改善予定）

### モバイル（スマホ）での閲覧

- **Kiwi Browser (Android)** または **Orion Browser (iOS)** で拡張機能をインストール
- または、Gist URLから `collections.json` をダウンロードして閲覧

## 📝 トラブルシューティング

### "GitHub トークンが設定されていません" エラー

→ 設定画面でトークンを入力してください

### 接続テストが失敗する

→ トークンのスコープに `gist` が含まれているか確認

### 画像が同期されない

→ Edge移行スクリプトに `pillow` がインストールされているか確認

## 🔒 セキュリティとプライバシー

- トークンはローカル（`chrome.storage.local`）に暗号化されずに保存されます
- Gist は **Secret**（非公開）で作成されますが、URLを知っている人は閲覧可能です
- より強固なセキュリティが必要な場合は、今後の暗号化機能追加をお待ちください
