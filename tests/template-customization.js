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
            window.Beats &&
            window.AIOrchestrator &&
            window.AIContracts &&
            window.AIStructuredOutput &&
            window.DataManagement &&
            window.db
        ), { timeout: 5000 });

        const result = await page.evaluate(async () => {
            await db.delete();
            await db.open();
            if (db.verno !== 14) throw new Error(`expected Dexie v14, got v${db.verno}`);

            const project = { id: 'p-template-customization', name: 'Template Customization', created: new Date(), modified: new Date() };
            await db.projects.add(project);

            const app = {
                currentProject: project,
                beats: [],
                beatTemplates: [],
                beatScopeFilter: 'all',
                selectedBeatTemplateId: 'preset-save-the-cat-bs2-v2',
                showTemplateCustomizationModal: false,
                templateCustomizationBaseId: '',
                templateCustomizationInstruction: '',
                templateCustomizationIsGenerating: false,
                templateCustomizationError: '',
                templateCustomizationDraft: null,
                templateCustomizationChangeSummary: [],
                templateCustomizationAiRunId: '',
                aiMode: 'api',
                aiProvider: 'openai',
                aiApiKey: 'sk-secret-template-test',
                aiModel: 'gpt-template-test',
                aiEndpoint: '',
                temperature: 0.35,
                maxTokens: 300,
                useProviderDefaults: false,
                forceNonStreaming: false,
                t(key, params, fallback) {
                    return fallback || key;
                }
            };

            await window.Beats.loadTemplates(app);
            const baseBefore = window.BeatTemplateService.normalizeTemplate(await db.beatTemplates.get('preset-save-the-cat-bs2-v2'));
            const baseBeforeJson = JSON.stringify(baseBefore);

            const opened = await window.Beats.openTemplateCustomization(app);
            if (!opened || !app.showTemplateCustomizationModal || app.templateCustomizationBaseId !== baseBefore.id) {
                throw new Error('template customization modal did not open with the selected base template');
            }

            const validEnvelope = {
                format: 'writingway2.beat-template',
                version: 2,
                exportedAt: new Date().toISOString(),
                template: {
                    id: 'model-suggested-template-id',
                    name: 'Mystery BS2 Compact',
                    version: 2,
                    builtIn: false,
                    source: 'aiCustomized',
                    baseTemplateId: baseBefore.id,
                    description: 'A compact mystery-focused customization of BS2.',
                    medium: 'novel',
                    tags: ['mystery', 'structure'],
                    customization: {
                        instruction: 'Make it mystery-focused.',
                        changeSummary: [
                            'Condensed the structure into clue-focused turns.',
                            'Added investigation and reveal pressure.'
                        ]
                    },
                    slots: [
                        {
                            id: 'opening-image',
                            title: 'Opening Image',
                            order: 0,
                            description: 'A mystery-toned image of the ordinary world before the case.',
                            purpose: 'Establish contrast and the unresolved atmosphere.',
                            recommendedPosition: { percentStart: 0, percentEnd: 3 },
                            promptHint: 'Open with a normal scene that contains one uneasy detail.',
                            requiredInputs: ['premise'],
                            outputSchema: null,
                            examples: []
                        },
                        {
                            id: 'first-clue',
                            title: 'First Clue',
                            order: 1,
                            description: 'The clue that makes the mystery impossible to ignore.',
                            purpose: 'Launch investigation through a concrete question.',
                            recommendedPosition: { percentStart: 10, percentEnd: 20 },
                            promptHint: 'Introduce a clue with at least two possible meanings.',
                            requiredInputs: ['mystery'],
                            outputSchema: null,
                            examples: []
                        },
                        {
                            id: 'final-reveal',
                            title: 'Final Reveal',
                            order: 2,
                            description: 'The solution reframes prior clues and resolves the central question.',
                            purpose: 'Pay off the mystery and prove the protagonist changed.',
                            recommendedPosition: { percentStart: 85, percentEnd: 100 },
                            promptHint: 'Resolve the case through a choice informed by the protagonist arc.',
                            requiredInputs: ['theme'],
                            outputSchema: null,
                            examples: []
                        }
                    ]
                }
            };

            const originalRun = window.AIOrchestrator.run;
            let capturedRequest = null;
            let capturedSettings = null;
            window.AIOrchestrator.run = async (request, settings) => {
                capturedRequest = request;
                capturedSettings = settings;
                return {
                    runId: 'mock-template-customization-success',
                    outputJson: validEnvelope,
                    outputText: JSON.stringify(validEnvelope),
                    usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
                    provider: 'openai',
                    model: 'gpt-template-test'
                };
            };

            app.templateCustomizationInstruction = 'Make the BS2 template work as a compact mystery outline.';
            const draft = await window.Beats.generateTemplateCustomization(app);
            if (!capturedRequest || capturedRequest.task !== 'template.customize') {
                throw new Error('template customization did not build a template.customize AIRequest');
            }
            if (!capturedRequest.responseSchema || capturedRequest.responseSchema.$id !== window.AIStructuredOutput.schemas.beatTemplateV2.$id) {
                throw new Error('template customization did not request beat-template v2 structured output');
            }
            const requestText = JSON.stringify(capturedRequest.messages);
            if (!requestText.includes('opening-image') || !requestText.includes('final-image') || !requestText.includes(app.templateCustomizationInstruction)) {
                throw new Error('template customization request did not include normalized base slots and instruction');
            }
            if (!capturedSettings || capturedSettings.provider !== 'openai' || capturedSettings.apiKey !== app.aiApiKey) {
                throw new Error('template customization did not pass current AI settings');
            }
            if (!draft || draft.source !== 'aiCustomized' || draft.builtIn !== false || draft.baseTemplateId !== baseBefore.id || draft.slots.length !== 3) {
                throw new Error('customized template draft was not normalized correctly');
            }
            if (draft.id === validEnvelope.template.id || draft.id === baseBefore.id) {
                throw new Error('customized template draft should get a new local template id');
            }
            if (app.templateCustomizationChangeSummary.length !== 2 || !app.templateCustomizationAiRunId) {
                throw new Error('customization review state was not populated');
            }
            const generatedButUnsaved = (await db.beatTemplates.toArray()).filter(template => template.source === 'aiCustomized');
            if (generatedButUnsaved.length !== 0) {
                throw new Error('generated customization draft should not be saved before user confirmation');
            }
            const baseAfterGenerate = window.BeatTemplateService.normalizeTemplate(await db.beatTemplates.get(baseBefore.id));
            if (JSON.stringify(baseAfterGenerate) !== baseBeforeJson) {
                throw new Error('base template changed during AI customization generation');
            }

            const saved = await window.Beats.saveCustomizedTemplate(app);
            const persisted = await db.beatTemplates.get(saved.id);
            if (!persisted || persisted.source !== 'aiCustomized' || persisted.builtIn !== false || persisted.baseTemplateId !== baseBefore.id) {
                throw new Error('customized template was not saved with required metadata');
            }
            if (persisted.customization.instruction !== app.templateCustomizationInstruction || persisted.customization.changeSummary.length !== 2 || !persisted.customization.aiRunId) {
                throw new Error('customization metadata was not saved');
            }
            if (app.selectedBeatTemplateId !== saved.id || app.showTemplateCustomizationModal) {
                throw new Error('saved customized template was not selected and modal was not closed');
            }

            const baseAfterSave = window.BeatTemplateService.normalizeTemplate(await db.beatTemplates.get(baseBefore.id));
            if (JSON.stringify(baseAfterSave) !== baseBeforeJson) {
                throw new Error('base template changed when saving customized template');
            }

            const run = await db.aiRuns.get(saved.customization.aiRunId);
            if (!run || run.task !== 'template.customize' || run.status !== 'succeeded' || run.templateId !== baseBefore.id) {
                throw new Error('template customization AI run metadata was not stored');
            }
            const runText = JSON.stringify(run);
            if (runText.includes(app.aiApiKey) || runText.includes(app.templateCustomizationInstruction) || runText.includes('Base template JSON')) {
                throw new Error('template customization AI run metadata should not store secrets or full prompts');
            }
            if (run.requestSummary.baseSlotCount !== 15 || run.responseSummary.savedTemplateId !== saved.id) {
                throw new Error('template customization AI run summaries are incomplete');
            }

            await window.Beats.createBeatsFromTemplate(app);
            const beatsFromCustomized = await db.beats.where('projectId').equals(project.id).sortBy('order');
            if (beatsFromCustomized.length !== 3 || beatsFromCustomized[1].templateSlotId !== 'first-clue') {
                throw new Error('customized template did not create beats with stable slot ids');
            }

            const envelope = window.Beats._test.makeTemplateEnvelope(saved);
            const importedFile = new File([JSON.stringify(envelope)], 'customized-template.json', { type: 'application/json' });
            const imported = await window.Beats.importTemplate(app, { target: { files: [importedFile] } });
            if (!imported || imported.id === saved.id || imported.baseTemplateId !== baseBefore.id || imported.customization.changeSummary.length !== 2) {
                throw new Error('customized template export/import did not preserve baseTemplateId and summary');
            }

            const templateCountBeforeInvalid = await db.beatTemplates.count();
            window.AIOrchestrator.run = async () => ({
                runId: 'mock-template-customization-invalid',
                outputJson: {
                    format: 'writingway2.beat-template',
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    template: {
                        id: 'invalid-template',
                        name: 'Invalid Template',
                        version: 2,
                        source: 'aiCustomized',
                        slots: [{ id: 'broken', title: 'Broken', order: 0, description: 'Missing purpose.' }]
                    }
                },
                outputText: '{"invalid":true}',
                usage: {}
            });

            app.selectedBeatTemplateId = baseBefore.id;
            app.templateCustomizationBaseId = baseBefore.id;
            app.templateCustomizationInstruction = 'Return an invalid template for the test.';
            app.templateCustomizationDraft = null;
            app.templateCustomizationChangeSummary = [];
            let invalidRejected = false;
            try {
                await window.Beats.generateTemplateCustomization(app);
            } catch (error) {
                invalidRejected = /schema|required|purpose|invalid/i.test(error.message || String(error));
            }
            if (!invalidRejected) throw new Error('schema-invalid template customization output should be rejected');
            if (await db.beatTemplates.count() !== templateCountBeforeInvalid) {
                throw new Error('schema-invalid customization output should not save a template');
            }
            if (app.templateCustomizationDraft) {
                throw new Error('schema-invalid customization output should not leave a draft');
            }
            const failedRuns = (await db.aiRuns.where('projectId').equals(project.id).toArray()).filter(row => row.status === 'failed');
            if (failedRuns.length !== 1 || JSON.stringify(failedRuns[0]).includes('Return an invalid template for the test')) {
                throw new Error('failed customization run metadata should be stored without raw instruction text');
            }

            window.AIOrchestrator.run = originalRun;

            return {
                savedTemplateId: saved.id,
                savedSlots: saved.slots.length,
                createdBeats: beatsFromCustomized.length,
                importedBaseTemplateId: imported.baseTemplateId,
                aiRuns: await db.aiRuns.where('projectId').equals(project.id).count()
            };
        });

        console.log('Template customization unit test passed:', JSON.stringify(result));
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Template customization unit test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
