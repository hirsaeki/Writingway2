// AI Orchestrator: selects provider adapters and normalizes stream events.
(function () {
    function tr(key, params, fallback) {
        return window.t ? window.t(key, params, fallback) : (fallback || key);
    }

    function requireContracts() {
        if (!window.AIContracts || !window.AIEvents) {
            throw new Error(tr('alerts.aiGatewayContractsMissing', null, 'AI Gateway contracts are not loaded'));
        }
        return { contracts: window.AIContracts, events: window.AIEvents };
    }

    function isCallbacks(value) {
        return value && typeof value === 'object' && (
            typeof value.onToken === 'function' ||
            typeof value.onEvent === 'function' ||
            typeof value.onError === 'function'
        );
    }

    function makeRunId() {
        try {
            if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        } catch (e) { /* ignore */ }
        return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function buildSettingsForRequest(request, settingsInput) {
        const { contracts } = requireContracts();
        const original = settingsInput || {};
        const settings = contracts.normalizeSettings(original);
        const providerWasExplicit = Boolean(original.provider || original.aiProvider || original.mode || original.aiMode);
        const modelWasExplicit = Boolean(original.model || original.aiModel);

        if (!providerWasExplicit && request.modelProfile?.provider) {
            settings.provider = request.modelProfile.provider;
            settings.mode = contracts.getCapabilities(settings.provider).local ? 'local' : 'api';
            if (!modelWasExplicit && !request.modelProfile?.model) {
                settings.model = contracts.defaultModelForProvider(settings.provider);
            }
        }
        if (!modelWasExplicit && request.modelProfile?.model) {
            settings.model = request.modelProfile.model;
        }
        return settings;
    }

    function getAdapter(adapterId) {
        return window.AIProviders && window.AIProviders[adapterId];
    }

    function selectAdapter(aiRequest, settingsInput) {
        const { contracts } = requireContracts();
        const request = contracts.createRequest(aiRequest);
        const settings = buildSettingsForRequest(request, settingsInput);
        const capabilities = contracts.getCapabilities(settings.provider);
        const adapter = getAdapter(capabilities.adapter);

        if (!adapter || typeof adapter.canHandle !== 'function' || !adapter.canHandle(request, settings)) {
            return null;
        }

        return {
            adapter,
            adapterId: adapter.id || capabilities.adapter,
            provider: settings.provider,
            capabilities,
            request,
            settings
        };
    }

    function canHandle(aiRequest, settingsInput) {
        return Boolean(selectAdapter(aiRequest, settingsInput));
    }

    async function run(aiRequest, settingsOrCallbacks, maybeCallbacks) {
        const { events, contracts } = requireContracts();
        const settingsInput = isCallbacks(settingsOrCallbacks) ? {} : (settingsOrCallbacks || {});
        const callbacks = isCallbacks(settingsOrCallbacks) ? settingsOrCallbacks : (maybeCallbacks || {});
        const selected = selectAdapter(aiRequest, settingsInput);

        if (!selected) {
            const request = contracts.createRequest(aiRequest);
            const settings = buildSettingsForRequest(request, settingsInput);
            throw new Error(tr(
                'alerts.aiAdapterUnavailable',
                { provider: settings.provider },
                `No AI adapter is available for provider "${settings.provider}"`
            ));
        }

        const runId = makeRunId();
        let outputText = '';
        let outputJson = null;
        let usage = null;
        let finishReason = null;
        let doneEventSeen = false;

        function dispatch(event) {
            if (!event || !event.type) return;
            if (event.type === 'text_delta') {
                outputText += event.text || '';
                if (typeof callbacks.onToken === 'function') callbacks.onToken(event.text || '');
            } else if (event.type === 'json_delta') {
                outputText += event.text || '';
            } else if (event.type === 'usage') {
                usage = event.usage || usage;
            } else if (event.type === 'done') {
                doneEventSeen = true;
                finishReason = event.finishReason || finishReason;
                if (event.outputJson !== undefined) outputJson = event.outputJson;
            }

            if (typeof callbacks.onEvent === 'function') {
                callbacks.onEvent(event);
            }
        }

        dispatch(events.start(runId, {
            provider: selected.provider,
            model: selected.settings.model || selected.request.modelProfile?.model || '',
            task: selected.request.task,
            adapter: selected.adapterId
        }));

        contracts.DebugLog.safe('orchestrator.run', {
            runId,
            provider: selected.provider,
            model: selected.settings.model,
            task: selected.request.task,
            adapter: selected.adapterId,
            stream: selected.request.stream
        });

        try {
            const result = await selected.adapter.send(selected.request, selected.settings, {
                onEvent: dispatch
            });

            if (result) {
                outputText = result.outputText !== undefined ? result.outputText : outputText;
                outputJson = result.outputJson !== undefined ? result.outputJson : outputJson;
                usage = result.usage || usage;
                finishReason = result.finishReason || finishReason;
            }

            const finalResult = {
                runId,
                outputText,
                outputJson,
                usage,
                finishReason,
                provider: selected.provider,
                model: selected.settings.model || selected.request.modelProfile?.model || '',
                adapter: selected.adapterId
            };

            if (!doneEventSeen) {
                dispatch(events.done(finalResult, {
                    provider: selected.provider,
                    model: finalResult.model,
                    adapter: selected.adapterId
                }));
            }

            return finalResult;
        } catch (error) {
            const normalizedError = {
                message: error && error.message ? error.message : String(error),
                provider: selected.provider,
                status: error && error.status ? error.status : null
            };
            dispatch(events.error(normalizedError, {
                runId,
                adapter: selected.adapterId
            }));
            if (typeof callbacks.onError === 'function') callbacks.onError(error);
            throw error;
        }
    }

    window.AIOrchestrator = {
        run,
        canHandle,
        selectAdapter,
        _test: {
            buildSettingsForRequest,
            makeRunId,
            isCallbacks
        }
    };
})();
