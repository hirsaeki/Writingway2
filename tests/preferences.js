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
            window.Preferences &&
            window.PlotPlanning &&
            window.Beats &&
            window.DataManagement &&
            window.AIOrchestrator &&
            window.db
        ), { timeout: 5000 });

        const result = await page.evaluate(async () => {
            await db.delete();
            await db.open();
            if (db.verno !== 14) throw new Error(`expected Dexie v14, got v${db.verno}`);

            const project = { id: 'p-preferences', name: 'Preferences Project', created: new Date(), modified: new Date() };
            await db.projects.add(project);

            const app = {
                currentProject: project,
                beats: [],
                beatTemplates: [],
                beatScopeFilter: 'all',
                selectedBeatTemplateId: 'preset-save-the-cat-bs2-v2',
                plotPlans: [],
                currentPlotPlanId: '',
                currentPlotPlanCreated: null,
                currentPlotPlanAiRunId: '',
                plotPlanTemplateId: 'preset-save-the-cat-bs2-v2',
                plotPlanName: '',
                plotPlanStatus: 'draft',
                plotPlanSource: 'user',
                plotPlanPremise: 'A detective maps a city where memories become evidence.',
                plotPlanGenre: 'mystery fantasy',
                plotPlanTargetLength: '80000 words',
                plotPlanTone: 'tense but humane',
                plotPlanMedium: 'novel',
                plotPlanCards: [],
                plotPlanIsGenerating: false,
                plotPlanGenerationError: '',
                plotPlanLastAiRunId: '',
                showTemplateCustomizationModal: false,
                templateCustomizationBaseId: '',
                templateCustomizationInstruction: '',
                templateCustomizationIsGenerating: false,
                templateCustomizationError: '',
                templateCustomizationDraft: null,
                templateCustomizationChangeSummary: [],
                templateCustomizationAiRunId: '',
                preferenceRows: [],
                tuningEvents: [],
                preferenceBeatDensity: 'detailed',
                preferencePlotGuidance: 'Prefer detailed inner arcs and clue payoffs.',
                preferenceTemplateDetail: 'compact',
                preferenceTemplateGuidance: 'Favor compact mystery templates with clear reveals.',
                preferenceDefaultTone: 'tense but humane',
                preferenceSummaryText: '',
                preferenceRequestSummary: null,
                aiMode: 'api',
                aiProvider: 'openai',
                aiApiKey: 'sk-secret-preferences-test',
                aiModel: 'gpt-preferences-test',
                aiEndpoint: '',
                temperature: 0.3,
                maxTokens: 300,
                useProviderDefaults: false,
                forceNonStreaming: false,
                t(key, params, fallback) {
                    return fallback || key;
                }
            };

            await window.Preferences.saveExplicitPreferences(app);
            if (app.preferenceRows.length !== 5 || !app.preferenceSummaryText.includes('detailed inner arcs')) {
                throw new Error('explicit preferences were not saved and summarized');
            }

            const plotSummary = await window.Preferences.buildPreferenceSummary(project.id, 'plot.generate');
            if (plotSummary.explicit.beatDensity !== 'detailed' || !plotSummary.text.includes('tense but humane')) {
                throw new Error('plot preference summary is missing explicit preferences');
            }

            await window.Beats.loadTemplates(app);
            const fullBs2 = await db.beatTemplates.get('preset-save-the-cat-bs2-v2');
            const generatedBeat = {
                slotId: 'opening-image',
                slotTitle: 'Opening Image',
                title: 'Memory Rain',
                summary: 'The detective watches memories fall as rain over a crime scene.',
                characterArc: 'She resists trusting emotional evidence.',
                conflict: 'The city archive wants the evidence erased.',
                sceneIdeas: ['Rain market'],
                openQuestions: [],
                tags: ['generated']
            };

            const originalRun = window.AIOrchestrator.run;
            let capturedPlotRequest = null;
            window.AIOrchestrator.run = async (request) => {
                capturedPlotRequest = request;
                return {
                    runId: 'mock-preference-plot',
                    outputJson: {
                        templateId: 'preset-save-the-cat-bs2-v2',
                        name: 'Preference Plot',
                        premise: app.plotPlanPremise,
                        genre: app.plotPlanGenre,
                        targetLength: app.plotPlanTargetLength,
                        tone: app.plotPlanTone,
                        medium: app.plotPlanMedium,
                        source: 'ai',
                        status: 'draft',
                        beats: [generatedBeat]
                    },
                    outputText: JSON.stringify({ beats: [generatedBeat] }),
                    usage: {}
                };
            };

            const generatedPlan = await window.PlotPlanning.generatePlotPlan(app);
            const plotRequestText = JSON.stringify(capturedPlotRequest.messages);
            if (!plotRequestText.includes('Local preference summary JSON') || !plotRequestText.includes('detailed inner arcs')) {
                throw new Error('plot generation request did not include preference summary');
            }
            const plotRun = await db.aiRuns.get(generatedPlan.aiRunId);
            if (!plotRun.requestSummary || plotRun.requestSummary.preferenceSummaryChars <= 0 || JSON.stringify(plotRun).includes(app.aiApiKey)) {
                throw new Error('plot AI run did not store safe preference metadata');
            }

            await window.PlotPlanning.recordPlotPlanDecision(app, 'rejected');
            await window.PlotPlanning.recordPlotPlanDecision(app, 'accepted');
            const plotEvents = await db.tuningEvents.where('projectId').equals(project.id).toArray();
            if (plotEvents.filter(event => event.targetType === 'plotPlan').length !== 2) {
                throw new Error('plot accept/reject events were not recorded');
            }

            let capturedTemplateRequest = null;
            function templateEnvelope(name) {
                return {
                    format: 'writingway2.beat-template',
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    template: {
                        id: `model-${name}`,
                        name,
                        version: 2,
                        builtIn: false,
                        source: 'aiCustomized',
                        baseTemplateId: fullBs2.id,
                        description: 'Compact mystery template.',
                        medium: 'novel',
                        tags: ['mystery'],
                        customization: {
                            instruction: app.templateCustomizationInstruction,
                            changeSummary: ['Tightened clue and reveal structure.']
                        },
                        slots: [
                            {
                                id: 'first-clue',
                                title: 'First Clue',
                                order: 0,
                                description: 'A clue that opens the mystery.',
                                purpose: 'Start the investigation with a concrete question.',
                                recommendedPosition: { percentStart: 0, percentEnd: 20 },
                                promptHint: 'Make the clue emotionally loaded.',
                                requiredInputs: ['mystery'],
                                outputSchema: null,
                                examples: []
                            }
                        ]
                    }
                };
            }

            window.AIOrchestrator.run = async (request) => {
                capturedTemplateRequest = request;
                return {
                    runId: 'mock-preference-template',
                    outputJson: templateEnvelope('Rejected Mystery Template'),
                    outputText: JSON.stringify(templateEnvelope('Rejected Mystery Template')),
                    usage: {}
                };
            };

            await window.Beats.openTemplateCustomization(app);
            app.templateCustomizationInstruction = 'Make BS2 compact for a mystery novella.';
            await window.Beats.generateTemplateCustomization(app);
            const templateRequestText = JSON.stringify(capturedTemplateRequest.messages);
            if (!templateRequestText.includes('Local preference summary JSON') || !templateRequestText.includes('compact mystery templates')) {
                throw new Error('template customization request did not include preference summary');
            }
            await window.Beats.rejectTemplateCustomization(app);

            window.AIOrchestrator.run = async (request) => {
                capturedTemplateRequest = request;
                return {
                    runId: 'mock-preference-template-save',
                    outputJson: templateEnvelope('Accepted Mystery Template'),
                    outputText: JSON.stringify(templateEnvelope('Accepted Mystery Template')),
                    usage: {}
                };
            };
            await window.Beats.openTemplateCustomization(app);
            app.templateCustomizationInstruction = 'Make BS2 compact for a mystery novella.';
            const acceptedDraft = await window.Beats.generateTemplateCustomization(app);
            const savedTemplate = await window.Beats.saveCustomizedTemplate(app);
            if (!acceptedDraft || !savedTemplate || savedTemplate.source !== 'aiCustomized') {
                throw new Error('accepted customized template was not saved');
            }

            const allEvents = await db.tuningEvents.where('projectId').equals(project.id).toArray();
            const templateEvents = allEvents.filter(event => event.targetType === 'beatTemplate');
            if (templateEvents.length !== 2 || !templateEvents.some(event => event.decision === 'accepted') || !templateEvents.some(event => event.decision === 'rejected')) {
                throw new Error('template accept/reject events were not recorded');
            }

            const learnedSummary = await window.Preferences.buildPreferenceSummary(project.id, 'template.customize');
            if (learnedSummary.learned.counts.acceptedPlotPlans !== 1 || learnedSummary.learned.counts.rejectedTemplates !== 1) {
                throw new Error('preference summary did not include learned event counts');
            }

            const projectData = await window.DataManagement._test.collectProjectData(project.id);
            if (projectData.userPreferences.length !== 5 || projectData.tuningEvents.length !== 4) {
                throw new Error('project export did not include preference tuning data');
            }

            await window.Preferences.resetProject(app);
            if (await db.userPreferences.where('projectId').equals(project.id).count() !== 0 || await db.tuningEvents.where('projectId').equals(project.id).count() !== 0) {
                throw new Error('preference reset did not clear project tuning data');
            }

            window.AIOrchestrator.run = originalRun;

            return {
                preferencesExported: projectData.userPreferences.length,
                eventsExported: projectData.tuningEvents.length,
                plotPreferenceChars: plotRun.requestSummary.preferenceSummaryChars,
                savedTemplateSource: savedTemplate.source
            };
        });

        console.log('Preferences unit test passed:', JSON.stringify(result));
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Preferences unit test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
