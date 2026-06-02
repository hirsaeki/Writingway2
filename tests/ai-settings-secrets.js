const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const projectRoot = path.resolve(__dirname, '..');
    const fileUrl = process.env.APP_URL || ('file:///' + path.join(projectRoot, 'main.html').replace(/\\/g, '/'));

    console.log('Opening:', fileUrl);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(msg.text()));

    try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => (
            window.AISettings &&
            window.__test &&
            window.__test.AISettingsStorage &&
            window.PlatformAdapter
        ), { timeout: 5000 });

        const result = await page.evaluate(async () => {
            const storage = window.__test.AISettingsStorage;
            window.AISettings.fetchProviderModels = async (app) => {
                app.modelsFetched = true;
            };

            function makeApp(overrides = {}) {
                return Object.assign({
                    aiMode: 'api',
                    aiProvider: 'openai',
                    aiApiKey: '',
                    aiModel: 'gpt-test',
                    aiEndpoint: '',
                    temperature: 0.4,
                    maxTokens: 123,
                    useProviderDefaults: false,
                    forceNonStreaming: false,
                    providerModels: { openai: [], lmstudio: [] },
                    modelsFetched: false
                }, overrides);
            }

            localStorage.clear();
            const browserApp = makeApp({ aiApiKey: 'sk-browser-secret' });
            await window.AISettings.saveGenerationParams(browserApp);
            const browserSettings = JSON.parse(localStorage.getItem(storage.SETTINGS_KEY));
            const browserSecret = localStorage.getItem(`writingway:secret:${storage.API_KEY_SECRET_KEY}`);

            const loadedBrowserApp = makeApp();
            await window.AISettings.loadAISettings(loadedBrowserApp);

            localStorage.clear();
            localStorage.setItem(storage.SETTINGS_KEY, JSON.stringify({
                mode: 'api',
                provider: 'openai',
                apiKey: 'sk-legacy-secret',
                model: 'gpt-legacy'
            }));
            const legacyApp = makeApp();
            await window.AISettings.loadAISettings(legacyApp);
            const migratedSettings = JSON.parse(localStorage.getItem(storage.SETTINGS_KEY));
            const migratedSecret = localStorage.getItem(`writingway:secret:${storage.API_KEY_SECRET_KEY}`);

            const previousTauri = window.__TAURI__;
            const previousTauriIpc = window.__TAURI_IPC__;
            const nativeStore = {};
            const nativeCalls = [];
            window.__TAURI__ = {
                core: {
                    invoke: async (command, payload) => {
                        nativeCalls.push({ command, payload: Object.assign({}, payload) });
                        if (command === 'writingway2_save_secret') {
                            nativeStore[payload.key] = payload.value;
                            return null;
                        }
                        if (command === 'writingway2_load_secret') {
                            return nativeStore[payload.key] || '';
                        }
                        if (command === 'writingway2_delete_secret') {
                            delete nativeStore[payload.key];
                            return null;
                        }
                        throw new Error(`Unexpected command: ${command}`);
                    }
                }
            };

            let nativeLoaded;
            let nativeAfterDelete;
            let nativeSettings;
            let nativeSettingsLoadedKey;
            try {
                localStorage.clear();
                await window.PlatformAdapter.saveSecret(storage.API_KEY_SECRET_KEY, 'sk-native-secret');
                nativeLoaded = await window.PlatformAdapter.loadSecret(storage.API_KEY_SECRET_KEY);
                await window.PlatformAdapter.deleteSecret(storage.API_KEY_SECRET_KEY);
                nativeAfterDelete = await window.PlatformAdapter.loadSecret(storage.API_KEY_SECRET_KEY);

                const nativeApp = makeApp({ aiApiKey: 'sk-native-settings-secret' });
                await window.AISettings.saveGenerationParams(nativeApp);
                nativeSettings = JSON.parse(localStorage.getItem(storage.SETTINGS_KEY));

                const loadedNativeApp = makeApp();
                await window.AISettings.loadAISettings(loadedNativeApp);
                nativeSettingsLoadedKey = loadedNativeApp.aiApiKey;
            } finally {
                if (previousTauri === undefined) {
                    delete window.__TAURI__;
                } else {
                    window.__TAURI__ = previousTauri;
                }
                if (previousTauriIpc === undefined) {
                    delete window.__TAURI_IPC__;
                } else {
                    window.__TAURI_IPC__ = previousTauriIpc;
                }
            }

            return {
                browserSettingsHasApiKey: Object.prototype.hasOwnProperty.call(browserSettings, 'apiKey'),
                browserSettingsText: JSON.stringify(browserSettings),
                browserSecret,
                loadedBrowserKey: loadedBrowserApp.aiApiKey,
                migratedSettingsHasApiKey: Object.prototype.hasOwnProperty.call(migratedSettings, 'apiKey'),
                migratedSettingsText: JSON.stringify(migratedSettings),
                migratedSecret,
                legacyLoadedKey: legacyApp.aiApiKey,
                nativeLoaded,
                nativeAfterDelete,
                nativeSettingsHasApiKey: Object.prototype.hasOwnProperty.call(nativeSettings, 'apiKey'),
                nativeSettingsText: JSON.stringify(nativeSettings),
                nativeSettingsLoadedKey,
                nativeLocalStorageSecret: localStorage.getItem(`writingway:secret:${storage.API_KEY_SECRET_KEY}`),
                nativeCommands: nativeCalls.map(call => call.command)
            };
        });

        const checks = [
            { ok: result.browserSettingsHasApiKey === false, msg: 'browser settings JSON should not contain apiKey' },
            { ok: !result.browserSettingsText.includes('sk-browser-secret'), msg: 'browser settings JSON leaked API key' },
            { ok: result.browserSecret === 'sk-browser-secret', msg: 'browser secret was not saved through PlatformAdapter' },
            { ok: result.loadedBrowserKey === 'sk-browser-secret', msg: 'browser secret was not loaded into app state' },
            { ok: result.migratedSettingsHasApiKey === false, msg: 'legacy apiKey was not removed from settings JSON' },
            { ok: !result.migratedSettingsText.includes('sk-legacy-secret'), msg: 'legacy settings JSON still contains API key' },
            { ok: result.migratedSecret === 'sk-legacy-secret', msg: 'legacy API key was not migrated to secret storage' },
            { ok: result.legacyLoadedKey === 'sk-legacy-secret', msg: 'legacy API key did not load into app state' },
            { ok: result.nativeLoaded === 'sk-native-secret', msg: 'native PlatformAdapter secret did not round-trip' },
            { ok: result.nativeAfterDelete === '', msg: 'native PlatformAdapter secret was not deleted' },
            { ok: result.nativeSettingsHasApiKey === false, msg: 'native settings JSON should not contain apiKey' },
            { ok: !result.nativeSettingsText.includes('sk-native-settings-secret'), msg: 'native settings JSON leaked API key' },
            { ok: result.nativeSettingsLoadedKey === 'sk-native-settings-secret', msg: 'native AISettings did not load secret into app state' },
            { ok: result.nativeLocalStorageSecret === null, msg: 'Tauri mode wrote API key to localStorage secret fallback' },
            { ok: result.nativeCommands.includes('writingway2_save_secret'), msg: 'native save command was not called' },
            { ok: result.nativeCommands.includes('writingway2_load_secret'), msg: 'native load command was not called' },
            { ok: result.nativeCommands.includes('writingway2_delete_secret'), msg: 'native delete command was not called' }
        ];

        const leaks = consoleMessages.filter(text => (
            text.includes('sk-browser-secret') ||
            text.includes('sk-legacy-secret') ||
            text.includes('sk-native-secret') ||
            text.includes('sk-native-settings-secret')
        ));
        checks.push({ ok: leaks.length === 0, msg: `API key was written to console: ${leaks.join(' | ')}` });

        const failed = checks.filter(check => !check.ok);
        if (failed.length > 0) {
            console.error('AI settings secret storage test failed:');
            for (const failure of failed) console.error(' -', failure.msg);
            await browser.close();
            process.exit(2);
        }

        console.log('AI settings secret storage test passed.');
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('AI settings secret storage test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
