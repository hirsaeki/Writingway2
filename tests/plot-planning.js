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
        await page.waitForFunction(() => (
            window.PlotPlanning &&
            window.Beats &&
            window.DataManagement &&
            window.db
        ), { timeout: 5000 });

        const result = await page.evaluate(async () => {
            await db.delete();
            await db.open();
            if (db.verno !== 13) throw new Error(`expected Dexie v13, got v${db.verno}`);

            const project = { id: 'p-plot', name: 'Plot Project', created: new Date(), modified: new Date() };
            const chapter = { id: 'c-plot', projectId: project.id, title: 'Chapter', order: 0, created: new Date(), modified: new Date() };
            const scene = { id: 's-plot', projectId: project.id, chapterId: chapter.id, title: 'Scene', order: 0, created: new Date(), modified: new Date() };
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
                showPlotPlanningPanel: false,
                showBeatsPanel: false,
                plotPlans: [],
                currentPlotPlanId: '',
                currentPlotPlanCreated: null,
                plotPlanTemplateId: '',
                plotPlanName: '',
                plotPlanStatus: 'draft',
                plotPlanPremise: '',
                plotPlanGenre: '',
                plotPlanTargetLength: '',
                plotPlanTone: '',
                plotPlanMedium: 'novel',
                plotPlanCards: [],
                newPlotPlanCardTitle: '',
                newPlotPlanCardSummary: '',
                t(key, params, fallback) {
                    return fallback || key;
                }
            };

            await window.PlotPlanning.open(app);
            if (!app.showPlotPlanningPanel || app.showBeatsPanel) {
                throw new Error('plot planning panel did not open cleanly');
            }
            if (app.beatTemplates.length < 5) throw new Error('plot planning did not load beat templates');

            app.plotPlanTemplateId = 'preset-save-the-cat-bs2-v2';
            app.plotPlanPremise = 'A cartographer must redraw a city before it erases itself.';
            app.plotPlanGenre = 'fantasy';
            app.plotPlanTone = 'tense';
            const draft = await window.PlotPlanning.createDraftFromTemplate(app);
            if (!draft || app.plotPlanCards.length !== 15) {
                throw new Error('BS2 plot draft should create 15 cards');
            }
            if (app.plotPlanCards[0].slotId !== 'opening-image' || app.plotPlanCards[14].slotId !== 'final-image') {
                throw new Error('plot draft did not preserve stable template slot ids');
            }

            app.newPlotPlanCardTitle = 'Manual Bridge';
            app.newPlotPlanCardSummary = 'A manually added connective beat.';
            const manualCard = window.PlotPlanning.addCard(app);
            if (!manualCard || app.plotPlanCards.length !== 16) {
                throw new Error('manual plot card was not added');
            }
            window.PlotPlanning.removeCard(app, manualCard.id);
            if (app.plotPlanCards.length !== 15) throw new Error('manual plot card was not removed');

            app.plotPlanName = 'City Map Plan';
            const saved = await window.PlotPlanning.savePlan(app);
            const stored = await db.plotPlans.get(saved.id);
            if (!stored || stored.projectId !== project.id || stored.beats.length !== 15) {
                throw new Error('plot plan was not saved to Dexie');
            }

            window.PlotPlanning.clearDraft(app);
            const loaded = await window.PlotPlanning.loadPlan(app, saved.id);
            if (!loaded || app.plotPlanName !== 'City Map Plan' || app.plotPlanCards.length !== 15) {
                throw new Error('plot plan did not load back into UI state');
            }

            let invalidRejected = false;
            const invalidApp = {
                ...app,
                currentPlotPlanId: '',
                plotPlanName: 'Invalid Plan',
                plotPlanPremise: '',
                plotPlanTemplateId: 'preset-save-the-cat-bs2-v2',
                plotPlanCards: [
                    { id: 'bad-card', slotId: 'opening-image', slotTitle: 'Opening Image', title: 'Opening', summary: '' }
                ]
            };
            try {
                await window.PlotPlanning.savePlan(invalidApp);
            } catch (error) {
                invalidRejected = /premise|summary|invalid/i.test(error.message || String(error));
            }
            if (!invalidRejected) throw new Error('invalid plot plan should not be saved');

            app.plotPlanCards = app.plotPlanCards.map((card, index) => ({ ...card, selected: index < 2 }));
            const converted = await window.PlotPlanning.saveSelectedAsBeats(app);
            if (converted.length !== 2) throw new Error('selected plot cards were not converted to beats');
            const convertedRows = await db.beats.where('projectId').equals(project.id).sortBy('order');
            if (convertedRows.length !== 2 || convertedRows[0].plotPlanId !== saved.id || convertedRows[0].templateSlotId !== 'opening-image') {
                throw new Error('converted beats did not preserve plot plan/template metadata');
            }

            await db.aiRuns.add({
                id: 'ar-plot',
                projectId: project.id,
                sceneId: scene.id,
                templateId: 'preset-save-the-cat-bs2-v2',
                plotPlanId: saved.id,
                task: 'plot.generate',
                provider: 'mock',
                model: 'mock-model',
                status: 'completed',
                created: new Date(),
                updatedAt: Date.now()
            });
            await db.plotPlans.update(saved.id, { aiRunId: 'ar-plot' });

            const dm = window.DataManagement._test;
            const projectData = await dm.collectProjectData(project.id);
            if (projectData.plotPlans.length !== 1 || projectData.aiRuns.length !== 1 || projectData.beats.length !== 2) {
                throw new Error('project export missed plot planning data');
            }

            const importedProjectId = await dm.addProjectData(projectData);
            const importedPlans = await db.plotPlans.where('projectId').equals(importedProjectId).toArray();
            const importedRuns = await db.aiRuns.where('projectId').equals(importedProjectId).toArray();
            const importedBeats = await db.beats.where('projectId').equals(importedProjectId).toArray();
            if (importedPlans.length !== 1 || importedRuns.length !== 1 || importedBeats.length !== 2) {
                throw new Error('project import did not persist plot planning data');
            }
            if (importedPlans[0].id === saved.id || importedRuns[0].plotPlanId !== importedPlans[0].id) {
                throw new Error('project import did not remap plot plan references');
            }
            if (importedBeats.some(beat => beat.plotPlanId !== importedPlans[0].id)) {
                throw new Error('project import did not remap converted beat references');
            }

            return {
                verno: db.verno,
                draftCards: draft.beats.length,
                savedPlans: await db.plotPlans.count(),
                convertedBeats: convertedRows.length,
                importedPlans: importedPlans.length,
                importedRuns: importedRuns.length
            };
        });

        console.log('Plot planning unit test passed:', JSON.stringify(result));
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Plot planning unit test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
