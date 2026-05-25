const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const projectRoot = path.resolve(__dirname, '..');
    const fileUrl = process.env.APP_URL || ('file:///' + path.join(projectRoot, 'main.html').replace(/\\/g, '/'));

    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext()).newPage();

    try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => window.Beats && window.DataManagement && window.db, { timeout: 5000 });

        const result = await page.evaluate(async () => {
            await db.delete();
            await db.open();
            if (db.verno !== 13) throw new Error(`expected Dexie v13, got v${db.verno}`);
            const project = { id: 'p-beats', name: 'Beats', created: new Date(), modified: new Date() };
            const chapter = { id: 'c-beats', projectId: project.id, title: 'Chapter', order: 0, created: new Date(), modified: new Date() };
            const scene = { id: 's-beats', projectId: project.id, chapterId: chapter.id, title: 'Scene', order: 0, created: new Date(), modified: new Date() };
            await db.projects.add(project);
            await db.chapters.add(chapter);
            await db.scenes.add(scene);
            await db.content.add({ sceneId: scene.id, text: '', wordCount: 0 });

            const app = {
                currentProject: project,
                chapters: [chapter],
                scenes: [scene],
                beats: [],
                beatTemplates: [],
                beatScopeFilter: 'all',
                newBeatTitle: 'Opening image',
                newBeatBody: 'Establish the ordinary world.',
                newBeatScope: 'scene',
                newBeatChapterId: '',
                newBeatSceneId: scene.id,
                newBeatStatus: 'planned',
                selectedBeatTemplateId: ''
            };

            await window.Beats.createBeat(app);
            if (app.beats.length !== 1 || app.beats[0].sceneId !== scene.id) throw new Error('scene beat was not created');
            await window.Beats.updateBeatStatus(app, app.beats[0].id, 'drafted');
            if (app.beats[0].status !== 'drafted') throw new Error('beat status did not update');
            const refs = await window.Beats.getBeatReferencesForScene(scene.id);
            if (refs.length !== 1) throw new Error('scene beat reference not found');

            await window.Beats.loadTemplates(app);
            if (app.beatTemplates.length < 5) throw new Error('built-in templates missing');

            const normalizedFromStrings = window.Beats._test.normalizeTemplate({
                id: 'legacy-normalized',
                name: 'Legacy Normalized',
                slots: ['Duplicate', 'Duplicate']
            });
            if (normalizedFromStrings.version !== 2 || normalizedFromStrings.slots[0].id !== 'duplicate' || normalizedFromStrings.slots[1].id !== 'duplicate-2') {
                throw new Error('string slot normalization did not create stable unique ids');
            }

            const legacyPreset = app.beatTemplates.find(template => template.id === 'preset-save-the-cat');
            if (!legacyPreset || legacyPreset.slots.length !== 7 || legacyPreset.slots.some(slot => typeof slot !== 'object')) {
                throw new Error('legacy Save the Cat preset was not preserved as normalized v2');
            }

            const fullBs2 = app.beatTemplates.find(template => template.id === 'preset-save-the-cat-bs2-v2');
            if (!fullBs2 || fullBs2.version !== 2 || fullBs2.slots.length !== 15) {
                throw new Error('full BS2 v2 template missing or wrong slot count');
            }
            if (fullBs2.slots[0].id !== 'opening-image' || fullBs2.slots[14].id !== 'final-image') {
                throw new Error('full BS2 stable slot ids are wrong');
            }

            app.selectedBeatTemplateId = 'preset-save-the-cat-bs2-v2';
            await window.Beats.createBeatsFromTemplate(app);
            let allBeats = await db.beats.where('projectId').equals(project.id).sortBy('order');
            if (allBeats.length !== 16) throw new Error('full BS2 template did not create 15 beats');
            const firstTemplateBeat = allBeats.find(beat => beat.templateId === 'preset-save-the-cat-bs2-v2' && beat.templateSlotOrder === 0);
            if (!firstTemplateBeat || firstTemplateBeat.templateSlotId !== 'opening-image' || firstTemplateBeat.title !== 'Opening Image' || !firstTemplateBeat.body) {
                throw new Error('v2 template beat did not use stable slot metadata');
            }

            await db.beatTemplates.put({ id: 'legacy-string-template', name: 'Legacy String Template', builtIn: false, slots: ['Legacy Start', 'Legacy End'] });
            app.selectedBeatTemplateId = 'legacy-string-template';
            await window.Beats.createBeatsFromTemplate(app);
            allBeats = await db.beats.where('projectId').equals(project.id).sortBy('order');
            const legacyBeat = allBeats.find(beat => beat.templateId === 'legacy-string-template' && beat.templateSlotOrder === 0);
            if (!legacyBeat || legacyBeat.templateSlotId !== 'legacy-start' || legacyBeat.title !== 'Legacy Start') {
                throw new Error('legacy string-slot template did not create beats with stable ids');
            }

            app.newBeatTemplateName = 'Custom';
            app.newBeatTemplateSlots = 'A\nB';
            await window.Beats.createTemplate(app);
            const customTemplate = (await db.beatTemplates.toArray()).find(template => template.name === 'Custom');
            if (!customTemplate || customTemplate.version !== 2 || customTemplate.source !== 'custom' || customTemplate.slots.length !== 2 || customTemplate.slots.some(slot => typeof slot !== 'object')) {
                throw new Error('custom template was not created as v2');
            }

            const exportEnvelope = window.Beats._test.makeTemplateEnvelope(customTemplate);
            if (exportEnvelope.version !== 2 || exportEnvelope.template.version !== 2 || exportEnvelope.template.slots.some(slot => typeof slot !== 'object')) {
                throw new Error('template export did not default to v2');
            }

            const v1File = new File([JSON.stringify({
                format: 'writingway2.beat-template',
                version: 1,
                exportedAt: new Date().toISOString(),
                template: { id: 'old-v1', name: 'Imported v1', builtIn: true, slots: ['Arrival', 'Choice'] }
            })], 'v1-template.json', { type: 'application/json' });
            const importedV1 = await window.Beats.importTemplate(app, { target: { files: [v1File] } });
            if (!importedV1 || importedV1.version !== 2 || importedV1.source !== 'imported' || importedV1.builtIn !== false || importedV1.slots[0].id !== 'arrival') {
                throw new Error('v1 template import did not normalize to v2 imported template');
            }

            const v2File = new File([JSON.stringify(exportEnvelope)], 'v2-template.json', { type: 'application/json' });
            const importedV2 = await window.Beats.importTemplate(app, { target: { files: [v2File] } });
            if (!importedV2 || importedV2.version !== 2 || importedV2.id === customTemplate.id || importedV2.source !== 'imported') {
                throw new Error('v2 template import did not round-trip as a new imported template');
            }

            const exported = await window.DataManagement._test.collectProjectData(project.id);
            if (!exported.beats || exported.beats.length < 18 || !exported.beatTemplates || exported.beatTemplates.length < 8) {
                throw new Error('beats/templates missing from project export data');
            }
            if (exported.beatTemplates.some(template => template.version !== 2 || template.slots.some(slot => typeof slot !== 'object'))) {
                throw new Error('Data Management did not export normalized beat templates');
            }
            return { beats: exported.beats.length, templates: exported.beatTemplates.length, bs2Slots: fullBs2.slots.length };
        });

        console.log('Beats unit test passed:', JSON.stringify(result));
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Beats unit test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
