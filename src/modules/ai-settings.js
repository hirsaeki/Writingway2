// AI Settings Module
// Handles AI configuration: provider selection, model fetching, settings persistence, connection testing
(function () {
    const tr = (app, key, params, fallback) => app && typeof app.t === 'function' ? app.t(key, params, fallback) : (window.t ? window.t(key, params, fallback) : (fallback || key));

    const AISettings = {
        /**
         * Fetch available models from the current provider
         * @param {Object} app - Alpine app instance
         */
        async fetchProviderModels(app) {
            // Fetch available models from the current provider
            // LM Studio doesn't require an API key
            if (app.aiMode !== 'api' || (!app.aiApiKey && app.aiProvider !== 'lmstudio')) return;
            if (app.fetchingModels) return; // Prevent duplicate fetches

            try {
                app.fetchingModels = true;

                if (app.aiProvider === 'openrouter') {
                    // OpenRouter has a models API endpoint
                    const response = await fetch('https://openrouter.ai/api/v1/models', {
                        headers: {
                            'Authorization': `Bearer ${app.aiApiKey}`
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        // Filter and format models, prioritize free ones
                        app.providerModels.openrouter = data.data
                            .filter(m => m.id) // Has valid ID
                            .sort((a, b) => {
                                // Free models first
                                const aFree = a.id.includes(':free');
                                const bFree = b.id.includes(':free');
                                if (aFree && !bFree) return -1;
                                if (!aFree && bFree) return 1;
                                // Then alphabetically by name
                                const aName = (a.name || a.id).toLowerCase();
                                const bName = (b.name || b.id).toLowerCase();
                                return aName.localeCompare(bName);
                            })
                            .map(m => ({
                                id: m.id,
                                name: m.name || m.id,
                                recommended: m.id.includes(':free') || m.id.includes('gemini-2.0-flash')
                            }));
                        app.modelsFetched = true;
                    }
                } else if (app.aiProvider === 'openai') {
                    // OpenAI has a models API
                    const response = await fetch('https://api.openai.com/v1/models', {
                        headers: {
                            'Authorization': `Bearer ${app.aiApiKey}`
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        // Filter to chat models only
                        app.providerModels.openai = data.data
                            .filter(m => m.id.includes('gpt'))
                            .map(m => ({
                                id: m.id,
                                name: m.id.toUpperCase().replace(/-/g, ' '),
                                recommended: m.id === 'gpt-4o' || m.id === 'gpt-4o-mini'
                            }));
                        app.modelsFetched = true;
                    }
                } else if (app.aiProvider === 'anthropic') {
                    // Anthropic doesn't have a public models API, keep hardcoded list
                    // (Their models are well-known and don't change often)
                    app.modelsFetched = true;
                } else if (app.aiProvider === 'google') {
                    // Google AI doesn't have a public models list API for free tier
                    // Keep hardcoded list
                    app.modelsFetched = true;
                } else if (app.aiProvider === 'nanogpt') {
                    // NanoGPT doesn't have a public models list API
                    // User enters model name manually
                    app.modelsFetched = true;
                } else if (app.aiProvider === 'lmstudio') {
                    // LM Studio uses OpenAI-compatible API at /v1/models
                    // Normalize endpoint: strip trailing slashes and any /v1/* paths
                    let endpoint = (app.aiEndpoint || 'http://localhost:1234').replace(/\/+$/, '');
                    // Remove /v1/models, /v1/chat/completions, or just /v1 if user included it
                    endpoint = endpoint.replace(/\/v1(\/.*)?$/, '');
                    try {
                        const response = await fetch(`${endpoint}/v1/models`, {
                            signal: AbortSignal.timeout(5000)
                        });
                        if (response.ok) {
                            const data = await response.json();
                            // LM Studio returns models in OpenAI format
                            app.providerModels.lmstudio = (data.data || [])
                                .filter(m => m.id)
                                .map((m, idx) => ({
                                    id: m.id,
                                    name: m.id,
                                    recommended: idx === 0 // First model as recommended
                                }));
                            app.modelsFetched = true;
                            // Auto-select first model if none selected
                            if (!app.aiModel && app.providerModels.lmstudio.length > 0) {
                                app.aiModel = app.providerModels.lmstudio[0].id;
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to fetch LM Studio models:', e);
                        // Keep empty list - user will need to ensure LM Studio is running
                        app.modelsFetched = true;
                    }
                }
            } catch (e) {
                console.error('Failed to fetch models:', e);
                // Fall back to hardcoded list on error
            } finally {
                app.fetchingModels = false;
            }
        },

        /**
         * Scan for available local models
         * @param {Object} app - Alpine app instance
         */
        async scanLocalModels(app) {
            try {
                // Note: Browser can't actually scan filesystem
                // The model name here is just for display - the actual model is whatever
                // llama-server.exe loaded from the models folder when you ran start.bat
                alert(tr(app, 'alerts.localModelInfo'));
            } catch (e) {
                console.error('Failed to scan models:', e);
                alert(tr(app, 'alerts.scanModelsFailed'));
            }
        },

        /**
         * Quick save for generation parameters (no validation/testing)
         * @param {Object} app - Alpine app instance
         */
        saveGenerationParams(app) {
            try {
                const settings = {
                    mode: app.aiMode,
                    provider: app.aiProvider,
                    apiKey: app.aiApiKey,
                    model: app.aiModel,
                    endpoint: app.aiEndpoint || (app.aiMode === 'local' ? 'http://localhost:8080' : ''),
                    temperature: app.temperature,
                    maxTokens: app.maxTokens,
                    useProviderDefaults: app.useProviderDefaults || false,
                    forceNonStreaming: app.forceNonStreaming || false
                };
                localStorage.setItem('writingway:aiSettings', JSON.stringify(settings));
            } catch (e) {
                console.error('Failed to save generation params:', e);
            }
        },

        /**
         * Save AI settings and test connection
         * @param {Object} app - Alpine app instance
         */
        async saveAISettings(app) {
            try {
                // Save settings to localStorage
                const settings = {
                    mode: app.aiMode,
                    provider: app.aiProvider,
                    apiKey: app.aiApiKey,
                    model: app.aiModel,
                    endpoint: app.aiEndpoint || (app.aiMode === 'local' ? 'http://localhost:8080' : ''),
                    temperature: app.temperature,
                    maxTokens: app.maxTokens,
                    useProviderDefaults: app.useProviderDefaults || false,
                    forceNonStreaming: app.forceNonStreaming || false
                };
                localStorage.setItem('writingway:aiSettings', JSON.stringify(settings));

                // Test connection
                app.showModelLoading = true;
                app.loadingMessage = tr(app, 'status.testingConnection');
                app.loadingProgress = 50;

                if (app.aiMode === 'local') {
                    // Test local server with retry logic for model loading
                    const endpoint = app.aiEndpoint || 'http://localhost:8080';
                    const maxRetries = 60; // Try for up to ~3 minutes (60 * 3s) - large models can take time
                    const retryDelay = 3000; // 3 seconds between retries
                    let attempt = 0;
                    let connected = false;

                    app.loadingMessage = tr(app, 'loading.connectingLocalAi');

                    while (attempt < maxRetries && !connected) {
                        try {
                            attempt++;
                            const progress = 50 + (attempt / maxRetries) * 45; // 50% to 95%
                            app.loadingProgress = Math.floor(progress);

                            const elapsed = Math.floor((attempt * retryDelay) / 1000);
                            app.loadingMessage = `${tr(app, 'status.testingConnection')} (${elapsed}s, ${attempt}/${maxRetries})`;

                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout per request

                            const response = await fetch(endpoint + '/health', {
                                signal: controller.signal
                            });
                            clearTimeout(timeoutId);

                            if (response.ok) {
                                connected = true;
                                app.aiStatus = 'ready';
                                app.aiStatusText = tr(app, 'status.aiReadyLocal');
                                app.loadingProgress = 100;
                                app.loadingMessage = tr(app, 'status.connected');
                                setTimeout(() => { app.showModelLoading = false; }, 500);
                                alert(tr(app, 'alerts.connectedLocal', { seconds: elapsed }));
                                break;
                            }
                        } catch (err) {
                            // If fetch fails or times out, wait and retry
                            if (attempt < maxRetries) {
                                await new Promise(resolve => setTimeout(resolve, retryDelay));
                            }
                        }
                    }

                    if (!connected) {
                        const elapsed = Math.floor((attempt * retryDelay) / 1000);
                        throw new Error(tr(app, 'alerts.localConnectFailed', { seconds: elapsed }));
                    }
                } else if (app.aiProvider === 'lmstudio') {
                    // Test LM Studio connection via /v1/models endpoint
                    // Normalize endpoint: strip trailing slashes and any /v1/* paths
                    let endpoint = (app.aiEndpoint || 'http://localhost:1234').replace(/\/+$/, '');
                    endpoint = endpoint.replace(/\/v1(\/.*)?$/, '');
                    app.loadingMessage = tr(app, 'loading.connectedTo', { provider: 'LM Studio' });

                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

                        const response = await fetch(`${endpoint}/v1/models`, {
                            signal: controller.signal
                        });
                        clearTimeout(timeoutId);

                        if (response.ok) {
                            const data = await response.json();
                            // Update model list
                            app.providerModels.lmstudio = (data.data || [])
                                .filter(m => m.id)
                                .map((m, idx) => ({
                                    id: m.id,
                                    name: m.id,
                                    recommended: idx === 0
                                }));
                            
                            // Auto-select first model if none selected
                            if (!app.aiModel && app.providerModels.lmstudio.length > 0) {
                                app.aiModel = app.providerModels.lmstudio[0].id;
                            }

                            // Save the normalized endpoint back
                            app.aiEndpoint = endpoint;

                            const modelCount = app.providerModels.lmstudio.length;
                            app.aiStatus = 'ready';
                            app.aiStatusText = tr(app, 'status.aiReadyWithModel', { model: 'LM Studio' });
                            app.loadingProgress = 100;
                            app.loadingMessage = tr(app, 'status.connected');
                            setTimeout(() => { app.showModelLoading = false; }, 500);
                            alert(tr(app, 'alerts.connectedLmStudio', { count: modelCount }));
                        } else {
                            throw new Error(tr(app, 'alerts.lmStudioStatus', { status: response.status }));
                        }
                    } catch (err) {
                        throw new Error(tr(app, 'alerts.lmStudioConnectFailed', { endpoint, error: err.message }));
                    }
                } else {
                    // Test API connection (basic validation)
                    if (!app.aiApiKey && app.aiProvider !== 'lmstudio') {
                        throw new Error(tr(app, 'alerts.apiKeyRequired'));
                    }
                    if (!app.aiModel && app.aiProvider !== 'lmstudio') {
                        throw new Error(tr(app, 'alerts.modelNameRequired'));
                    }

                    // Get the display name for the model
                    let modelDisplayName = app.aiModel;
                    if (app.providerModels[app.aiProvider]) {
                        const modelInfo = app.providerModels[app.aiProvider].find(m => m.id === app.aiModel);
                        if (modelInfo) {
                            modelDisplayName = modelInfo.name;
                        }
                    }

                    app.aiStatus = 'ready';
                    app.aiStatusText = tr(app, 'status.aiReadyWithModel', { model: modelDisplayName });
                    app.loadingProgress = 100;
                    setTimeout(() => { app.showModelLoading = false; }, 500);
                    alert(tr(app, 'alerts.apiSaved'));
                }

                app.showAISettings = false;
            } catch (e) {
                console.error('AI settings save/test failed:', e);
                app.aiStatus = 'error';
                app.aiStatusText = tr(app, 'status.connectionFailed');
                app.showModelLoading = false;
                alert(tr(app, 'alerts.connectionFailed', { error: e.message || e }));
            }
        },

        /**
         * Load AI settings from localStorage
         * @param {Object} app - Alpine app instance
         */
        async loadAISettings(app) {
            try {
                const saved = localStorage.getItem('writingway:aiSettings');
                if (saved) {
                    const settings = JSON.parse(saved);
                    app.aiMode = settings.mode || 'local';
                    app.aiProvider = settings.provider || 'anthropic';
                    app.aiApiKey = settings.apiKey || '';
                    const savedModel = settings.model || '';
                    app.aiEndpoint = settings.endpoint || '';
                    app.temperature = settings.temperature || 0.8;
                    app.maxTokens = settings.maxTokens || 300;
                    app.useProviderDefaults = settings.useProviderDefaults || false;
                    app.forceNonStreaming = settings.forceNonStreaming || false;

                    // Fetch fresh model list if we have API credentials (or LM Studio which doesn't need a key)
                    if (app.aiMode === 'api' && (app.aiApiKey || app.aiProvider === 'lmstudio')) {
                        await this.fetchProviderModels(app);
                    }

                    // Set model AFTER fetching the list to ensure the dropdown has the option
                    app.aiModel = savedModel;
                }
            } catch (e) {
                console.error('Failed to load AI settings:', e);
            }
        }
    };

    // Export to window
    window.AISettings = AISettings;

    // Expose test helpers
    window.__test = window.__test || {};
    window.__test.AISettings = AISettings;
})();
