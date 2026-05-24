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

        // Wait for Generation to be available
        await page.waitForFunction(() => window.Generation && typeof window.Generation.buildPrompt === 'function', { timeout: 5000 });

        const brief = "She grabs her coat and steps into the rain.";
        const sceneContext = "Alice sat by the window, watching the streetlights.";
        const options = { povCharacter: 'Alice', pov: '1st person', tense: 'present' };

        const prompt = await page.evaluate(({ b, s, o }) => {
            return window.Generation.buildPrompt(b, s, o);
        }, { b: brief, s: sceneContext, o: options });

        console.log('Generated prompt preview (first 200 chars):', prompt.slice(0, 200).replace(/\n/g, '\\n'));

        const checks = [
            { ok: prompt.includes('Alice'), msg: 'POV character not found' },
            { ok: prompt.includes('present tense'), msg: 'tense text not found' },
            { ok: prompt.includes('1st person'), msg: 'POV text not found' },
            { ok: prompt.includes('BRIEF TO EXPAND') || prompt.includes('BRIEF TO EXPAND:'), msg: 'brief marker missing' },
            { ok: prompt.includes('She grabs her coat'), msg: 'brief content not included' }
        ];

        const failed = checks.filter(c => !c.ok);
        if (failed.length > 0) {
            console.error('Unit test failed:');
            for (const f of failed) console.error(' -', f.msg);
            await browser.close();
            process.exit(2);
        }

        console.log('Generation.buildPrompt unit test passed.');
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Unit test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
