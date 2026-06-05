// Storage adapter boundary. D1 keeps Dexie as the active storage backend.
(function () {
    const ACTIVE_KIND = 'dexie';

    function dexieInfo() {
        const database = window.db || null;
        return {
            available: Boolean(database && typeof database.table === 'function'),
            databaseName: database?.name || 'WritingwayDB',
            schemaVersion: Number(database?.verno || 0) || null
        };
    }

    function browserNativeStatus() {
        return {
            available: false,
            ready: false,
            reason: 'browser-mode',
            kind: 'sqlite'
        };
    }

    function hasNativeSqlite() {
        return Boolean(
            window.PlatformAdapter &&
            typeof window.PlatformAdapter.hasTauriSqliteStorageApi === 'function' &&
            window.PlatformAdapter.hasTauriSqliteStorageApi()
        );
    }

    async function getNativeSqliteStatus() {
        if (!hasNativeSqlite()) return browserNativeStatus();
        return window.PlatformAdapter.getSqliteStorageStatus();
    }

    async function getStatus(options = {}) {
        const includeNative = options.includeNative !== false;
        const status = {
            kind: ACTIVE_KIND,
            activeKind: ACTIVE_KIND,
            dexie: dexieInfo(),
            native: browserNativeStatus()
        };
        if (includeNative && hasNativeSqlite()) {
            status.native = await getNativeSqliteStatus();
        }
        return status;
    }

    function assertDexieActive() {
        if (ACTIVE_KIND !== 'dexie') {
            throw new Error('Dexie is not the active storage backend.');
        }
    }

    window.StorageAdapter = window.StorageAdapter || {
        kind: ACTIVE_KIND,
        activeKind: ACTIVE_KIND,
        isDexieActive() {
            return ACTIVE_KIND === 'dexie';
        },
        assertDexieActive,
        getStatus,
        getNativeSqliteStatus,
        _test: {
            dexieInfo,
            browserNativeStatus,
            hasNativeSqlite
        }
    };
})();
