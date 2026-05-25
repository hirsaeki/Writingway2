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
            window.AIStructuredOutput &&
            window.AIOrchestrator &&
            window.AIProviders &&
            window.AIContracts
        ), { timeout: 5000 });

        const result = await page.evaluate(async () => {
            const so = window.AIStructuredOutput;
            const validPlot = {
                templateId: 'preset-save-the-cat-bs2-v2',
                name: 'Test Plot',
                premise: 'A reluctant engineer must save a failing city.',
                status: 'draft',
                beats: [
                    {
                        slotId: 'opening-image',
                        slotTitle: 'Opening Image',
                        title: 'The failing city',
                        summary: 'The engineer sees the city losing power block by block.',
                        sceneIdeas: ['Rooftop outage', 'Control room alarm']
                    }
                ]
            };
            const validTemplate = {
                format: 'writingway2.beat-template',
                version: 2,
                exportedAt: '2026-05-25T00:00:00.000Z',
                template: {
                    id: 'ai-custom-template',
                    name: 'AI Custom Template',
                    version: 2,
                    source: 'aiCustomized',
                    slots: [
                        {
                            id: 'hook',
                            title: 'Hook',
                            order: 0,
                            description: 'Open with a clear story hook.',
                            purpose: 'Establish the core promise.'
                        }
                    ]
                }
            };

            const helperValidPlot = so.validateText(JSON.stringify(validPlot), 'plot-plan');
            const helperValidTemplate = so.validateText(JSON.stringify(validTemplate), 'beat-template-v2');
            const invalidJson = so.validateText('{"templateId":', 'plot-plan');
            const schemaInvalid = so.validateText(JSON.stringify({
                templateId: 'preset-save-the-cat-bs2-v2',
                name: 'Broken Plot',
                premise: 'Missing beats array'
            }), 'plot-plan');

            const repaired = await so.processWithRepair('{"templateId":', 'plot-plan', {
                repair: async () => JSON.stringify(validPlot)
            });
            const repairFailed = await so.processWithRepair(JSON.stringify({
                templateId: 'preset-save-the-cat-bs2-v2',
                name: 'Still Broken',
                premise: 'No beats'
            }), 'plot-plan', {
                repair: async () => '{"still":"broken"}'
            });

            const promptOnly = so.prepareRequest(
                window.AIContracts.createRequest({
                    task: 'plot.generate',
                    messages: [{ role: 'user', content: 'Make a plot plan.' }],
                    responseSchema: so.schemas.plotPlan
                }),
                { structuredOutput: false }
            );

            const originalFetch = window.fetch;
            const calls = [];
            const events = [];

            window.fetch = async (url, options) => {
                const body = JSON.parse(options.body);
                calls.push({ url: String(url), body });
                return new Response(JSON.stringify({
                    choices: [
                        {
                            message: { content: JSON.stringify(validPlot) },
                            finish_reason: 'stop'
                        }
                    ]
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            };

            const structuredRun = await window.AIOrchestrator.run(
                window.AIContracts.createRequest({
                    task: 'plot.generate',
                    messages: [{ role: 'user', content: 'Make a plot plan.' }],
                    responseSchema: so.schemas.plotPlan,
                    modelProfile: { provider: 'openai', model: 'gpt-test' },
                    stream: false
                }),
                {
                    mode: 'api',
                    provider: 'openai',
                    apiKey: 'sk-test',
                    model: 'gpt-test'
                },
                {
                    onEvent(event) {
                        events.push({
                            type: event.type,
                            hasOutputJson: Boolean(event.outputJson)
                        });
                    }
                }
            );

            const badEvents = [];
            window.fetch = async () => new Response(JSON.stringify({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                templateId: 'preset-save-the-cat-bs2-v2',
                                name: 'Broken Plot',
                                premise: 'Missing beat summaries',
                                beats: [{ slotId: 'x', slotTitle: 'X', title: 'X' }]
                            })
                        },
                        finish_reason: 'stop'
                    }
                ]
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });

            let invalidRunError = null;
            try {
                await window.AIOrchestrator.run(
                    window.AIContracts.createRequest({
                        task: 'plot.generate',
                        messages: [{ role: 'user', content: 'Make a broken plot plan.' }],
                        responseSchema: so.schemas.plotPlan,
                        modelProfile: { provider: 'openai', model: 'gpt-test' },
                        stream: false
                    }),
                    { mode: 'api', provider: 'openai', apiKey: 'sk-test', model: 'gpt-test' },
                    {
                        onEvent(event) {
                            badEvents.push(event.type);
                        }
                    }
                );
            } catch (error) {
                invalidRunError = {
                    code: error.code,
                    validationCount: error.validationErrors ? error.validationErrors.length : 0,
                    rawOutputPresent: typeof error.rawOutput === 'string'
                };
            }

            const repairEvents = [];
            window.fetch = async () => new Response(JSON.stringify({
                choices: [
                    {
                        message: { content: '{"templateId":' },
                        finish_reason: 'stop'
                    }
                ]
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });

            const repairedRun = await window.AIOrchestrator.run(
                window.AIContracts.createRequest({
                    task: 'plot.generate',
                    messages: [{ role: 'user', content: 'Make a recoverable plot plan.' }],
                    responseSchema: so.schemas.plotPlan,
                    modelProfile: { provider: 'openai', model: 'gpt-test' },
                    stream: false,
                    metadata: {
                        repairStructuredOutput: async () => JSON.stringify(validPlot)
                    }
                }),
                { mode: 'api', provider: 'openai', apiKey: 'sk-test', model: 'gpt-test' },
                {
                    onEvent(event) {
                        repairEvents.push({
                            type: event.type,
                            repaired: event.repaired || false,
                            hasOutputJson: Boolean(event.outputJson)
                        });
                    }
                }
            );

            window.fetch = originalFetch;

            return {
                helperValidPlot: helperValidPlot.ok,
                helperValidTemplate: helperValidTemplate.ok,
                invalidJsonOk: invalidJson.ok,
                invalidJsonCode: invalidJson.parseError && invalidJson.parseError.code,
                schemaInvalidOk: schemaInvalid.ok,
                schemaInvalidPaths: schemaInvalid.validationErrors.map(error => error.path),
                repairedOk: repaired.ok,
                repairedAttempted: repaired.repairAttempted,
                repairedFlag: repaired.repaired,
                repairFailedOk: repairFailed.ok,
                repairFailedAttempted: repairFailed.repairAttempted,
                repairFailedCode: repairFailed.repairError && repairFailed.repairError.code,
                promptOnlyMode: promptOnly.metadata.structuredOutputMode,
                promptOnlyPrependedInstruction: promptOnly.messages[0].content.includes('Return only valid JSON'),
                nativeResponseFormat: calls[0].body.response_format && calls[0].body.response_format.type,
                nativeSchemaName: calls[0].body.response_format && calls[0].body.response_format.json_schema.name,
                structuredRunName: structuredRun.outputJson && structuredRun.outputJson.name,
                structuredRunOutputText: structuredRun.outputText,
                structuredEvents: events,
                invalidRunError,
                invalidRunDoneSeen: badEvents.includes('done'),
                repairedRunName: repairedRun.outputJson && repairedRun.outputJson.name,
                repairEvents
            };
        });

        const checks = [
            { ok: result.helperValidPlot, msg: 'Valid plot-plan JSON did not validate' },
            { ok: result.helperValidTemplate, msg: 'Valid beat-template v2 JSON did not validate' },
            { ok: result.invalidJsonOk === false && result.invalidJsonCode === 'invalid_json', msg: 'Invalid JSON was not reported as invalid_json' },
            { ok: result.schemaInvalidOk === false && result.schemaInvalidPaths.includes('$.beats'), msg: 'Schema-invalid plot plan did not report missing beats' },
            { ok: result.repairedOk && result.repairedAttempted && result.repairedFlag, msg: 'Repair hook did not produce a valid repaired result' },
            { ok: result.repairFailedOk === false && result.repairFailedAttempted && result.repairFailedCode === 'repair_invalid', msg: 'Repair failure was not reported' },
            { ok: result.promptOnlyMode === 'promptOnly' && result.promptOnlyPrependedInstruction, msg: 'Prompt-only structured fallback was not added' },
            { ok: result.nativeResponseFormat === 'json_schema', msg: 'Native structured response_format was not requested' },
            { ok: result.nativeSchemaName === 'writingway_2_plot_plan', msg: 'Structured schema name was not normalized' },
            { ok: result.structuredRunName === 'Test Plot', msg: 'Orchestrator did not return validated outputJson' },
            { ok: typeof result.structuredRunOutputText === 'string' && result.structuredRunOutputText.includes('Test Plot'), msg: 'Orchestrator lost raw structured output text' },
            { ok: result.structuredEvents.some(event => event.type === 'structured_result' && event.hasOutputJson), msg: 'structured_result event was not emitted' },
            { ok: result.structuredEvents.some(event => event.type === 'done' && event.hasOutputJson), msg: 'final done event did not include outputJson' },
            { ok: result.invalidRunError && result.invalidRunError.code === 'structured_schema_invalid', msg: 'Schema-invalid orchestrator output did not reject' },
            { ok: result.invalidRunError && result.invalidRunError.validationCount > 0 && result.invalidRunError.rawOutputPresent, msg: 'Invalid structured error did not preserve raw output and validation errors' },
            { ok: result.invalidRunDoneSeen === false, msg: 'Invalid structured output emitted done before rejection' },
            { ok: result.repairedRunName === 'Test Plot', msg: 'Orchestrator repair hook did not recover invalid JSON' },
            { ok: result.repairEvents.some(event => event.type === 'structured_result' && event.repaired && event.hasOutputJson), msg: 'Repaired structured result event was not emitted' }
        ];

        const failed = checks.filter(check => !check.ok);
        if (failed.length > 0) {
            console.error('Structured output test failed:');
            for (const failure of failed) console.error(' -', failure.msg);
            await browser.close();
            process.exit(2);
        }

        console.log('Structured output test passed.');
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Structured output test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
