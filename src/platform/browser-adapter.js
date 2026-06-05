// Browser platform adapter. Tauri-specific behavior can replace this object later.
(function () {
    function tauriGlobal() {
        return window.__TAURI__ || window.__TAURI_INTERNALS__ || null;
    }

    function tauriInvoke(command, payload, options) {
        if (window.__TAURI__?.core?.invoke) {
            return window.__TAURI__.core.invoke(command, payload, options);
        }
        if (window.__TAURI_INTERNALS__?.invoke) {
            return window.__TAURI_INTERNALS__.invoke(command, payload, options);
        }
        return null;
    }

    function canTauriInvoke() {
        return Boolean(window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke);
    }

    function isTauri() {
        return Boolean(tauriGlobal() || window.__TAURI_IPC__);
    }

    function tauriDialog() {
        const dialog = tauriGlobal()?.dialog;
        if (dialog) return dialog;
        if (!canTauriInvoke()) return null;
        return {
            open(options = {}) {
                return tauriInvoke('plugin:dialog|open', { options });
            },
            save(options = {}) {
                return tauriInvoke('plugin:dialog|save', { options });
            }
        };
    }

    function tauriFs() {
        const fs = tauriGlobal()?.fs;
        if (fs) return fs;
        if (!canTauriInvoke()) return null;
        return {
            async readTextFile(path, options) {
                const result = await tauriInvoke('plugin:fs|read_text_file', { path, options });
                if (typeof result === 'string') return result;
                const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : Uint8Array.from(result);
                return new TextDecoder(options?.encoding || 'utf-8').decode(bytes);
            },
            async writeTextFile(path, data, options) {
                await tauriInvoke('plugin:fs|write_text_file', new TextEncoder().encode(data), {
                    headers: {
                        path: encodeURIComponent(path),
                        options: JSON.stringify(options)
                    }
                });
            }
        };
    }

    function hasTauriFileApi() {
        const dialog = tauriDialog();
        const fs = tauriFs();
        return Boolean(
            isTauri() &&
            dialog &&
            fs &&
            typeof dialog.open === 'function' &&
            typeof dialog.save === 'function' &&
            typeof fs.readTextFile === 'function' &&
            typeof fs.writeTextFile === 'function'
        );
    }

    function hasTauriSecretApi() {
        return Boolean(isTauri() && canTauriInvoke());
    }

    function hasTauriAiProxyApi() {
        return Boolean(isTauri() && canTauriInvoke());
    }

    function hasTauriSqliteStorageApi() {
        return Boolean(isTauri() && canTauriInvoke());
    }

    function safeFilename(filename, fallback) {
        const name = String(filename || fallback || 'writingway-export.json').trim();
        return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || fallback || 'writingway-export.json';
    }

    function normalizeSecretKey(key) {
        const normalized = String(key || '').trim();
        if (!normalized) throw new Error('Secret key is required.');
        return normalized;
    }

    function translate(key, fallback) {
        if (window.I18n && typeof window.I18n.t === 'function') {
            return window.I18n.t(key, null, fallback);
        }
        if (typeof window.t === 'function') {
            return window.t(key, null, fallback);
        }
        return fallback;
    }

    async function downloadBlob(filename, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeFilename(filename, 'writingway-export.json');
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function downloadJson(filename, data) {
        const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        if (hasTauriFileApi()) {
            const target = await tauriDialog().save({
                title: translate('common.export', 'Export'),
                defaultPath: safeFilename(filename, 'writingway-export.json'),
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (!target) return { canceled: true };
            await tauriFs().writeTextFile(target, body);
            return { path: target };
        }
        const blob = new Blob([body], { type: 'application/json;charset=utf-8' });
        await downloadBlob(filename, blob);
        return { path: null };
    }

    async function openJsonFile() {
        if (hasTauriFileApi()) {
            const selected = await tauriDialog().open({
                title: translate('common.import', 'Import'),
                multiple: false,
                directory: false,
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            const filePath = Array.isArray(selected) ? selected[0] : selected;
            if (!filePath) return null;
            const text = await tauriFs().readTextFile(filePath);
            return JSON.parse(text);
        }
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.style.display = 'none';
            input.addEventListener('change', async () => {
                const file = input.files && input.files[0];
                input.remove();
                if (!file) {
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(await file.text()));
                } catch (error) {
                    reject(error);
                }
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        });
    }

    async function saveSecret(key, value) {
        const secretKey = normalizeSecretKey(key);
        const secretValue = String(value || '');
        if (hasTauriSecretApi()) {
            if (!secretValue) return invoke('writingway2_delete_secret', { key: secretKey });
            return invoke('writingway2_save_secret', { key: secretKey, value: secretValue });
        }
        localStorage.setItem(`writingway:secret:${secretKey}`, secretValue);
    }

    async function loadSecret(key) {
        const secretKey = normalizeSecretKey(key);
        if (hasTauriSecretApi()) {
            return invoke('writingway2_load_secret', { key: secretKey });
        }
        return localStorage.getItem(`writingway:secret:${secretKey}`) || '';
    }

    async function deleteSecret(key) {
        const secretKey = normalizeSecretKey(key);
        if (hasTauriSecretApi()) {
            return invoke('writingway2_delete_secret', { key: secretKey });
        }
        localStorage.removeItem(`writingway:secret:${secretKey}`);
    }

    async function proxyAIChatCompletion(request) {
        if (!hasTauriAiProxyApi()) {
            throw new Error('Native AI proxy is not available in browser mode.');
        }
        return invoke('writingway2_ai_chat_completion', { request });
    }

    async function getSqliteStorageStatus() {
        if (!hasTauriSqliteStorageApi()) {
            throw new Error('Native SQLite storage is not available in browser mode.');
        }
        return invoke('writingway2_sqlite_storage_status', {});
    }

    async function invoke(command, payload) {
        if (canTauriInvoke()) {
            return tauriInvoke(command, payload);
        }
        throw new Error('Platform invoke is not available in browser mode.');
    }

    async function openExternal(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    if (!window.PlatformAdapter) {
        window.PlatformAdapter = {
            get kind() {
                return isTauri() ? 'tauri' : 'browser';
            },
            isTauri,
            hasTauriFileApi,
            hasTauriSecretApi,
            hasTauriAiProxyApi,
            hasTauriSqliteStorageApi,
            downloadBlob,
            downloadJson,
            openJsonFile,
            saveSecret,
            loadSecret,
            deleteSecret,
            proxyAIChatCompletion,
            getSqliteStorageStatus,
            invoke,
            openExternal,
            _test: {
                tauriGlobal,
                canTauriInvoke,
                tauriInvoke,
                tauriDialog,
                tauriFs,
                hasTauriSecretApi,
                hasTauriAiProxyApi,
                hasTauriSqliteStorageApi,
                normalizeSecretKey,
                translate,
                safeFilename
            }
        };
    }
})();
