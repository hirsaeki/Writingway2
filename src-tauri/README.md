# Writingway 2 Tauri Wrapper

This is the minimal Tauri v2 wrapper for the existing static browser app.

Prerequisites:

- Rust toolchain with Cargo.
- System WebView dependencies required by Tauri for your OS.
- Node dependencies installed with `pnpm install`.

Useful commands:

```bash
pnpm run tauri:dev
pnpm run tauri:build
```

Storage remains Dexie/IndexedDB in this phase. SQLite, secure key storage, and local model sidecars are intentionally deferred.

Native JSON backup export/import uses only:

- dialog `open` / `save`
- filesystem `readTextFile` / `writeTextFile`

API keys are stored through the app's `secure-secrets` permission, which allows only:

- `writingway2_save_secret`
- `writingway2_load_secret`
- `writingway2_delete_secret`

The renderer should call these through `PlatformAdapter.saveSecret`, `PlatformAdapter.loadSecret`, and `PlatformAdapter.deleteSecret`; do not write API keys into normal settings storage in Tauri mode.

OpenAI-compatible cloud generation can use the app's `ai-proxy` permission, which allows only:

- `writingway2_ai_chat_completion`

The renderer should call this through `PlatformAdapter.proxyAIChatCompletion`. The command reads `ai.apiKey` from native secret storage and does not accept API-key headers from the renderer.

SQLite readiness can use the app's `sqlite-storage` permission, which allows only:

- `writingway2_sqlite_storage_status`

The renderer should call this through `PlatformAdapter.getSqliteStorageStatus` or `StorageAdapter.getNativeSqliteStatus`. D1 opens the future SQLite database file in the app data directory for readiness checks only; Dexie remains the active storage backend and no app data is migrated or mirrored.

Do not add broader filesystem, shell, sidecar, updater, or SQL permissions unless a later hardening subphase explicitly needs them.
