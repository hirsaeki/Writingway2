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

Do not add broader filesystem, shell, sidecar, updater, or SQL permissions unless a later hardening subphase explicitly needs them.
