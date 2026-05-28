// Browser platform adapter. Tauri-specific behavior can replace this object later.
(function () {
    function tauriGlobal() {
        return window.__TAURI__ || window.__TAURI_INTERNALS__ || null;
    }

    function isTauri() {
        return Boolean(tauriGlobal() || window.__TAURI_IPC__);
    }

    function safeFilename(filename, fallback) {
        const name = String(filename || fallback || 'writingway-export.json').trim();
        return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || fallback || 'writingway-export.json';
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
        const blob = new Blob([body], { type: 'application/json;charset=utf-8' });
        await downloadBlob(filename, blob);
    }

    async function openJsonFile() {
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
        const tauri = tauriGlobal();
        if (isTauri() && tauri?.core?.invoke) {
            return tauri.core.invoke(command, payload);
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
                safeFilename
            }
        };
    }
})();
