const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const projectRoot = path.resolve(__dirname, '..');
    const fileUrl = process.env.APP_URL || ('file:///' + path.join(projectRoot, 'main.html').replace(/\\/g, '/'));

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => window.DataManagement && window.DataManagement._test && window.PlatformAdapter && window.db, { timeout: 5000 });

        const result = await page.evaluate(async () => {
            await db.delete();
            await db.open();

            const dm = window.DataManagement._test;
            const emptyAll = dm.makeEnvelope('all', await dm.collectAllData());
            dm.assertEnvelope(emptyAll, 'all');
            if (emptyAll.format !== dm.FORMAT || emptyAll.version !== dm.VERSION || emptyAll.scope !== 'all') {
                throw new Error('all-data envelope metadata is wrong');
            }
            if (!Array.isArray(emptyAll.data.projects) || emptyAll.data.projects.length !== 0) {
                throw new Error('empty export should include an empty projects table');
            }

            const p1 = { id: 'p1', name: 'One', created: new Date(), modified: new Date() };
            const p2 = { id: 'p2', name: 'Two', created: new Date(), modified: new Date() };
            const c1 = { id: 'c1', projectId: 'p1', title: 'Chapter', order: 0, created: new Date(), modified: new Date() };
            const s1 = { id: 's1', projectId: 'p1', chapterId: 'c1', title: 'Scene', order: 0, created: new Date(), modified: new Date() };
            await db.projects.bulkAdd([p1, p2]);
            await db.chapters.add(c1);
            await db.scenes.add(s1);
            await db.content.add({ sceneId: 's1', text: 'Hello world', wordCount: 2 });
            await db.prompts.add({ id: 'pr1', projectId: 'p1', category: 'prose', title: 'Prompt', created: new Date(), modified: new Date() });
            await db.promptHistory.add({ id: 'h1', projectId: 'p1', sceneId: 's1', timestamp: Date.now(), beat: 'brief', prompt: 'prompt' });
            await db.compendium.add({ id: 'comp1', projectId: 'p1', category: 'notes', title: 'Note', content: 'Body', modified: new Date() });
            await db.workshopSessions.add({ id: 'w1', projectId: 'p1', name: 'Chat', messages: [], createdAt: Date.now(), updatedAt: Date.now() });
            await db.beatTemplates.add({ id: 'legacy-template', name: 'Legacy Template', builtIn: false, slots: ['Start', 'End'] });
            await db.plotPlans.add({
                id: 'pp1',
                projectId: 'p1',
                templateId: 'legacy-template',
                name: 'Manual Plan',
                status: 'draft',
                premise: 'A test premise',
                medium: 'novel',
                source: 'user',
                beats: [
                    { id: 'pb1', slotId: 'start', slotTitle: 'Start', title: 'Opening', summary: 'Open with a decision.', selected: true }
                ],
                aiRunId: 'ar1',
                created: new Date(),
                modified: new Date(),
                updatedAt: Date.now()
            });
            await db.aiRuns.add({
                id: 'ar1',
                projectId: 'p1',
                sceneId: 's1',
                templateId: 'legacy-template',
                plotPlanId: 'pp1',
                task: 'plot.generate',
                provider: 'mock',
                model: 'mock-model',
                status: 'completed',
                created: new Date(),
                updatedAt: Date.now()
            });
            await db.userPreferences.add({
                id: 'pref1',
                scope: 'project',
                projectId: 'p1',
                key: 'plot.instructions',
                value: 'Prefer detailed inner arcs.',
                source: 'explicit',
                created: new Date(),
                updatedAt: Date.now()
            });
            await db.tuningEvents.add({
                id: 'te1',
                projectId: 'p1',
                task: 'plot.generate',
                source: 'plotPlanAccepted',
                decision: 'accepted',
                targetType: 'plotPlan',
                targetId: 'pp1',
                templateId: 'legacy-template',
                plotPlanId: 'pp1',
                aiRunId: 'ar1',
                summary: { title: 'Manual Plan', beatCount: 1 },
                inference: { key: 'plot.reviewedPlan', confidence: 0.7 },
                created: new Date(),
                updatedAt: Date.now()
            });
            await db.beats.add({
                id: 'b1',
                projectId: 'p1',
                chapterId: 'c1',
                sceneId: 's1',
                scope: 'project',
                title: 'Opening',
                body: 'Open with a decision.',
                order: 0,
                status: 'planned',
                templateId: 'legacy-template',
                templateSlotId: 'start',
                plotPlanId: 'pp1',
                plotPlanBeatId: 'pb1',
                created: new Date(),
                modified: new Date()
            });

            const all = await dm.collectAllData();
            if (all.projects.length !== 2 || all.scenes.length !== 1 || all.content.length !== 1 || all.plotPlans.length !== 1 || all.aiRuns.length !== 1 || all.userPreferences.length !== 1 || all.tuningEvents.length !== 1) {
                throw new Error('all-data export missed table rows');
            }
            if (!all.beatTemplates[0] || all.beatTemplates[0].version !== 2 || all.beatTemplates[0].slots[0].id !== 'start') {
                throw new Error('all-data export should normalize legacy beat templates');
            }
            if (all.plotPlans[0].beats[0].slotId !== 'start' || all.aiRuns[0].plotPlanId !== 'pp1') {
                throw new Error('all-data export missed plot planning fields');
            }

            const project = await dm.collectProjectData('p1');
            const projectEnvelope = dm.makeEnvelope('project', project);
            dm.assertEnvelope(projectEnvelope, 'project');
            if (project.projects.length !== 1 || project.projects[0].id !== 'p1') {
                throw new Error('project export missed project row');
            }
            if (project.content[0].sceneId !== 's1' || project.prompts.length !== 1 || project.workshopSessions.length !== 1) {
                throw new Error('project export missed related rows');
            }
            if (!project.beatTemplates[0] || project.beatTemplates[0].version !== 2) {
                throw new Error('project export should include normalized beat templates');
            }
            if (project.plotPlans.length !== 1 || project.aiRuns.length !== 1 || project.beats[0].plotPlanId !== 'pp1' || project.userPreferences.length !== 1 || project.tuningEvents.length !== 1) {
                throw new Error('project export missed plot planning or preference rows');
            }

            const remapped = dm.remapProjectData(project).data;
            if (remapped.projects[0].id === 'p1' || remapped.scenes[0].id === 's1') {
                throw new Error('project import should generate new ids');
            }
            if (remapped.scenes[0].projectId !== remapped.projects[0].id) {
                throw new Error('remapped scene projectId is wrong');
            }
            if (remapped.content[0].sceneId !== remapped.scenes[0].id) {
                throw new Error('remapped content sceneId is wrong');
            }
            if (remapped.beatTemplates[0].version !== 2 || remapped.beatTemplates[0].slots[0].id !== 'start') {
                throw new Error('project import remap should preserve normalized beat templates');
            }
            if (remapped.plotPlans[0].id === 'pp1' || remapped.plotPlans[0].projectId !== remapped.projects[0].id) {
                throw new Error('project import should remap plot plan ids and projectId');
            }
            if (remapped.aiRuns[0].id === 'ar1' || remapped.aiRuns[0].projectId !== remapped.projects[0].id) {
                throw new Error('project import should remap AI run ids and projectId');
            }
            if (remapped.aiRuns[0].plotPlanId !== remapped.plotPlans[0].id || remapped.beats[0].plotPlanId !== remapped.plotPlans[0].id) {
                throw new Error('project import should remap plot plan references');
            }
            if (remapped.aiRuns[0].sceneId !== remapped.scenes[0].id) {
                throw new Error('project import should remap AI run scene references');
            }
            if (remapped.userPreferences[0].id === 'pref1' || remapped.userPreferences[0].projectId !== remapped.projects[0].id || remapped.userPreferences[0].key !== 'plot.instructions') {
                throw new Error('project import should remap user preference ids and projectId');
            }
            if (remapped.tuningEvents[0].id === 'te1' || remapped.tuningEvents[0].projectId !== remapped.projects[0].id || remapped.tuningEvents[0].plotPlanId !== remapped.plotPlans[0].id || remapped.tuningEvents[0].targetId !== remapped.plotPlans[0].id) {
                throw new Error('project import should remap tuning event ids and plot plan references');
            }

            const importedProjectId = await dm.addProjectData(project);
            const importedPlans = await db.plotPlans.where('projectId').equals(importedProjectId).toArray();
            const importedRuns = await db.aiRuns.where('projectId').equals(importedProjectId).toArray();
            const importedBeats = await db.beats.where('projectId').equals(importedProjectId).toArray();
            const importedPrefs = await db.userPreferences.where('projectId').equals(importedProjectId).toArray();
            const importedEvents = await db.tuningEvents.where('projectId').equals(importedProjectId).toArray();
            if (importedPlans.length !== 1 || importedRuns.length !== 1 || importedBeats.length !== 1 || importedPrefs.length !== 1 || importedEvents.length !== 1) {
                throw new Error('project import should persist plot plans, AI runs, converted beats, and preferences');
            }
            if (importedRuns[0].plotPlanId !== importedPlans[0].id || importedBeats[0].plotPlanId !== importedPlans[0].id) {
                throw new Error('persisted project import should keep remapped plot plan references');
            }
            if (importedEvents[0].plotPlanId !== importedPlans[0].id || importedEvents[0].targetId !== importedPlans[0].id) {
                throw new Error('persisted project import should keep remapped tuning event references');
            }

            const originalDownloadJson = window.PlatformAdapter.downloadJson;
            const downloads = [];
            window.PlatformAdapter.downloadJson = async (filename, data) => {
                downloads.push({ filename, data });
            };
            try {
                await window.DataManagement.exportCurrentProject({
                    currentProject: p1,
                    t(key) { return key; }
                });
                await window.DataManagement.exportAllData({
                    t(key) { return key; }
                });
            } finally {
                window.PlatformAdapter.downloadJson = originalDownloadJson;
            }
            if (downloads.length !== 2) {
                throw new Error('JSON exports should route through PlatformAdapter.downloadJson');
            }
            if (!downloads[0].filename.includes('writingway2_project_One_') || downloads[0].data.scope !== 'project') {
                throw new Error('project JSON export did not pass the expected PlatformAdapter payload');
            }
            if (!downloads[1].filename.includes('writingway2_all_') || downloads[1].data.scope !== 'all') {
                throw new Error('all-data JSON export did not pass the expected PlatformAdapter payload');
            }

            const previousTauri = window.__TAURI__;
            const previousTauriIpc = window.__TAURI_IPC__;
            const nativeWrites = [];
            let saveOptions = null;
            let openOptions = null;
            window.__TAURI__ = {
                core: {
                    invoke: async (command, args, options) => {
                        if (command === 'plugin:dialog|save') {
                            saveOptions = args.options;
                            return '/tmp/writingway-native-export.json';
                        }
                        if (command === 'plugin:dialog|open') {
                            openOptions = args.options;
                            return '/tmp/writingway-native-import.json';
                        }
                        if (command === 'plugin:fs|write_text_file') {
                            nativeWrites.push({
                                filePath: decodeURIComponent(options.headers.path),
                                contents: new TextDecoder().decode(args)
                            });
                            return null;
                        }
                        if (command === 'plugin:fs|read_text_file') {
                            if (args.path !== '/tmp/writingway-native-import.json') {
                                throw new Error('native import used the wrong path');
                            }
                            return new TextEncoder().encode(JSON.stringify(projectEnvelope));
                        }
                        throw new Error(`unexpected native command ${command}`);
                    }
                },
                dialog: null,
                fs: null
            };
            try {
                if (window.PlatformAdapter.kind !== 'tauri' || !window.PlatformAdapter.hasTauriFileApi()) {
                    throw new Error('mock Tauri native file APIs were not detected');
                }
                const nativeSave = await window.PlatformAdapter.downloadJson('Native Export?.json', { ok: true });
                if (!nativeSave || nativeSave.path !== '/tmp/writingway-native-export.json') {
                    throw new Error('native JSON export did not return the saved path');
                }
                if (!saveOptions || saveOptions.filters[0].extensions[0] !== 'json' || nativeWrites.length !== 1 || !nativeWrites[0].contents.includes('"ok": true')) {
                    throw new Error('native JSON export did not use save dialog and text write');
                }
                const nativeEnvelope = await window.PlatformAdapter.openJsonFile();
                if (!nativeEnvelope || nativeEnvelope.scope !== 'project' || !openOptions || openOptions.filters[0].extensions[0] !== 'json') {
                    throw new Error('native JSON import did not use open dialog and text read');
                }
                const adapterEnvelope = await dm.readJsonInput();
                if (!adapterEnvelope || adapterEnvelope.scope !== 'project') {
                    throw new Error('Data Management did not use PlatformAdapter for native import');
                }
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

            nativeWrites.length = 0;
            saveOptions = null;
            openOptions = null;
            window.__TAURI__ = {
                dialog: {
                    save: async (options) => {
                        saveOptions = options;
                        return '/tmp/writingway-native-export.json';
                    },
                    open: async (options) => {
                        openOptions = options;
                        return '/tmp/writingway-native-import.json';
                    }
                },
                fs: {
                    writeTextFile: async (filePath, contents) => {
                        nativeWrites.push({ filePath, contents });
                    },
                    readTextFile: async (filePath) => {
                        if (filePath !== '/tmp/writingway-native-import.json') {
                            throw new Error('native import used the wrong path');
                        }
                        return JSON.stringify(projectEnvelope);
                    }
                }
            };
            try {
                if (window.PlatformAdapter.kind !== 'tauri' || !window.PlatformAdapter.hasTauriFileApi()) {
                    throw new Error('mock Tauri native file APIs were not detected');
                }
                const nativeSave = await window.PlatformAdapter.downloadJson('Native Export?.json', { ok: true });
                if (!nativeSave || nativeSave.path !== '/tmp/writingway-native-export.json') {
                    throw new Error('native JSON export did not return the saved path');
                }
                if (!saveOptions || saveOptions.filters[0].extensions[0] !== 'json' || nativeWrites.length !== 1 || !nativeWrites[0].contents.includes('"ok": true')) {
                    throw new Error('native JSON export did not use save dialog and text write');
                }
                const nativeEnvelope = await window.PlatformAdapter.openJsonFile();
                if (!nativeEnvelope || nativeEnvelope.scope !== 'project' || !openOptions || openOptions.filters[0].extensions[0] !== 'json') {
                    throw new Error('native JSON import did not use open dialog and text read');
                }
                const adapterEnvelope = await dm.readJsonInput();
                if (!adapterEnvelope || adapterEnvelope.scope !== 'project') {
                    throw new Error('Data Management did not use PlatformAdapter for native import');
                }
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

            let rejected = false;
            try {
                dm.assertEnvelope({ format: 'wrong', version: 1, scope: 'all', data: {} }, 'all');
            } catch (error) {
                rejected = true;
            }
            if (!rejected) throw new Error('invalid format should be rejected');

            return {
                tables: Object.keys(all).length,
                projectRows: project.scenes.length + project.content.length + project.prompts.length
            };
        });

        console.log('Data management unit test passed:', JSON.stringify(result));
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Data management unit test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
