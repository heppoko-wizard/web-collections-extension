# Multi-Writer Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a high-reliability sync system where each device writes its own files, and the browser merges them using item-level LWW (Last Write Wins) to prevent data loss.

**Architecture:** Each device identifies itself with a unique `deviceId`. It writes to `manifests/manifest_[DeviceID].json` and `collections/collection_[UUID]_[DeviceID].json`. During synchronization, the client reads all manifest files from all devices and merges collection items based on their `updatedAt` timestamps.

**Tech Stack:** JavaScript (ES Modules), File System Access API, IndexedDB, Chrome Storage API.

---

## Chunk 1: Device Identity Management

### Task 1: Create Device Manager
**Files:**
- Create: `js/device-manager.js`
- Modify: `js/panel.js` (Import and initialize)

- [ ] **Step 1: Implement DeviceManager**
Create `js/device-manager.js` to handle `deviceId` generation and persistence.

```javascript
import { generateUUID } from './crypto-utils.js';

export const DeviceManager = {
    STORAGE_KEY: 'sync_device_info',

    async getDeviceInfo() {
        const info = await chrome.storage.local.get(this.STORAGE_KEY);
        if (info[this.STORAGE_KEY]) {
            return info[this.STORAGE_KEY];
        }

        // Initialize new device info
        const newInfo = {
            deviceId: generateUUID(),
            deviceName: this.getDefaultDeviceName(),
            createdAt: Date.now()
        };
        await chrome.storage.local.set({ [this.STORAGE_KEY]: newInfo });
        return newInfo;
    },

    getDefaultDeviceName() {
        const ua = navigator.userAgent;
        if (ua.includes('Edg/')) return 'Edge Browser';
        if (ua.includes('Chrome/')) return 'Chrome Browser';
        return 'Web Device';
    },

    async updateDeviceName(newName) {
        const info = await this.getDeviceInfo();
        info.deviceName = newName;
        await chrome.storage.local.set({ [this.STORAGE_KEY]: info });
        return info;
    }
};
```

- [ ] **Step 2: Initialize in panel.js**
Ensure DeviceManager is available on startup.

- [ ] **Step 3: Verify Initialization**
Run: Open extension panel, check `chrome.storage.local` in DevTools.
Expected: `sync_device_info` object exists with `deviceId` and `deviceName`.

---

## Chunk 2: FolderSync Adaptation

### Task 2: Update FolderSync for Multi-Writer paths
**Files:**
- Modify: `js/folder-sync.js`

- [ ] **Step 1: Define new constants and directory structure**
Update `FolderSync` to use `manifests/` directory instead of a single root file.

```javascript
export const FolderSync = {
    // ... existing
    MANIFESTS_DIR: 'manifests', // New directory for multi-device manifests
    COLLECTIONS_DIR: 'collections',
    
    // Helper to get device-specific filename
    getManifestName(deviceId) {
        return `manifest_${deviceId}.json`;
    },
    getCollectionFileName(collectionId, deviceId) {
        return `collection_${collectionId}_${deviceId}.json`;
    },
    // ...
```

- [ ] **Step 2: Add directory listing for manifests**
Implement `listManifests()` to scan the `manifests/` folder.

```javascript
    async listManifests() {
        const rootHandle = await this.getSavedDirectoryHandle();
        if (!rootHandle) throw new Error('No folder selected');
        
        const manifestDirHandle = await this.getDirectoryHandle(rootHandle, this.MANIFESTS_DIR, true);
        const files = [];
        for await (const entry of manifestDirHandle.values()) {
            if (entry.kind === 'file' && entry.name.startsWith('manifest_') && entry.name.endsWith('.json')) {
                files.push(entry.name);
            }
        }
        return files;
    },
```

- [ ] **Step 3: Update listCollections to match device pattern**
Ensure it can find files matching `collection_[UUID]_[DeviceID].json`.

---

## Chunk 3: SyncManager Overhaul (Push & Pull)

### Task 3: Implement Multi-Writer Push
**Files:**
- Modify: `js/sync-manager.js`

- [ ] **Step 1: Update pushToLocalFolder to use DeviceID**
Modify the logic to write files with the current `deviceId` suffix.

- [ ] **Step 2: Update manifest structure**
Include `deviceName` in the manifest for better UI feedback later.

### Task 4: Implement Multi-Writer Pull & Merge
**Files:**
- Modify: `js/sync-manager.js`
- Modify: `js/sync-strategy.js` (Ensure item-level merge is robust)

- [ ] **Step 1: Implement scan and load all remote manifests**
`pullFromLocalFolder` should read all files from `manifests/` directory.

- [ ] **Step 2: Logic to determine latest versions per item**
For each collection, collect data from all devices that have updated it, then merge items using LWW.

```javascript
// Pseudocode for merge logic
const mergedItems = new Map();
for (const deviceFile of deviceFiles) {
    const data = JSON.parse(await FolderSync.readFile(deviceFile, colDirHandle));
    for (const item of data.items) {
        const existing = mergedItems.get(item.id);
        if (!existing || item.updatedAt > existing.updatedAt) {
            mergedItems.set(item.id, item);
        }
    }
}
```

- [ ] **Step 3: Update local IndexedDB with merged result**

---

## Chunk 4: UI & Configuration

### Task 5: Sync Settings UI
**Files:**
- Modify: `html/sidepanel.html`
- Modify: `js/panel-ui.js`
- Modify: `css/panel.css`

- [ ] **Step 1: Add Device Name field to Sync Settings**
Allow users to rename their device (e.g., "Home PC", "Work Laptop").

- [ ] **Step 2: Display Sync Status with Device Info**
Show "Syncing with 3 devices" or similar status.

---

## Chunk 5: Verification

### Task 6: Logic Verification
**Files:**
- Modify: `tests/sync-strategy.test.js`

- [ ] **Step 1: Integration Test**
Run: `npm test tests/sync-strategy.test.js` (Update tests to cover multi-device merge logic).
