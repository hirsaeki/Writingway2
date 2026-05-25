// AI Gateway contract helpers and provider capability registry.
(function () {
    const CHATML_START = '<|im_start|>';
    const CHATML_END = '<|im_end|>';

    const PROVIDER_CAPABILITIES = {
        openai: {
            adapter: 'openai-chat-compatible',
            cloud: true,
            local: false,
            requiresApiKey: true,
            structuredOutput: true,
            tools: true,
            supportsModelList: true
        },
        openrouter: {
            adapter: 'openai-chat-compatible',
            cloud: true,
            local: false,
            requiresApiKey: true,
            structuredOutput: 'model-dependent',
            tools: 'model-dependent',
            supportsModelList: true
        },
        nanogpt: {
            adapter: 'openai-chat-compatible',
            cloud: true,
            local: false,
            requiresApiKey: true,
            structuredOutput: 'model-dependent',
            tools: 'model-dependent',
            supportsModelList: false
        },
        lmstudio: {
            adapter: 'openai-chat-compatible',
            cloud: false,
            local: true,
            requiresApiKey: false,
            structuredOutput: 'model-dependent',
            tools: 'model-dependent',
            supportsModelList: true
        },
        ollama: {
            adapter: 'openai-chat-compatible',
            cloud: false,
            local: true,
            requiresApiKey: false,
            structuredOutput: 'model-dependent',
            tools: 'model-dependent',
            supportsModelList: true
        },
        llamaCompletion: {
            adapter: 'legacy-llama-completion',
            cloud: false,
            local: true,
            requiresApiKey: false,
            structuredOutput: false,
            tools: false,
            supportsModelList: false
        },
        custom: {
            adapter: 'openai-chat-compatible',
            cloud: false,
            local: false,
            requiresApiKey: 'optional',
            structuredOutput: 'unknown',
            tools: 'unknown',
            supportsModelList: false
        },
        anthropic: {
            adapter: 'legacy-generation-fallback',
            cloud: true,
            local: false,
            requiresApiKey: true,
            structuredOutput: 'tool-or-schema',
            tools: true,
            supportsModelList: false
        },
        google: {
            adapter: 'legacy-generation-fallback',
            cloud: true,
            local: false,
            requiresApiKey: true,
            structuredOutput: true,
            tools: true,
            supportsModelList: false
        }
    };

    const OPENAI_COMPATIBLE_PROVIDERS = ['openai', 'openrouter', 'nanogpt', 'lmstudio', 'ollama', 'custom'];
    const VALID_ROLES = new Set(['system', 'developer', 'user', 'assistant', 'tool']);
    const REDACT_KEYS = new Set([
        'apikey',
        'api_key',
        'authorization',
        'x-api-key',
        'headers',
        'messages',
        'prompt',
        'body',
        'content',
        'scenecontent',
        'scenetext',
        'generatedtext',
        'manuscript'
    ]);

    function debugEnabled() {
        try {
            return window.WRITINGWAY_DEBUG_AI === true || window.DebugLog?.enabled === true || localStorage.getItem('writingway:debugAI') === 'true';
        } catch (e) {
            return window.WRITINGWAY_DEBUG_AI === true || window.DebugLog?.enabled === true;
        }
    }

    function sensitiveDebugEnabled() {
        try {
            return debugEnabled() && localStorage.getItem('writingway:debugAISensitive') === 'true';
        } catch (e) {
            return false;
        }
    }

    function sanitizeForLog(value, depth = 0) {
        if (depth > 6) return '[max-depth]';
        if (value == null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(item => sanitizeForLog(item, depth + 1));
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_-]/g, '');
            if (REDACT_KEYS.has(normalizedKey)) {
                out[key] = '[redacted]';
            } else {
                out[key] = sanitizeForLog(item, depth + 1);
            }
        }
        return out;
    }

    const DebugLog = window.DebugLog || {
        enabled: false,
        safe(event, payload) {
            if (!debugEnabled()) return;
            console.debug('[AI]', event, sanitizeForLog(payload || {}));
        },
        sensitive(event, payload) {
            if (!sensitiveDebugEnabled()) return;
            console.debug('[AI:sensitive]', event, payload || {});
        },
        sanitize: sanitizeForLog
    };
    DebugLog.safe = DebugLog.safe || function safe(event, payload) {
        if (debugEnabled()) console.debug('[AI]', event, sanitizeForLog(payload || {}));
    };
    DebugLog.sensitive = DebugLog.sensitive || function sensitive(event, payload) {
        if (sensitiveDebugEnabled()) console.debug('[AI:sensitive]', event, payload || {});
    };
    DebugLog.sanitize = DebugLog.sanitize || sanitizeForLog;
    window.DebugLog = DebugLog;

    function asString(value) {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }

    function normalizeRole(role) {
        const normalized = asString(role || 'user').trim().toLowerCase();
        return VALID_ROLES.has(normalized) ? normalized : 'user';
    }

    function normalizeMessage(message) {
        if (typeof message === 'string') {
            return { role: 'user', content: message };
        }
        const role = normalizeRole(message && message.role);
        const normalized = {
            role,
            content: asString(message && message.content)
        };
        if (message && message.name) normalized.name = asString(message.name);
        if (message && message.toolCallId) normalized.toolCallId = asString(message.toolCallId);
        return normalized;
    }

    function parseChatML(text) {
        const source = asString(text);
        if (!source.includes(CHATML_START)) return [];
        const messages = [];
        const pattern = /<\|im_start\|>(system|developer|user|assistant|tool)\n([\s\S]*?)<\|im_end\|>/g;
        let match;
        while ((match = pattern.exec(source)) !== null) {
            messages.push({
                role: normalizeRole(match[1]),
                content: match[2]
            });
        }
        return messages;
    }

    function normalizeMessages(input) {
        let rawMessages = null;
        let systemText = '';

        if (Array.isArray(input)) {
            rawMessages = input;
        } else if (input && typeof input === 'object') {
            if (Array.isArray(input.messages)) rawMessages = input.messages;
            if (typeof input.system === 'string') systemText = input.system;
        } else if (typeof input === 'string') {
            rawMessages = parseChatML(input);
            if (rawMessages.length === 0) rawMessages = [{ role: 'user', content: input }];
        }

        if (!rawMessages) rawMessages = [{ role: 'user', content: asString(input) }];
        const messages = rawMessages.map(normalizeMessage).filter(message => message.content.length > 0 || message.role === 'assistant');

        if (systemText && !messages.some(message => message.role === 'system')) {
            messages.unshift({ role: 'system', content: systemText });
        }

        return messages.length > 0 ? messages : [{ role: 'user', content: '' }];
    }

    function messagesToChatML(messages) {
        if (!Array.isArray(messages)) return '';
        let result = '';
        for (const message of normalizeMessages(messages)) {
            result += `${CHATML_START}${message.role}\n${message.content}${CHATML_END}\n`;
        }
        result += `${CHATML_START}assistant\n`;
        return result;
    }

    function getCapabilities(provider) {
        return PROVIDER_CAPABILITIES[provider] || PROVIDER_CAPABILITIES.custom;
    }

    function isOpenAICompatibleProvider(provider) {
        return OPENAI_COMPATIBLE_PROVIDERS.includes(provider);
    }

    function providerRequiresApiKey(provider) {
        return getCapabilities(provider).requiresApiKey === true;
    }

    function defaultModelForProvider(provider) {
        switch (provider) {
            case 'openrouter':
                return 'google/gemini-2.0-flash-exp:free';
            case 'openai':
                return 'gpt-4o-mini';
            case 'google':
                return 'gemini-2.0-flash-exp';
            case 'anthropic':
                return 'claude-3-5-sonnet-20241022';
            default:
                return '';
        }
    }

    function isThinkingModel(model) {
        const modelText = asString(model).toLowerCase();
        if (!modelText) return false;
        return /\bo[0-9][-_]/.test(modelText) ||
            modelText.includes('reasoning') ||
            modelText.includes('think') ||
            modelText.includes('thought') ||
            modelText.includes('deepseek-reasoner') ||
            modelText.includes('qwq') ||
            (modelText.includes('r1') && modelText.includes('deepseek'));
    }

    function normalizeProvider(mode, provider) {
        if (mode === 'local') return 'llamaCompletion';
        return provider || 'anthropic';
    }

    function settingsFromApp(app) {
        const mode = app?.aiMode || 'local';
        const provider = normalizeProvider(mode, app?.aiProvider || 'anthropic');
        return {
            mode,
            provider,
            uiProvider: app?.aiProvider || provider,
            apiKey: app?.aiApiKey || '',
            model: app?.aiModel || defaultModelForProvider(provider),
            endpoint: app?.aiEndpoint || (mode === 'local' ? 'http://localhost:8080' : ''),
            temperature: typeof app?.temperature === 'number' ? app.temperature : 0.8,
            maxTokens: app?.maxTokens || 300,
            useProviderDefaults: app?.useProviderDefaults || false,
            forceNonStreaming: app?.forceNonStreaming || false
        };
    }

    function normalizeSettings(settings) {
        const mode = settings?.mode || settings?.aiMode || 'api';
        const providerInput = settings?.provider || settings?.aiProvider || (mode === 'local' ? 'llamaCompletion' : 'anthropic');
        const provider = normalizeProvider(mode, providerInput);
        return {
            mode,
            provider,
            uiProvider: settings?.uiProvider || providerInput,
            apiKey: settings?.apiKey || settings?.aiApiKey || '',
            model: settings?.model || settings?.aiModel || defaultModelForProvider(provider),
            endpoint: settings?.endpoint || settings?.aiEndpoint || (mode === 'local' ? 'http://localhost:8080' : ''),
            temperature: typeof settings?.temperature === 'number' ? settings.temperature : 0.8,
            maxTokens: settings?.maxTokens || 300,
            useProviderDefaults: settings?.useProviderDefaults || false,
            forceNonStreaming: settings?.forceNonStreaming || false
        };
    }

    function shouldDisableStreaming(request, settings) {
        return request?.stream === false || settings?.forceNonStreaming || isThinkingModel(settings?.model || request?.modelProfile?.model);
    }

    function createRequest(input, options = {}) {
        const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        const messages = normalizeMessages(input);
        const firstSystem = messages.find(message => message.role === 'system');
        const modelProfile = Object.assign({}, source.modelProfile || {}, options.modelProfile || {});
        const generation = Object.assign({}, source.generation || {}, options.generation || {});
        const context = Object.assign({}, source.context || {}, options.context || {});
        const metadata = Object.assign({}, source.metadata || {}, options.metadata || {});

        if (options.provider && !modelProfile.provider) modelProfile.provider = options.provider;
        if (options.model && !modelProfile.model) modelProfile.model = options.model;
        if (typeof generation.temperature !== 'number' && typeof options.temperature === 'number') generation.temperature = options.temperature;
        if (!generation.maxOutputTokens && options.maxTokens) generation.maxOutputTokens = options.maxTokens;

        return {
            task: source.task || options.task || 'prose.generate',
            system: source.system || options.system || (firstSystem ? firstSystem.content : ''),
            messages,
            context,
            responseSchema: source.responseSchema !== undefined ? source.responseSchema : (options.responseSchema || null),
            tools: Array.isArray(source.tools) ? source.tools : (Array.isArray(options.tools) ? options.tools : []),
            stream: source.stream !== undefined ? Boolean(source.stream) : (options.stream !== undefined ? Boolean(options.stream) : true),
            modelProfile,
            generation,
            metadata
        };
    }

    window.AIContracts = {
        PROVIDER_CAPABILITIES,
        OPENAI_COMPATIBLE_PROVIDERS,
        DebugLog,
        asString,
        normalizeMessage,
        normalizeMessages,
        messagesToChatML,
        parseChatML,
        getCapabilities,
        isOpenAICompatibleProvider,
        providerRequiresApiKey,
        defaultModelForProvider,
        isThinkingModel,
        normalizeProvider,
        settingsFromApp,
        normalizeSettings,
        shouldDisableStreaming,
        createRequest,
        _test: {
            sanitizeForLog,
            debugEnabled,
            sensitiveDebugEnabled
        }
    };
})();
