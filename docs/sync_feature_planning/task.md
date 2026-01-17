# タスク: リアルタイム同期機能の設計と実装

## 設計・検討フェーズ

- [x] 同期バックエンドの選定 (GitHub Gistに決定) <!-- id: 0 -->
- [x] Edgeのサムネイル保存仕様の調査 (canonical_image_data confirmed) <!-- id: 6 -->
- [x] 画像最適化仕様の決定 (WebP / 320px / Q70) <!-- id: 7 -->
- [ ] ローカルストレージ設計の確定 <!-- id: 8 -->
  - [ ] `manifest.json` に `unlimitedStorage` を追加
  - [ ] オフライン動作の仕様策定

## 実装フェーズ: GitHub Gist Sync

- [ ] Gist API クライアントの実装 <!-- id: 3 -->
- [ ] 画像処理ロジックの実装 (Resize & Compress) <!-- id: 4 -->
- [ ] UI実装 <!-- id: 5 -->
