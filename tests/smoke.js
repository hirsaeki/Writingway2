const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const projectRoot = path.resolve(__dirname, '..');
    const fileUrl = process.env.APP_URL || ('file:///' + path.join(projectRoot, 'main.html').replace(/\\/g, '/'));

    console.log('Opening:', fileUrl);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });

        // Wait for the app container to appear (Alpine should render it)
        await page.waitForSelector('.app-container, .welcome-screen', { timeout: 10000 });

        const dependencyStatus = await page.evaluate(() => ({
            dexie: typeof window.Dexie,
            jszip: typeof window.JSZip,
            platformAdapter: window.PlatformAdapter && window.PlatformAdapter.kind,
            tauriDetection: (() => {
                const previous = window.__TAURI_IPC__;
                window.__TAURI_IPC__ = function () {};
                const detected = window.PlatformAdapter && window.PlatformAdapter.kind;
                if (previous === undefined) {
                    delete window.__TAURI_IPC__;
                } else {
                    window.__TAURI_IPC__ = previous;
                }
                return detected;
            })(),
            externalScripts: Array.from(document.scripts)
                .map(script => script.getAttribute('src') || '')
                .filter(src => /^https?:\/\//i.test(src))
        }));
        if (dependencyStatus.dexie !== 'function' || dependencyStatus.jszip !== 'function') {
            console.error('ERROR: local Dexie/JSZip vendor scripts did not load', dependencyStatus);
            await browser.close();
            process.exit(2);
        }
        if (dependencyStatus.platformAdapter !== 'browser') {
            console.error('ERROR: browser PlatformAdapter did not load', dependencyStatus);
            await browser.close();
            process.exit(2);
        }
        if (dependencyStatus.tauriDetection !== 'tauri') {
            console.error('ERROR: PlatformAdapter Tauri detection did not work', dependencyStatus);
            await browser.close();
            process.exit(2);
        }
        if (dependencyStatus.externalScripts.length > 0) {
            console.error('ERROR: external script dependencies found:', dependencyStatus.externalScripts);
            await browser.close();
            process.exit(2);
        }

        // Check for generate button OR welcome screen (app may open with no project)
        const gen = await page.$('.generate-btn');
        const welcome = await page.$('.welcome-screen');
        if (!gen && !welcome) {
            console.error('ERROR: neither generate button nor welcome screen found');
            await browser.close();
            process.exit(2);
        }

        // Give time for any async scripts (Dexie init) to log errors
        await page.waitForTimeout(1200);

        if (consoleErrors.length > 0) {
            console.error('Console errors were detected:');
            for (const e of consoleErrors) console.error('  -', e);
            await browser.close();
            process.exit(3);
        }

        // Quick smoke: open prompts panel
        const promptsBtn = await page.$('button[title="Scene options"], button.btn-secondary');
        // Not strict here — just ensure page is interactive

        console.log('Smoke test passed: page loaded, elements present, no console errors.');
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Smoke test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
