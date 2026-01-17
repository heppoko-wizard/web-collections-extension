# 実装計画: リアルタイム同期機能 (GitHub Gist版)

## 概要

GitHub Gistをクラウドバックエンド、`chrome.storage.local` をローカルキャッシュとして使用するハイブリッド構成。
常にローカルデータを正として表示し、バックグラウンドでGistと同期する。

## ローカルストレージ戦略

拡張機能にはChromeから専用の保存領域が割り当てられます。ここにデータを保存します。

### 1. 仕様

- **API**: `chrome.storage.local`
- **権限**: `"unlimitedStorage"` (これをmanifestに追加することで、容量制限を撤廃)
- **データ構造**:
  - 単一のキー `collections_data` に全てのコレクションと画像データを格納するか、あるいはコレクションIDごとに分割するか。
  - **決定**: `collections` キーにメタデータリスト、`collection_{id}` キーに各コレクションの詳細データ（画像込み）を分散させる。これにより、全データ読み込みのオーバーヘッドを防ぐ。

### 2. オフライン動作

- 拡張機能は通常時 `chrome.storage.local` からデータを読み込んで表示します。
- そのため、**インターネットがない場所でも完全に動作します**（画像の閲覧、追加、編集）。
- ネットに繋がった時に「同期ボタン」を押す（または自動同期）ことで、変更分がGistにアップロードされます。

## マニフェスト変更

#### [MODIFY] [manifest.json](file:///home/heppo/ドキュメント/DEV/web-collections-extension/manifest.json)

```json
"permissions": [
  ...,
  "unlimitedStorage" // 追加
]
```

## 同期フロー詳細

1. **起動時**: `chrome.storage.local` からデータをロードして即表示。
2. **バックグラウンド**: Gistの更新日時を確認。
    - Gistの方が新しい -> GistからDLしてローカルを更新（競合時は要選択UI）
    - ローカルの方が新しい -> Gistへアップロード

## 画像データの最適化 (再掲)

- **フォーマット**: WebP (Quality 70)
- **サイズ**: Max 320px
