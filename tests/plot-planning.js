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
            if (db.verno !== 14) throw new Error(`expected Dexie v14, got v${db.verno}`);

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
                currentPlotPlanAiRunId: '',
                plotPlanTemplateId: '',
                plotPlanName: '',
                plotPlanStatus: 'draft',
                plotPlanSource: 'user',
                plotPlanPremise: '',
                plotPlanGenre: '',
                plotPlanTargetLength: '',
                plotPlanTone: '',
                plotPlanMedium: 'novel',
                plotPlanCards: [],
                newPlotPlanCardTitle: '',
                newPlotPlanCardSummary: '',
                plotPlanIsGenerating: false,
                plotPlanGenerationError: '',
                plotPlanLastAiRunId: '',
                aiMode: 'api',
                aiProvider: 'openai',
                aiApiKey: 'sk-secret-plot-test',
                aiModel: 'gpt-test',
                aiEndpoint: '',
                temperature: 0.4,
                maxTokens: 300,
                useProviderDefaults: false,
                forceNonStreaming: false,
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

            const originalRun = window.AIOrchestrator.run;
            const fullBs2 = await db.beatTemplates.get('preset-save-the-cat-bs2-v2');
            const fullBs2Slots = window.BeatTemplateService.normalizeTemplate(fullBs2).slots;
            const generatedBeats = fullBs2Slots.map(slot => ({
                slotId: slot.id,
                slotTitle: slot.title,
                title: `${slot.title} generated`,
                summary: `Generated summary for ${slot.title}.`,
                characterArc: `Arc for ${slot.title}.`,
                conflict: `Conflict for ${slot.title}.`,
                sceneIdeas: [`Scene for ${slot.title}`],
                openQuestions: [],
                tags: ['generated']
            }));
            let capturedRequest = null;
            let capturedSettings = null;
            window.AIOrchestrator.run = async (request, settings) => {
                capturedRequest = request;
                capturedSettings = settings;
                return {
                    runId: 'mock-run-success',
                    outputJson: {
                        templateId: 'preset-save-the-cat-bs2-v2',
                        name: 'Generated City Plan',
                        premise: app.plotPlanPremise,
                        genre: app.plotPlanGenre,
                        targetLength: app.plotPlanTargetLength,
                        tone: app.plotPlanTone,
                        medium: app.plotPlanMedium,
                        source: 'ai',
                        status: 'draft',
                        beats: generatedBeats
                    },
                    outputText: JSON.stringify({ beats: generatedBeats }),
                    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
                    provider: 'openai',
                    model: 'gpt-test'
                };
            };

            app.plotPlanName = '';
            app.plotPlanPremise = 'A cartographer must redraw a city before it erases itself.';
            app.plotPlanGenre = 'fantasy';
            app.plotPlanTargetLength = '90000 words';
            app.plotPlanTone = 'tense';
            app.plotPlanTemplateId = 'preset-save-the-cat-bs2-v2';
            const generated = await window.PlotPlanning.generatePlotPlan(app);
            if (!capturedRequest || capturedRequest.task !== 'plot.generate') {
                throw new Error('plot generation did not build a plot.generate AIRequest');
            }
            if (!capturedRequest.responseSchema || capturedRequest.responseSchema.$id !== window.AIStructuredOutput.schemas.plotPlan.$id) {
                throw new Error('plot generation did not request plot-plan structured output');
            }
            const requestText = JSON.stringify(capturedRequest.messages);
            if (!requestText.includes('opening-image') || !requestText.includes('final-image') || !requestText.includes('90000 words')) {
                throw new Error('plot generation request did not include normalized template slots and user inputs');
            }
            if (!capturedSettings || capturedSettings.apiKey !== app.aiApiKey || capturedSettings.provider !== 'openai') {
                throw new Error('plot generation did not pass current provider settings to the gateway');
            }
            if (!generated || generated.status !== 'draft' || generated.source !== 'ai' || generated.beats.length !== 15) {
                throw new Error('generated plot plan was not normalized as a draft AI plan');
            }
            if (app.plotPlanSource !== 'ai' || app.plotPlanCards.length !== 15 || app.plotPlanCards[0].slotId !== 'opening-image') {
                throw new Error('generated plot plan was not shown as editable cards');
            }
            if (await db.beats.where('projectId').equals(project.id).count() !== 0) {
                throw new Error('generated plot cards should not be saved as beats automatically');
            }
            const generatedRun = await db.aiRuns.get(generated.aiRunId);
            if (!generatedRun || generatedRun.status !== 'succeeded' || generatedRun.plotPlanId !== generated.id || generatedRun.task !== 'plot.generate') {
                throw new Error('successful AI plot run metadata was not stored');
            }
            const generatedRunText = JSON.stringify(generatedRun);
            if (generatedRunText.includes(app.aiApiKey) || generatedRunText.includes(app.plotPlanPremise) || generatedRunText.includes('Template JSON')) {
                throw new Error('AI run metadata should not store secrets or full prompts');
            }
            if (generatedRun.requestSummary.templateSlotCount !== 15 || generatedRun.responseSummary.beatCount !== 15) {
                throw new Error('AI run summaries should capture non-sensitive request/response metadata');
            }

            const planCountBeforeInvalid = await db.plotPlans.count();
            window.AIOrchestrator.run = async () => ({
                runId: 'mock-run-invalid',
                outputJson: {
                    templateId: 'preset-save-the-cat-bs2-v2',
                    name: 'Broken Generated Plan',
                    premise: 'Broken premise',
                    beats: [{ slotId: 'opening-image', slotTitle: 'Opening Image', title: 'Missing summary' }]
                },
                outputText: '{"broken":true}',
                usage: {}
            });
            let invalidAiRejected = false;
            app.plotPlanPremise = 'Broken premise that must not be stored in aiRuns';
            try {
                await window.PlotPlanning.generatePlotPlan(app);
            } catch (error) {
                invalidAiRejected = /schema|summary|required|invalid/i.test(error.message || String(error));
            }
            if (!invalidAiRejected) throw new Error('schema-invalid AI output should be rejected');
            if (await db.plotPlans.count() !== planCountBeforeInvalid) {
                throw new Error('schema-invalid AI output should not save a plot plan');
            }
            const failedRuns = (await db.aiRuns.where('projectId').equals(project.id).toArray()).filter(row => row.status === 'failed');
            if (failedRuns.length !== 1 || JSON.stringify(failedRuns[0]).includes('Broken premise that must not be stored')) {
                throw new Error('failed AI run metadata should be stored without raw output or full prompt text');
            }
            window.AIOrchestrator.run = originalRun;

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

            await window.PlotPlanning.loadPlan(app, saved.id);
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
            if (projectData.plotPlans.length !== 2 || projectData.aiRuns.length !== 3 || projectData.beats.length !== 2) {
                throw new Error('project export missed plot planning data');
            }

            const importedProjectId = await dm.addProjectData(projectData);
            const importedPlans = await db.plotPlans.where('projectId').equals(importedProjectId).toArray();
            const importedRuns = await db.aiRuns.where('projectId').equals(importedProjectId).toArray();
            const importedBeats = await db.beats.where('projectId').equals(importedProjectId).toArray();
            if (importedPlans.length !== 2 || importedRuns.length !== 3 || importedBeats.length !== 2) {
                throw new Error('project import did not persist plot planning data');
            }
            const importedPlanIds = new Set(importedPlans.map(plan => plan.id));
            const importedRunPlanIds = importedRuns.map(run => run.plotPlanId).filter(Boolean);
            if (importedPlans.some(plan => plan.id === saved.id) || importedRunPlanIds.some(planId => !importedPlanIds.has(planId))) {
                throw new Error('project import did not remap plot plan references');
            }
            const importedManualPlan = importedPlans.find(plan => plan.name === 'City Map Plan');
            if (!importedManualPlan || importedBeats.some(beat => beat.plotPlanId !== importedManualPlan.id)) {
                throw new Error('project import did not remap converted beat references');
            }

            return {
                verno: db.verno,
                draftCards: draft.beats.length,
                savedPlans: await db.plotPlans.count(),
                convertedBeats: convertedRows.length,
                importedPlans: importedPlans.length,
                importedRuns: importedRuns.length,
                generatedRunStatus: generatedRun.status
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
