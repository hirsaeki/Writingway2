// AI initialization helper
// Exposes window.AI.init(app) which performs the model health check and updates the app state
(function () {
    const tr = (app, key, params, fallback) => app && typeof app.t === 'function' ? app.t(key, params, fallback) : (window.t ? window.t(key, params, fallback) : (fallback || key));

    async function init(app) {
        try {
            // Check what mode the user has configured
            const aiMode = app.aiMode || 'api'; // Default to API mode
            const hasApiKey = app.aiApiKey && app.aiApiKey.length > 0;
            const provider = app.aiProvider || 'anthropic';

            // Providers that don't require an API key
            const noKeyRequired = provider === 'lmstudio';

            // If using API mode and has API key (or provider doesn't need one), mark as ready
            if (aiMode === 'api' && (hasApiKey || noKeyRequired)) {
                if (app.updateLoadingScreen) {
                    app.updateLoadingScreen(60, tr(app, 'loading.aiReady'), tr(app, 'loading.connectedTo', { provider }));
                }
                app.aiStatus = 'ready';

                // Get the display name for the model
                let modelDisplayName = app.aiModel;
                if (app.providerModels[provider]) {
                    const modelInfo = app.providerModels[provider].find(m => m.id === app.aiModel);
                    if (modelInfo) {
                        modelDisplayName = modelInfo.name;
                    }
                }

                app.aiStatusText = tr(app, 'status.aiReadyWithModel', { model: modelDisplayName || provider });
                console.log(`✓ AI configured with ${provider}${noKeyRequired ? ' (no API key required)' : ''}`);
                return;
            }

            // If using local mode, try to connect to llama-server
            if (aiMode === 'local') {
                if (app.updateLoadingScreen) {
                    app.updateLoadingScreen(55, tr(app, 'loading.connectingAi'), tr(app, 'loading.checkingLocalServer'));
                }
                app.loadingMessage = tr(app, 'loading.connectingLocalAi');
                app.loadingProgress = 30;

                const endpoint = app.aiEndpoint || 'http://localhost:8080';
                const response = await fetch(endpoint + '/health', {
                    method: 'GET',
                    signal: AbortSignal.timeout(3000) // 3 second timeout
                });

                if (response.ok) {
                    if (app.updateLoadingScreen) {
                        app.updateLoadingScreen(65, tr(app, 'loading.aiConnected'), tr(app, 'loading.localServerReady'));
                    }
                    app.loadingProgress = 100;
                    app.loadingMessage = tr(app, 'loading.connectedToAi');

                    await new Promise(resolve => setTimeout(resolve, 500));

                    app.aiStatus = 'ready';
                    app.aiStatusText = tr(app, 'status.aiReadyLocalServer');
                    app.showModelLoading = false;

                    console.log('✓ Connected to llama-server successfully');
                    return;
                }
            }

            // If we get here, no AI is configured
            if (app.updateLoadingScreen) {
                app.updateLoadingScreen(60, tr(app, 'loading.aiNotConfigured'), tr(app, 'loading.setupLater'));
            }
            app.aiStatus = 'not-configured';
            app.aiStatusText = tr(app, 'status.configureAi');
            app.showModelLoading = false;

            // Detailed logging for debugging configuration issues
            const configDetails = [];
            if (aiMode === 'api') {
                if (!hasApiKey && !noKeyRequired) {
                    configDetails.push(`Missing API key for ${provider}`);
                }
            }
            console.log('ℹ️ AI not configured. Click "Configure AI" to set up.');
            if (configDetails.length > 0) {
                console.log('   Reason:', configDetails.join(', '));
            }

        } catch (error) {
            // Connection failed or timeout - gracefully handle
            console.log('AI connection attempt failed (this is OK for first-time users):', error.message);

            if (app.aiMode === 'local') {
                if (app.updateLoadingScreen) {
                    app.updateLoadingScreen(60, tr(app, 'loading.localAiOffline'), tr(app, 'loading.setupLater'));
                }
                app.aiStatus = 'error';
                app.aiStatusText = tr(app, 'status.localServerOffline');
                console.log('💡 To use local AI: Run start.bat or configure an API provider');
            } else {
                if (app.updateLoadingScreen) {
                    app.updateLoadingScreen(60, tr(app, 'loading.aiNotConfigured'), tr(app, 'loading.configureInSettings'));
                }
                app.aiStatus = 'not-configured';
                app.aiStatusText = tr(app, 'status.configureAi');
                console.log('💡 Click "Configure AI" to set up an API provider');
            }

            app.showModelLoading = false;
        }
    }

    window.AI = window.AI || {};
    window.AI.init = init;
})();
