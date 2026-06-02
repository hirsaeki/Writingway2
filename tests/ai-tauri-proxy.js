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
            window.PlatformAdapter &&
            window.AIContracts &&
            window.AIEvents &&
            window.AIProviders &&
            window.AIOrchestrator
        ), { timeout: 5000 });

        const result = await page.evaluate(async () => {
            const originalFetch = window.fetch;
            const calls = [];
            let directFetchCalled = false;

            window.fetch = async () => {
                directFetchCalled = true;
                throw new Error('Direct fetch should not be used in Tauri AI proxy mode.');
            };

            window.__TAURI_INTERNALS__ = {
                invoke(command, payload) {
                    calls.push(JSON.parse(JSON.stringify({ command, payload })));
                    return Promise.resolve({
                        status: 200,
                        statusText: 'OK',
                        contentType: 'text/event-stream',
                        body: [
                            'data: {"choices":[{"delta":{"content":"Pro"}}]}',
                            '',
                            'data: {"choices":[{"delta":{"content":"xy"},"finish_reason":"stop"}]}',
                            '',
                            'data: [DONE]',
                            ''
                        ].join('\n')
                    });
                }
            };

            try {
                const tokens = [];
                const events = [];
                const request = window.AIContracts.createRequest({
                    task: 'prose.generate',
                    messages: [
                        { role: 'system', content: 'Keep the answer short.' },
                        { role: 'user', content: 'Sensitive prompt content should not be logged.' }
                    ],
                    modelProfile: { provider: 'openai', model: 'gpt-proxy-test' }
                });

                const runResult = await window.AIOrchestrator.run(
                    request,
                    {
                        mode: 'api',
                        provider: 'openai',
                        apiKey: 'sk-renderer-proxy-secret',
                        model: 'gpt-proxy-test',
                        temperature: 0.2,
                        maxTokens: 24
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

                const proxyCall = calls[0] || {};
                const proxyRequest = proxyCall.payload && proxyCall.payload.request ? proxyCall.payload.request : {};
                const headerKeys = Object.keys(proxyRequest.headers || {}).map(key => key.toLowerCase());
                const proxyPayloadText = JSON.stringify(proxyRequest);

                return {
                    kind: window.PlatformAdapter.kind,
                    hasProxyApi: window.PlatformAdapter.hasTauriAiProxyApi(),
                    directFetchCalled,
                    command: proxyCall.command,
                    provider: proxyRequest.provider,
                    url: proxyRequest.url,
                    model: proxyRequest.body && proxyRequest.body.model,
                    stream: proxyRequest.body && proxyRequest.body.stream,
                    messagesLength: proxyRequest.body && proxyRequest.body.messages && proxyRequest.body.messages.length,
                    hasAuthorizationHeader: headerKeys.includes('authorization') || headerKeys.includes('x-api-key'),
                    payloadContainsApiKey: proxyPayloadText.includes('sk-renderer-proxy-secret'),
                    tokens: tokens.join(''),
                    outputText: runResult.outputText,
                    finishReason: runResult.finishReason,
                    events
                };
            } finally {
                window.fetch = originalFetch;
                delete window.__TAURI_INTERNALS__;
            }
        });

        const checks = [
            { ok: result.kind === 'tauri', msg: 'PlatformAdapter did not detect mocked Tauri mode' },
            { ok: result.hasProxyApi === true, msg: 'Tauri AI proxy API was not detected' },
            { ok: result.directFetchCalled === false, msg: 'OpenAI adapter used direct fetch instead of the Tauri AI proxy' },
            { ok: result.command === 'writingway2_ai_chat_completion', msg: 'Adapter invoked the wrong Tauri AI proxy command' },
            { ok: result.provider === 'openai', msg: 'Proxy request did not preserve provider' },
            { ok: result.url === 'https://api.openai.com/v1/chat/completions', msg: 'Proxy request used the wrong OpenAI URL' },
            { ok: result.model === 'gpt-proxy-test', msg: 'Proxy request did not preserve model' },
            { ok: result.stream === true, msg: 'Proxy request did not preserve streaming flag' },
            { ok: result.messagesLength === 2, msg: 'Proxy request did not send normalized messages' },
            { ok: result.hasAuthorizationHeader === false, msg: 'Renderer sent an authorization header to the native AI proxy' },
            { ok: result.payloadContainsApiKey === false, msg: 'Renderer sent the API key to the native AI proxy payload' },
            { ok: result.tokens === 'Proxy', msg: 'Proxy SSE response tokens were not emitted in order' },
            { ok: result.outputText === 'Proxy', msg: 'Orchestrator outputText did not collect proxy response content' },
            { ok: result.finishReason === 'stop', msg: 'Proxy response finish reason was not normalized' },
            { ok: result.events.includes('start') && result.events.includes('text_delta') && result.events.includes('done'), msg: 'Proxy path did not emit normalized events' }
        ];

        const leaks = consoleMessages.filter(text => (
            text.includes('sk-renderer-proxy-secret') ||
            text.includes('Sensitive prompt content should not be logged.')
        ));
        checks.push({ ok: leaks.length === 0, msg: `Sensitive data was written to console: ${leaks.join(' | ')}` });

        const failed = checks.filter(check => !check.ok);
        if (failed.length > 0) {
            console.error('Tauri AI proxy test failed:');
            for (const failure of failed) console.error(' -', failure.msg);
            await browser.close();
            process.exit(2);
        }

        console.log('Tauri AI proxy test passed.');
        await browser.close();
        process.exit(0);
    } catch (err) {
        console.error('Tauri AI proxy test failed:', err.message || err);
        await browser.close();
        process.exit(1);
    }
})();
