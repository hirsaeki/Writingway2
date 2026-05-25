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
    page.on('console', msg => {
        consoleMessages.push(msg.text());
    });

    try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => (
            window.AIContracts &&
            window.AIEvents &&
            window.AIProviders &&
            window.AIOrchestrator &&
            window.Generation &&
            typeof window.Generation.buildPrompt === 'function' &&
            typeof window.Generation.buildPromptMessages === 'function'
        ), { timeout: 5000 });

        const result = await page.evaluate(async () => {
            const promptString = window.Generation.buildPrompt(
                'Very secret scene detail for leak detection.',
                'Private scene context.',
                { povCharacter: 'Mira', pov: '1st person', tense: 'present' }
            );
            const promptMessages = window.Generation.buildPromptMessages(
                'Very secret scene detail for leak detection.',
                'Private scene context.',
                { povCharacter: 'Mira', pov: '1st person', tense: 'present' }
            );

            const lmPayload = window.AIProviders.openAIChatCompatible.buildPayload(
                window.AIContracts.createRequest({
                    task: 'prose.generate',
                    messages: [{ role: 'user', content: 'Hello local model' }],
                    modelProfile: { provider: 'lmstudio', model: 'local-model' }
                }),
                {
                    mode: 'api',
                    provider: 'lmstudio',
                    endpoint: 'http://localhost:1234/v1',
                    model: 'local-model',
                    useProviderDefaults: true
                }
            );

            const originalFetch = window.fetch;
            const encoder = new TextEncoder();
            const calls = [];

            window.fetch = async (url, options) => {
                calls.push({
                    url: String(url),
                    headers: Object.assign({}, options.headers || {}),
                    body: JSON.parse(options.body)
                });

                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'));
                        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n'));
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();
                    }
                });

                return new Response(stream, {
                    status: 200,
                    headers: { 'Content-Type': 'text/event-stream' }
                });
            };

            const tokens = [];
            const events = [];
            const request = window.AIContracts.createRequest({
                task: 'prose.generate',
                messages: [
                    { role: 'system', content: 'Keep the answer short.' },
                    { role: 'user', content: 'Very secret scene detail for leak detection.' }
                ],
                modelProfile: { provider: 'openai', model: 'gpt-test' }
            });

            const runResult = await window.AIOrchestrator.run(
                request,
                {
                    mode: 'api',
                    provider: 'openai',
                    apiKey: 'sk-test-leak-check',
                    model: 'gpt-test',
                    temperature: 0.3,
                    maxTokens: 42
                },
                {
                    onToken(token) {
                        tokens.push(token);
                    },
                    onEvent(event) {
                        events.push(event.type);
                    }
                }
            );

            window.fetch = originalFetch;

            return {
                promptIsString: typeof promptString === 'string',
                promptHasBrief: promptString.includes('BRIEF TO EXPAND'),
                promptMessagesLength: promptMessages.messages.length,
                promptMessagesAsString: promptMessages.asString().includes('<|im_start|>system'),
                lmstudioHasAuth: Object.keys(lmPayload.headers).some(key => key.toLowerCase() === 'authorization'),
                lmstudioUrl: lmPayload.url,
                fetchedUrl: calls[0].url,
                fetchedHasAuth: Object.keys(calls[0].headers).some(key => key.toLowerCase() === 'authorization'),
                fetchedModel: calls[0].body.model,
                fetchedStream: calls[0].body.stream,
                fetchedMessagesLength: calls[0].body.messages.length,
                fetchedMaxTokens: calls[0].body.max_tokens,
                fetchedTemperature: calls[0].body.temperature,
                tokens: tokens.join(''),
                outputText: runResult.outputText,
                finishReason: runResult.finishReason,
                events
            };
        });

        const checks = [
            { ok: result.promptIsString, msg: 'Generation.buildPrompt no longer returns a string' },
            { ok: result.promptHasBrief, msg: 'Prompt preview lost the brief marker' },
            { ok: result.promptMessagesLength === 2, msg: 'buildPromptMessages did not return system/user messages' },
            { ok: result.promptMessagesAsString, msg: 'buildPromptMessages.asString did not return ChatML' },
            { ok: result.lmstudioUrl === 'http://localhost:1234/v1/chat/completions', msg: 'LM Studio URL normalization failed' },
            { ok: result.lmstudioHasAuth === false, msg: 'LM Studio payload should not include Authorization' },
            { ok: result.fetchedUrl === 'https://api.openai.com/v1/chat/completions', msg: 'OpenAI adapter used the wrong URL' },
            { ok: result.fetchedHasAuth, msg: 'OpenAI adapter did not send Authorization header' },
            { ok: result.fetchedModel === 'gpt-test', msg: 'OpenAI adapter did not preserve model' },
            { ok: result.fetchedStream === true, msg: 'OpenAI adapter did not request streaming' },
            { ok: result.fetchedMessagesLength === 2, msg: 'OpenAI adapter did not send normalized messages' },
            { ok: result.fetchedMaxTokens === 42, msg: 'OpenAI adapter did not map max tokens' },
            { ok: result.fetchedTemperature === 0.3, msg: 'OpenAI adapter did not map temperature' },
            { ok: result.tokens === 'Hello', msg: 'Adapter stream tokens were not emitted in order' },
            { ok: result.outputText === 'Hello', msg: 'Orchestrator outputText did not collect stream content' },
            { ok: result.finishReason === 'stop', msg: 'Finish reason was not normalized' },
            { ok: result.events.includes('start') && result.events.includes('text_delta') && result.events.includes('done'), msg: 'Normalized events were not emitted' }
        ];

        const leaks = consoleMessages.filter(text => (
            text.includes('sk-test-leak-check') ||
            text.includes('Very secret scene detail for leak detection.') ||
            text.includes('Private scene context.')
        ));
        checks.push({ ok: leaks.length === 0, msg: `Sensitive data was written to console: ${leaks.join(' | ')}` });

        const failed = checks.filter(check => !check.ok);
        if (failed.length > 0) {
            console.error('AI Gateway test failed:');
            for (const failure of failed) console.error(' -', failure.msg);
            await browser.close();
            process.exit(2);
        }

        console.log('AI Gateway adapter/orchestrator test passed.');
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('AI Gateway test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
