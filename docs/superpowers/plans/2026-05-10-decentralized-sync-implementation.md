---
name: decentralized-sync-v2
description: Implement decentralized folder sync (manifest + per-collection JSON) and completely remove Base64 image storage.
---

# Decentralized Sync & Base64 Removal Implementation Plan

This plan outlines the steps to transition from a monolithic JSON sync to a more efficient decentralized approach using `manifest.json` and individual collection files. It also enforces the removal of heavy Base64 image data to ensure performance.

## 1. Cleanup & UI Removal

### [Task 1.1] Remove Image Processing Modules
- **Action**: Delete `js/image-processor.js` and `js/image-optimizer.js`.
- **Reason**: We are moving away from Base64 image storage to keep the database lightweight.
- **Files to delete**:
  - `/home/heppo/DEV/web-collections-extension/js/image-processor.js`
  - `/home/heppo/DEV/web-collections-extension/js/image-optimizer.js`

### [Task 1.2] Update `sidepanel.html`
- **File**: `/home/heppo/DEV/web-collections-extension/html/sidepanel.html`
- **Change**: Remove the entire "保存設定" (Save Settings) section containing the image resize slider.
- **Context**: 
  ```html
  <!-- 保存設定 -->
  <div class="settings-section">
    <h3>💾 保存設定</h3>
    ...
  </div>
  ```

### [Task 1.3] Update `panel-ui.js`
- **File**: `/home/heppo/DEV/web-collections-extension/js/panel-ui.js`
- **Change**: Remove references to `#setting-save-width` and `#save-width-value`. Clean up the initialization and save handlers for this setting in `loadSettings` and `initEventListeners`.

## 2. Storage & Migration

### [Task 2.1] Update `storage.js` Logic
- **File**: `/home/heppo/DEV/web-collections-extension/js/storage.js`
- **Change**:
    - Remove `ImageProcessor` check and call in `addItem`.
    - Ensure `updatedAt` is always set to `Date.now()` on every modification (add, edit, delete, move).
- **Verification**: Ensure no `typeof ImageProcessor !== 'undefined'` checks remain in the file.

### [Task 2.2] Base64 Data Purge Migration
- **File**: `/home/heppo/DEV/web-collections-extension/js/migration.js`
- **Change**: Add a migration step that iterates over all items in IndexedDB and sets `imageUrl` to `null` if it contains a `data:image/...` Base64 string.
- **Code snippet**:
  ```javascript
  if (item.imageUrl && item.imageUrl.startsWith('data:image/')) {
      item.imageUrl = null;
  }
  ```

## 3. Modular Folder Sync Implementation

### [Task 3.1] Enhance `folder-sync.js`
- **File**: `/home/heppo/DEV/web-collections-extension/js/folder-sync.js`
- **Change**:
    - Add `getDirectoryHandle(name, { create: true })` helper using `dirHandle.getDirectoryHandle`.
    - Implement `ensureCollectionsDir()` to create the `collections/` subdirectory.
    - Update `writeFile` and `readFile` to support writing into specific directories.

### [Task 3.2] Implement Decentralized Sync Logic in `sync-manager.js`
- **File**: `/home/heppo/DEV/web-collections-extension/js/sync-manager.js`
- **Logic**:
    - `pushToLocalFolder()`:
        1. Read existing `manifest.json`.
        2. Identify collections modified since `manifest.lastSyncedAt`.
        3. Write each modified collection to `collections/[UUID].json`.
        4. Update `manifest.json` with new timestamps.
    - `pullFromLocalFolder()`:
        1. Read remote `manifest.json`.
        2. Compare each collection's `updatedAt` with local state.
        3. Fetch and merge only newer files.

### [Task 3.3] Validation with Tests
- **File**: `/home/heppo/DEV/web-collections-extension/tests/sync-strategy.test.js`
- **Change**: Add test cases for merging decentralized manifest data and handling LWW (Last Write Wins) for collection-level files.
- **Command**: `npm test tests/sync-strategy.test.js`

## 4. Background Integration & Notifications

### [Task 4.1] "Always-on" Sync in `background.js`
- **File**: `/home/heppo/DEV/web-collections-extension/js/background.js`
- **Change**:
    - Listen for internal storage change events.
    - Trigger `SyncManager.pushToLocalFolder()` with a 5-second debounce.

### [Task 4.2] Permission Re-grant Notification
- **File**: `/home/heppo/DEV/web-collections-extension/js/background.js`
- **Change**:
    - Wrap sync calls in try-catch.
    - If `NotAllowedError` occurs, show a system notification using `chrome.notifications.create`.
    - Clicking the notification should navigate the sidepanel to the sync settings.
