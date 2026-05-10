# 調査レポート：Service Worker 登録失敗および複数機能の停止

## 報告された症状

1. **Service worker registration failed. Status code: 15**
2. **`Uncaught TypeError: Cannot read properties of undefined (reading 'onAlarm')`** at `js/background.js:46`
3. 新しいコレクションの追加が機能しない
4. 右クリックコンテキストメニューが表示されない

---

## 【調査の道筋（仮説と検証のトレイル）】

### 仮説1：`chrome.alarms` APIの権限不足

- **仮説**: `background.js:46` で `chrome.alarms.onAlarm` が undefined になっているのは、manifest.json の permissions に `alarms` が宣言されていないためではないか。
- **検証**: `manifest.json` を確認。
- **事実の発見**:
  - `manifest.json` の `permissions` 配列は以下の通り:
    ```json
    "permissions": [
      "sidePanel",
      "contextMenus",
      "storage",
      "unlimitedStorage",
      "identity",
      "activeTab",
      "scripting"
    ]
    ```
  - **`alarms` が存在しない。**
  - `background.js:40` で `chrome.alarms.create('auto-sync-polling', ...)` を呼び出している。
  - `background.js:46` で `chrome.alarms.onAlarm.addListener(...)` を呼び出している。
  - Chrome Manifest V3 の仕様上、`chrome.alarms` API を使用するには `permissions` に `"alarms"` を含める必要がある。権限がない場合、`chrome.alarms` は `undefined` となり、`.onAlarm` へのアクセスで TypeError が発生する。

### 仮説2：Status Code 15 の原因

- **仮説**: Status code 15 は「Service Worker のスクリプト評価エラー」を意味する。`chrome.alarms.onAlarm.addListener(...)` がトップレベルで実行されているため、スクリプト評価時に即座にエラーが発生し、Service Worker の登録自体が失敗するのではないか。
- **検証**: Web検索結果と background.js のコード構造を確認。
- **事実の発見**:
  - Web検索の結果、Status code 15 は「スクリプト評価中のエラー」を示す。つまり Service Worker の JS ファイルを読み込んで実行した際にキャッチされない例外が発生すると、登録自体が失敗する。
  - `background.js:46` の `chrome.alarms.onAlarm.addListener(...)` はモジュールのトップレベルで実行される。`chrome.alarms` が `undefined` であるため、このコードがスクリプト評価時に即座に TypeError をスローし、Service Worker の登録を阻止している。

### 仮説3：全機能停止の因果関係

- **仮説**: Service Worker が登録されないことで、コンテキストメニューの登録もメッセージハンドラの登録もすべて失敗しているのではないか。
- **検証**: `background.js` のコード構造を確認。
- **事実の発見**:
  - Service Worker が Status code 15 で登録に失敗した場合、`background.js` 内のコードは一切実行されない。これにより：
    - `chrome.runtime.onInstalled` → 実行されない → `setupContextMenus()` が呼ばれない → **コンテキストメニューが表示されない**
    - `chrome.runtime.onMessage` → 実行されない → **パネルからの `sendMessage` が応答を返さない** → コレクション追加を含むすべてのCRUD操作が動作しない
    - `chrome.contextMenus.onClicked` → 実行されない → 右クリックメニューの項目が登録されず、クリックハンドラも存在しない
  - **全症状の根本原因は一つ**: `alarms` パーミッションの欠如 → `chrome.alarms` が undefined → トップレベルでの TypeError → Service Worker 登録失敗 → 全機能停止。

### 追加発見：notifications API の未宣言

- **検証**: `background-handlers.js:37` を確認。
- **事実の発見**:
  - `background-handlers.js:37` で `chrome.notifications.create(...)` を呼び出しているが、`manifest.json` の permissions に `"notifications"` が宣言されていない。
  - ただし、この呼び出しは `showPermissionNotification()` 関数内であり、同期失敗時にのみ呼ばれるため、スクリプト評価時にはクラッシュしない。実行時に `chrome.notifications` が undefined の場合にランタイムエラーとなる。
  - **これは即座のクラッシュ原因ではないが、潜在的なバグである。**

---

## 【コードベース・仕様から確認された最終的な事実】

| 問題 | 根本原因 | 該当ファイル:行 | 重要度 |
|------|---------|----------------|--------|
| Status code: 15 | `alarms` パーミッション未宣言により `chrome.alarms` が undefined。トップレベルでの TypeError で Service Worker 登録自体が失敗 | `manifest.json` permissions / `background.js:46` | 致命的 |
| onAlarm TypeError | 同上 | `background.js:46` | 致命的 |
| コンテキストメニュー非表示 | Service Worker 未登録のため `setupContextMenus()` が実行されない | `background.js:33` | 致命的 (二次障害) |
| コレクション追加不可 | Service Worker 未登録のため `onMessage` ハンドラが存在せず、パネルからのメッセージが処理されない | `background.js:174` | 致命的 (二次障害) |
| notifications API 未宣言 | permissions に `notifications` がない。同期エラー時にランタイムエラーになる | `manifest.json` / `background-handlers.js:37` | 中程度 (潜在) |

## 修正方針（確認待ち）

`manifest.json` の `permissions` に `"alarms"` を追加すれば、Service Worker 登録が成功し、全症状が解消される見込み。`"notifications"` も合わせて追加するかは判断を仰ぐ。

---

※ 本レポートは事実の列挙です。修正作業に進んでよいかご指示をお願いします。
