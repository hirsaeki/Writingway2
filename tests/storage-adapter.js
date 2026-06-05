const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const projectRoot = path.resolve(__dirname, '..');
    const fileUrl = process.env.APP_URL || ('file:///' + path.join(projectRoot, 'main.html').replace(/\\/g, '/'));

    console.log('Opening:', fileUrl);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => (
            window.PlatformAdapter &&
            window.StorageAdapter &&
            window.db
        ), { timeout: 5000 });

        const result = await page.evaluate(async () => {
            const browserStatus = await window.StorageAdapter.getStatus();
            const browserNative = await window.StorageAdapter.getNativeSqliteStatus();

            const commands = [];
            window.__TAURI_INTERNALS__ = {
                invoke(command, payload) {
                    commands.push({ command, payload });
                    if (command === 'writingway2_sqlite_storage_status') {
                        return Promise.resolve({
                            kind: 'sqlite',
                            ready: true,
                            active: false,
                            databaseName: 'writingway2.sqlite3',
                            databasePath: '/mock/appdata/writingway2.sqlite3',
                            existedBeforeOpen: false,
                            schemaVersion: 0
                        });
                    }
                    throw new Error(`Unexpected command: ${command}`);
                }
            };

            try {
                const tauriStatus = await window.StorageAdapter.getStatus();
                const directNative = await window.PlatformAdapter.getSqliteStorageStatus();
                return {
                    browserKind: browserStatus.kind,
                    browserActiveKind: browserStatus.activeKind,
                    browserDexieAvailable: browserStatus.dexie.available,
                    browserDexieName: browserStatus.dexie.databaseName,
                    browserDexieVersion: browserStatus.dexie.schemaVersion,
                    browserNativeAvailable: browserNative.available,
                    browserNativeReason: browserNative.reason,
                    tauriPlatformKind: window.PlatformAdapter.kind,
                    tauriStorageKind: tauriStatus.kind,
                    tauriActiveKind: tauriStatus.activeKind,
                    tauriNativeReady: tauriStatus.native.ready,
                    tauriNativeActive: tauriStatus.native.active,
                    tauriNativeDatabaseName: tauriStatus.native.databaseName,
                    directNativeReady: directNative.ready,
                    commands
                };
            } finally {
                delete window.__TAURI_INTERNALS__;
            }
        });

        const checks = [
            { ok: result.browserKind === 'dexie', msg: 'Browser StorageAdapter kind should be dexie' },
            { ok: result.browserActiveKind === 'dexie', msg: 'Browser active storage should remain dexie' },
            { ok: result.browserDexieAvailable === true, msg: 'Dexie database should be available' },
            { ok: result.browserDexieName === 'WritingwayDB', msg: 'Dexie database name changed unexpectedly' },
            { ok: result.browserDexieVersion === 14, msg: 'Dexie latest schema version should be 14' },
            { ok: result.browserNativeAvailable === false, msg: 'Browser native SQLite status should be unavailable' },
            { ok: result.browserNativeReason === 'browser-mode', msg: 'Browser native SQLite reason should be browser-mode' },
            { ok: result.tauriPlatformKind === 'tauri', msg: 'Mock Tauri mode was not detected' },
            { ok: result.tauriStorageKind === 'dexie', msg: 'Tauri D1 active StorageAdapter kind should still be dexie' },
            { ok: result.tauriActiveKind === 'dexie', msg: 'Tauri D1 active storage should remain dexie' },
            { ok: result.tauriNativeReady === true, msg: 'Mock Tauri SQLite readiness was not reported' },
            { ok: result.tauriNativeActive === false, msg: 'SQLite should not be active in D1' },
            { ok: result.tauriNativeDatabaseName === 'writingway2.sqlite3', msg: 'SQLite readiness database name was not preserved' },
            { ok: result.directNativeReady === true, msg: 'PlatformAdapter SQLite status did not call native command' },
            {
                ok: result.commands.every(call => call.command === 'writingway2_sqlite_storage_status'),
                msg: 'Unexpected native command was invoked'
            }
        ];

        const failed = checks.filter(check => !check.ok);
        if (failed.length > 0) {
            console.error('Storage adapter test failed:');
            for (const failure of failed) console.error(' -', failure.msg);
            await browser.close();
            process.exit(2);
        }

        console.log('Storage adapter D1 test passed.');
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Storage adapter test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
