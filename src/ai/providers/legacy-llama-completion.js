// Legacy llama.cpp /completion adapter.
(function () {
    const ADAPTER_ID = 'legacy-llama-completion';

    function tr(key, params, fallback) {
        return window.t ? window.t(key, params, fallback) : (fallback || key);
    }

    function requireContracts() {
        if (!window.AIContracts || !window.AIEvents) {
            throw new Error(tr('alerts.aiGatewayContractsMissing', null, 'AI Gateway contracts are not loaded'));
        }
        return { contracts: window.AIContracts, events: window.AIEvents };
    }

    function normalizeEndpoint(endpoint) {
        let base = String(endpoint || 'http://localhost:8080').replace(/\/+$/, '');
        base = base.replace(/\/completion$/, '');
        return base;
    }

    function buildPayload(aiRequest, settingsInput) {
        const { contracts } = requireContracts();
        const settings = contracts.normalizeSettings(settingsInput);
        const request = contracts.createRequest(aiRequest);
        const body = {
            prompt: contracts.messagesToChatML(request.messages),
            top_p: 0.9,
            stop: ['<|im_end|>', '<|endoftext|>', '\n\n\n\n', 'USER:', 'HUMAN:'],
            stream: true
        };

        if (!settings.useProviderDefaults) {
            body.n_predict = request.generation?.maxOutputTokens || settings.maxTokens || 300;
            body.temperature = typeof request.generation?.temperature === 'number' ? request.generation.temperature : (settings.temperature || 0.8);
        }

        return {
            url: `${normalizeEndpoint(settings.endpoint)}/completion`,
            headers: { 'Content-Type': 'application/json' },
            body,
            stream: true,
            provider: 'llamaCompletion',
            model: settings.model || ''
        };
    }

    function parseStreamLine(line, state) {
        const { events } = requireContracts();
        const trimmed = String(line || '').trim();
        if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) return [];

        let jsonText = trimmed;
        if (jsonText.startsWith('data:')) jsonText = jsonText.slice(5).trim();
        if (!jsonText || jsonText === '[DONE]') {
            if (jsonText === '[DONE]') state.done = true;
            return [];
        }

        let data;
        try {
            data = JSON.parse(jsonText);
        } catch (e) {
            return [];
        }

        const out = [];
        if (data.content) {
            state.hasContent = true;
            out.push(events.textDelta(data.content, { provider: state.provider, model: state.model }));
        }
        if (data.stop) {
            state.done = true;
            state.finishReason = data.stopping_word || data.stop_type || 'stop';
        }
        return out;
    }

    function emitEvent(callbacks, event) {
        if (callbacks && typeof callbacks.onEvent === 'function') {
            callbacks.onEvent(event);
        }
    }

    async function readStream(response, state, callbacks) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();

            for (const line of lines) {
                const parsedEvents = parseStreamLine(line, state);
                for (const event of parsedEvents) {
                    emitEvent(callbacks, event);
                }
                if (state.done) break;
            }
            if (state.done) break;
        }

        const tail = buffer.trim();
        if (tail && !state.done) {
            const parsedEvents = parseStreamLine(tail, state);
            for (const event of parsedEvents) {
                emitEvent(callbacks, event);
            }
        }
    }

    async function send(aiRequest, settingsInput, callbacks = {}) {
        const { contracts, events } = requireContracts();
        const settings = contracts.normalizeSettings(settingsInput);
        const payload = buildPayload(aiRequest, settings);

        contracts.DebugLog.safe('provider.request', {
            provider: payload.provider,
            model: payload.model,
            adapter: ADAPTER_ID,
            stream: payload.stream
        });

        const response = await fetch(payload.url, {
            method: 'POST',
            headers: payload.headers,
            body: JSON.stringify(payload.body)
        });

        if (!response.ok) {
            const error = new Error(tr(
                'alerts.serverReturned',
                { status: response.status },
                `Server returned ${response.status}`
            ));
            error.status = response.status;
            error.provider = payload.provider;
            throw error;
        }

        const state = {
            provider: payload.provider,
            model: payload.model,
            outputText: '',
            finishReason: null,
            hasContent: false,
            done: false
        };

        const captureCallbacks = Object.assign({}, callbacks, {
            onEvent(event) {
                if (event.type === 'text_delta') state.outputText += event.text || '';
                emitEvent(callbacks, event);
            }
        });

        if (response.body) {
            await readStream(response, state, captureCallbacks);
        } else {
            const data = await response.json();
            if (data.content) {
                captureCallbacks.onEvent(events.textDelta(data.content, { provider: payload.provider, model: payload.model }));
            }
            if (data.stop) state.finishReason = data.stopping_word || data.stop_type || 'stop';
        }

        const result = {
            outputText: state.outputText,
            finishReason: state.finishReason,
            usage: null,
            raw: null
        };
        emitEvent(callbacks, events.done(result, { provider: payload.provider, model: payload.model }));
        return result;
    }

    const adapter = {
        id: ADAPTER_ID,
        label: 'Legacy llama.cpp completion',
        capabilities: {
            streaming: true,
            nonStreaming: false,
            structuredOutput: false,
            tools: false,
            vision: false,
            local: true,
            requiresApiKey: false
        },
        canHandle(aiRequest, settingsInput) {
            const { contracts } = requireContracts();
            const settings = contracts.normalizeSettings(settingsInput);
            return settings.provider === 'llamaCompletion';
        },
        buildPayload,
        send,
        parseStreamLine,
        _test: {
            normalizeEndpoint
        }
    };

    window.AIProviders = window.AIProviders || {};
    window.AIProviders.legacyLlamaCompletion = adapter;
    window.AIProviders[ADAPTER_ID] = adapter;
})();
