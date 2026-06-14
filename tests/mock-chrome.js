// tests/mock-chrome.js

const mockStorageStore = {};
const mockAlarms = {};
const mockBadge = { text: '', color: '' };
const listeners = {
    onInstalled: null,
    onStartup: null,
    onAlarm: null,
    onMessage: null
};

// IndexedDB のインメモリシミュレーションモック
const indexedDBStore = new Map();
globalThis.indexedDB = {
    open() {
        const req = {
            onsuccess: null,
            onerror: null,
            onupgradeneeded: null
        };
        setTimeout(() => {
            const mockDb = {
                objectStoreNames: {
                    contains: () => true
                },
                transaction() {
                    const tx = {
                        objectStore() {
                            return {
                                get(key) {
                                    const getReq = { onsuccess: null, onerror: null, result: indexedDBStore.get(key) };
                                    setTimeout(() => {
                                        if (getReq.onsuccess) getReq.onsuccess();
                                    }, 0);
                                    return getReq;
                                },
                                put(val, key) {
                                    indexedDBStore.set(key, val);
                                    const putReq = { onsuccess: null, onerror: null };
                                    setTimeout(() => {
                                        if (putReq.onsuccess) putReq.onsuccess();
                                    }, 0);
                                    return putReq;
                                }
                            };
                        },
                        oncomplete: null,
                        onerror: null
                    };
                    setTimeout(() => {
                        if (tx.oncomplete) tx.oncomplete();
                    }, 0);
                    return tx;
                }
            };
            if (req.onsuccess) req.onsuccess({ target: { result: mockDb } });
        }, 0);
        return req;
    }
};

globalThis.chrome = {
    storage: {
        local: {
            async get(keys) {
                if (typeof keys === 'string') {
                    return { [keys]: mockStorageStore[keys] };
                }
                if (Array.isArray(keys)) {
                    const res = {};
                    keys.forEach(k => {
                        res[k] = mockStorageStore[k];
                    });
                    return res;
                }
                return mockStorageStore;
            },
            async set(items) {
                Object.assign(mockStorageStore, items);
            },
            async remove(keys) {
                if (typeof keys === 'string') {
                    delete mockStorageStore[keys];
                } else if (Array.isArray(keys)) {
                    keys.forEach(k => delete mockStorageStore[k]);
                }
            },
            clear() {
                for (const key in mockStorageStore) {
                    delete mockStorageStore[key];
                }
            }
        }
    },
    alarms: {
        create(name, details) {
            mockAlarms[name] = details;
        },
        async get(name) {
            return mockAlarms[name] ? { name } : null;
        },
        clearAll() {
            for (const key in mockAlarms) {
                delete mockAlarms[key];
            }
        },
        onAlarm: {
            addListener(cb) {
                listeners.onAlarm = cb;
            }
        }
    },
    action: {
        async setBadgeText(details) {
            mockBadge.text = details.text;
        },
        async setBadgeBackgroundColor(details) {
            mockBadge.color = details.color;
        }
    },
    runtime: {
        onInstalled: {
            addListener(cb) {
                listeners.onInstalled = cb;
            }
        },
        onStartup: {
            addListener(cb) {
                listeners.onStartup = cb;
            }
        },
        onMessage: {
            addListener(cb) {
                listeners.onMessage = cb;
            }
        }
    },
    contextMenus: {
        onClicked: {
            addListener(cb) {}
        },
        removeAll(cb) {
            if (cb) cb();
        },
        create() {}
    }
};

export { mockStorageStore, mockAlarms, mockBadge, listeners, indexedDBStore };
