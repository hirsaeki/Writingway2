// OpenAI-compatible Chat Completions provider adapter.
(function () {
    const ADAPTER_ID = 'openai-chat-compatible';

    function tr(key, params, fallback) {
        return window.t ? window.t(key, params, fallback) : (fallback || key);
    }

    function requireContracts() {
        if (!window.AIContracts || !window.AIEvents) {
            throw new Error(tr('alerts.aiGatewayContractsMissing', null, 'AI Gateway contracts are not loaded'));
        }
        return { contracts: window.AIContracts, events: window.AIEvents };
    }

    function stripTrailingSlash(value) {
        return String(value || '').replace(/\/+$/, '');
    }

    function normalizeLmStudioBase(endpoint) {
        let base = stripTrailingSlash(endpoint || 'http://localhost:1234');
        base = base.replace(/\/v1(\/.*)?$/, '');
        return base;
    }

    function normalizeOllamaBase(endpoint) {
        let base = stripTrailingSlash(endpoint || 'http://localhost:11434');
        base = base.replace(/\/v1(\/.*)?$/, '');
        return base;
    }

    function normalizeNanoGptBase(endpoint) {
        let base = stripTrailingSlash(endpoint || 'https://nano-gpt.com/api');
        base = base.replace(/\/chat\/completions$/, '');
        return base;
    }

    function buildUrl(settings) {
        switch (settings.provider) {
            case 'openrouter':
                return 'https://openrouter.ai/api/v1/chat/completions';
            case 'openai':
                return 'https://api.openai.com/v1/chat/completions';
            case 'nanogpt':
                return `${normalizeNanoGptBase(settings.endpoint)}/chat/completions`;
            case 'lmstudio':
                return `${normalizeLmStudioBase(settings.endpoint)}/v1/chat/completions`;
            case 'ollama':
                return `${normalizeOllamaBase(settings.endpoint)}/v1/chat/completions`;
            case 'custom':
                return settings.endpoint || '';
            default:
                return settings.endpoint || '';
        }
    }

    function buildHeaders(settings) {
        const headers = { 'Content-Type': 'application/json' };
        const requiresKey = window.AIContracts.providerRequiresApiKey(settings.provider);
        const shouldSendKey = requiresKey || (settings.provider === 'custom' && settings.apiKey);

        if (shouldSendKey && settings.apiKey) {
            headers.Authorization = `Bearer ${settings.apiKey}`;
        }

        if (settings.provider === 'openrouter') {
            try {
                headers['HTTP-Referer'] = window.location.href;
            } catch (e) {
                headers['HTTP-Referer'] = 'https://writingway.local';
            }
            headers['X-Title'] = 'Writingway';
        }

        return headers;
    }

    function buildPayload(aiRequest, settingsInput) {
        const { contracts } = requireContracts();
        const settings = contracts.normalizeSettings(settingsInput);
        const request = contracts.createRequest(aiRequest);
        const shouldDisableStreaming = contracts.shouldDisableStreaming(request, settings);
        const model = request.modelProfile?.model || settings.model || contracts.defaultModelForProvider(settings.provider);
        const body = {
            messages: contracts.normalizeMessages(request.messages),
            stream: !shouldDisableStreaming
        };

        if (model) body.model = model;
        if (!settings.useProviderDefaults) {
            const temperature = typeof request.generation?.temperature === 'number' ? request.generation.temperature : settings.temperature;
            const maxTokens = request.generation?.maxOutputTokens || settings.maxTokens;
            body.temperature = temperature;
            if (maxTokens) body.max_tokens = maxTokens;
        }

        if (request.responseSchema && request.responseSchema.schema) {
            body.response_format = {
                type: 'json_schema',
                json_schema: {
                    name: request.responseSchema.name || 'writingway_response',
                    strict: request.responseSchema.strict !== false,
                    schema: request.responseSchema.schema
                }
            };
        } else if (request.responseSchema && request.responseSchema.type === 'object') {
            body.response_format = {
                type: 'json_schema',
                json_schema: {
                    name: request.responseSchema.title || 'writingway_response',
                    strict: true,
                    schema: request.responseSchema
                }
            };
        }

        return {
            url: buildUrl(settings),
            headers: buildHeaders(settings),
            body,
            stream: body.stream,
            provider: settings.provider,
            model
        };
    }

    function parseStreamLine(line, state) {
        const { events } = requireContracts();
        const trimmed = String(line || '').trim();
        if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) return [];

        let jsonText = trimmed;
        if (jsonText.startsWith('data:')) jsonText = jsonText.slice(5).trim();
        if (!jsonText) return [];
        if (jsonText === '[DONE]') {
            state.done = true;
            return [];
        }

        let data;
        try {
            data = JSON.parse(jsonText);
        } catch (e) {
            return [];
        }

        if (data.error) {
            const message = data.error.message || 'Provider stream returned an error';
            throw new Error(tr('alerts.aiProviderStreamError', { error: message }, `AI provider stream returned an error: ${message}`));
        }

        const out = [];
        const choice = data.choices && data.choices[0];
        if (choice?.finish_reason) {
            state.finishReason = choice.finish_reason;
        }

        const delta = choice?.delta || {};
        const text = delta.reasoning_content || delta.content || choice?.message?.content || '';
        if (text) {
            state.hasContent = true;
            out.push(events.textDelta(text, { provider: state.provider, model: state.model }));
        }

        if (data.usage) {
            out.push(events.usage({
                inputTokens: data.usage.prompt_tokens || data.usage.input_tokens || 0,
                outputTokens: data.usage.completion_tokens || data.usage.output_tokens || 0,
                totalTokens: data.usage.total_tokens || 0
            }, { provider: state.provider, model: state.model }));
        }

        return out;
    }

    function parseFinalResponse(data, state) {
        const { events } = requireContracts();
        const choice = data?.choices && data.choices[0];
        const content = choice?.message?.content || choice?.delta?.content || '';
        const finishReason = choice?.finish_reason || data?.finish_reason || null;
        const emitted = [];

        if (content) {
            state.hasContent = true;
            emitted.push(events.textDelta(content, { provider: state.provider, model: state.model }));
        }
        if (data?.usage) {
            emitted.push(events.usage({
                inputTokens: data.usage.prompt_tokens || data.usage.input_tokens || 0,
                outputTokens: data.usage.completion_tokens || data.usage.output_tokens || 0,
                totalTokens: data.usage.total_tokens || 0
            }, { provider: state.provider, model: state.model }));
        }

        return {
            events: emitted,
            finishReason
        };
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
        if (!payload.url) {
            throw new Error(tr('alerts.aiProviderEndpointMissing', null, 'No AI provider endpoint is configured'));
        }

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
                'alerts.apiReturned',
                { status: response.status, error: response.statusText || 'Provider error' },
                `API returned ${response.status}: ${response.statusText || 'Provider error'}`
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

        const contentType = response.headers?.get ? (response.headers.get('content-type') || '') : '';
        if (!payload.stream || contentType.includes('application/json') || !response.body) {
            const data = await response.json();
            const parsed = parseFinalResponse(data, state);
            state.finishReason = parsed.finishReason;
            for (const event of parsed.events) {
                captureCallbacks.onEvent(event);
            }
        } else {
            await readStream(response, state, captureCallbacks);
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
        label: 'OpenAI-compatible Chat Completions',
        capabilities: {
            streaming: true,
            nonStreaming: true,
            structuredOutput: 'model-dependent',
            tools: 'model-dependent',
            vision: false,
            local: 'provider-dependent',
            requiresApiKey: 'provider-dependent'
        },
        canHandle(aiRequest, settingsInput) {
            const { contracts } = requireContracts();
            const settings = contracts.normalizeSettings(settingsInput);
            return contracts.isOpenAICompatibleProvider(settings.provider);
        },
        buildPayload,
        send,
        parseStreamLine,
        parseFinalResponse,
        _test: {
            buildUrl,
            buildHeaders,
            normalizeLmStudioBase,
            normalizeOllamaBase,
            normalizeNanoGptBase
        }
    };

    window.AIProviders = window.AIProviders || {};
    window.AIProviders.openAIChatCompatible = adapter;
    window.AIProviders[ADAPTER_ID] = adapter;
})();
