# Panel Refactoring and Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modularize `panel.js` into UI, State, Event, and Sync layers using ES Modules, migrate IDs to UUIDs, and establish a robust Last Write Wins (LWW) sync mechanism.

**Architecture:** Split the monolith into granular files (`panel-state.js`, `panel-ui.js`, `panel-render.js`, `panel-events.js`, `panel-dragdrop.js`, `sync-manager.js`, `sync-strategy.js`). Implement a migration step to update old IDs to `crypto.randomUUID()`. Establish field-level LWW merge resolution in the sync strategy. Expose all these as ES modules, and load them natively in the extension via `<script type="module">`.

**Tech Stack:** JavaScript (ES Modules), Manifest V3, Web Crypto API, Node native test runner (for logic tests).

---

## Chunk 1: Foundation and Module Enablement

### Task 1: Setup ES Modules in Manifest and HTML

**Files:**
- Modify: `manifest.json`
- Modify: `html/sidepanel.html`
- Modify: `html/settings.html`

- [ ] **Step 1: Update `manifest.json`**

```json
// Add to manifest.json background object:
  "background": {
    "service_worker": "js/background.js",
    "type": "module"
  }
```

- [ ] **Step 2: Update HTML scripts**
In `html/sidepanel.html` and `html/settings.html`, update all `<script src="...">` tags to include `type="module"`.

```html
<script type="module" src="../js/panel.js"></script>
```

- [ ] **Step 3: Commit**
```bash
git add manifest.json html/sidepanel.html html/settings.html
git commit -m "chore: enable ES modules in manifest and HTML"
```

## Chunk 2: UUID Migration and Utilities

### Task 2: Create UUID Generator and ID Migration Logic

**Files:**
- Create: `js/migration.js`
- Modify: `js/crypto-utils.js`
- Create: `tests/migration.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/migration.test.js
import test from 'node:test';
import assert from 'node:assert';
import { migrateDataToUUIDs } from '../js/migration.js';

// Polyfill crypto for node test environment if needed
if (!globalThis.crypto) {
    import('node:crypto').then(crypto => {
        globalThis.crypto = crypto.webcrypto;
    });
}

test('migrates old IDs to UUIDs', () => {
    const oldItems = [{ id: 'old-123', content: 'test', updatedAt: 100 }];
    const newItems = migrateDataToUUIDs(oldItems);
    assert.match(newItems[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.strictEqual(newItems[0].content, 'test');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/migration.test.js`
Expected: FAIL with "module not found"

- [ ] **Step 3: Write minimal implementation**

```javascript
// js/crypto-utils.js
// Ensure this exports generateUUID
export function generateUUID() {
    return crypto.randomUUID();
}
```

```javascript
// js/migration.js
import { generateUUID } from './crypto-utils.js';

export function migrateDataToUUIDs(items) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return items.map(item => {
        if (!item.id || !uuidRegex.test(item.id)) {
            return { ...item, id: generateUUID() };
        }
        return item;
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/migration.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/crypto-utils.js js/migration.js tests/migration.test.js
git commit -m "feat: add UUID generation and data migration logic"
```

## Chunk 3: Sync Strategy (LWW)

### Task 3: Implement Last Write Wins Merging

**Files:**
- Create: `js/sync-strategy.js`
- Create: `tests/sync-strategy.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/sync-strategy.test.js
import test from 'node:test';
import assert from 'node:assert';
import { mergeItem } from '../js/sync-strategy.js';

test('mergeItem uses LWW at field level', () => {
    const local = { id: '1', title: 'Local', updatedAt: 200 };
    const remote = { id: '1', title: 'Remote', isDeleted: true, updatedAt: 300 };
    
    const result = mergeItem(local, remote);
    assert.strictEqual(result.title, 'Remote');
    assert.strictEqual(result.isDeleted, true);
    assert.strictEqual(result.updatedAt, 300);
});

test('mergeItem prefers local if newer', () => {
    const local = { id: '1', title: 'Local', updatedAt: 400 };
    const remote = { id: '1', title: 'Remote', updatedAt: 300 };
    
    const result = mergeItem(local, remote);
    assert.strictEqual(result.title, 'Local');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sync-strategy.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// js/sync-strategy.js
export function mergeItem(local, remote) {
    if (!local) return remote;
    if (!remote) return local;

    // Simple LWW based on updatedAt
    if (remote.updatedAt > local.updatedAt) {
        return { ...local, ...remote };
    } else {
        return { ...remote, ...local };
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sync-strategy.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/sync-strategy.js tests/sync-strategy.test.js
git commit -m "feat: implement LWW sync strategy"
```

