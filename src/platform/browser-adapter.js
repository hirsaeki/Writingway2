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

    function safeFilename(filename, fallback) {
        const name = String(filename || fallback || 'writingway-export.json').trim();
        return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || fallback || 'writingway-export.json';
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
        localStorage.setItem(`writingway:secret:${key}`, String(value || ''));
    }

    async function loadSecret(key) {
        return localStorage.getItem(`writingway:secret:${key}`) || '';
    }

    async function deleteSecret(key) {
        localStorage.removeItem(`writingway:secret:${key}`);
    }

    async function invoke(command, payload) {
        const result = tauriInvoke(command, payload);
        if (result) {
            return result;
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
            downloadBlob,
            downloadJson,
            openJsonFile,
            saveSecret,
            loadSecret,
            deleteSecret,
            invoke,
            openExternal,
            _test: {
                tauriGlobal,
                canTauriInvoke,
                tauriInvoke,
                tauriDialog,
                tauriFs,
                translate,
                safeFilename
            }
        };
    }
})();
