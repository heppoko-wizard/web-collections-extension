# 実装計画: OAuth Client ID の設定

## 概要

Google Drive APIを使用するために必要なOAuth Client IDを拡張機能に設定する。
ユーザーより、`manifest.json`へのハードコードではなく設定画面からの注入が可能かという質問があるため、その方針決定後に実装を行う。

## ユーザーレビューが必要な事項

- `manifest.json` の `client_id` フィールドは静的である必要があるため、`chrome.identity.getAuthToken` を使用する場合は動的な変更が不可能であること。
- 動的に行う場合は `chrome.identity.launchWebAuthFlow` を使用し、自前で認証フローを実装する必要があること（実装コスト増）。

## 変更予定ファイル

### Manifest

#### [MODIFY] [manifest.json](file:///home/heppo/ドキュメント/DEV/web-collections-extension/manifest.json)

- `oauth2` セクションの追加/更新（方針による）

## 検証計画

### 手動検証

- 拡張機能をリロードし、認証フローがトリガーされるか確認。