## Chunk 4: State Management and Render Extraction

### Task 4: Extract Panel State

**Files:**
- Create: `js/panel-state.js`
- Modify: `js/panel.js`

- [ ] **Step 1: Extract state object**
In `js/panel-state.js`, define and export the application state and an observer pattern:
```javascript
// js/panel-state.js
export const state = {
    collections: [],
    currentCollectionId: null,
    currentItems: [],
    currentView: 'list',
    layoutMode: 'list',
    settings: {},
    folderSyncEnabled: false
};

const listeners = [];
export function subscribe(fn) { listeners.push(fn); }
export function notify() { listeners.forEach(fn => fn(state)); }
```
Remove `const state = { ... };` from `js/panel.js` and import it instead.

- [ ] **Step 2: Commit**

```bash
git add js/panel-state.js js/panel.js
git commit -m "refactor: extract panel-state.js"
```

### Task 5: Extract Rendering Logic

**Files:**
- Create: `js/panel-render.js`
- Modify: `js/panel.js`

- [ ] **Step 1: Isolate HTML string generation**
Move all functions generating HTML (e.g., renderCollectionList, renderItems) from `js/panel.js` into `js/panel-render.js`. Export them. Import them back into `js/panel.js` as a temporary bridge.

- [ ] **Step 2: Commit**

```bash
git add js/panel-render.js js/panel.js
git commit -m "refactor: extract panel-render.js"
```

## Chunk 5: UI DOM and Events

### Task 6: Extract UI Element References

**Files:**
- Create: `js/panel-ui.js`
- Modify: `js/panel.js`

- [ ] **Step 1: Isolate DOM access**
Move `const elements = {}` and `initElements()` from `js/panel.js` to `js/panel-ui.js`. Export them.

- [ ] **Step 2: Commit**

```bash
git add js/panel-ui.js js/panel.js
git commit -m "refactor: extract panel-ui.js"
```

### Task 7: Extract Events and Drag-Drop

**Files:**
- Create: `js/panel-events.js`
- Create: `js/panel-dragdrop.js`
- Modify: `js/panel.js`

- [ ] **Step 1: Move drag-and-drop**
Extract drag-and-drop sort logic into `js/panel-dragdrop.js`. Export initialization function `initDragDrop(container)`.

- [ ] **Step 2: Move event listeners**
Extract click/input event attachments into `js/panel-events.js`.

- [ ] **Step 3: Commit**

```bash
git add js/panel-events.js js/panel-dragdrop.js js/panel.js
git commit -m "refactor: decouple events and drag-drop logic"
```

## Chunk 6: Background and Sync Orchestration

### Task 8: Sync Manager

**Files:**
- Create: `js/sync-manager.js`
- Modify: `js/panel.js`

- [ ] **Step 1: Create Headless Orchestrator**
Move sync coordination logic (calling storage, comparing, resolving) from `js/panel.js` into `js/sync-manager.js`. Import `mergeItem` from `sync-strategy.js`. Make sure it doesn't reference `document` or `window`.

- [ ] **Step 2: Commit**

```bash
git add js/sync-manager.js js/panel.js
git commit -m "refactor: extract headless sync-manager.js"
```

### Task 9: Background Message Handlers

**Files:**
- Create: `js/background-handlers.js`
- Modify: `js/background.js`

- [ ] **Step 1: Delegate `onMessage` logic**
Move the switch-case statement inside `chrome.runtime.onMessage.addListener` from `js/background.js` into modular functions exported from `js/background-handlers.js`.

- [ ] **Step 2: Commit**

```bash
git add js/background-handlers.js js/background.js
git commit -m "refactor: modularize background handlers"
```

## Chunk 7: Re-wire `panel.js` Entrypoint

### Task 10: Assemble the Final Application

**Files:**
- Modify: `js/panel.js`

- [ ] **Step 1: Finalize Entrypoint**
In `js/panel.js`, ensure it purely imports from the newly created modules.
```javascript
import { state, subscribe } from './panel-state.js';
import { initElements, elements } from './panel-ui.js';
import { initEvents } from './panel-events.js';
import { migrateDataToUUIDs } from './migration.js';

document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    initEvents();
    // Run initialization and migration
});
```

- [ ] **Step 2: Commit**

```bash
git add js/panel.js
git commit -m "refactor: finalize panel.js as pure entrypoint module"
```