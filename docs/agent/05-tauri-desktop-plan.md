# Tauri Desktop Plan

## Purpose

Tauri support should make Writingway 2 installable as a desktop app without breaking the current browser version. Desktop work should be phased. The first milestone is a thin wrapper; storage migration, secure key storage, sidecars, and updater come later.

## Why Tauri fits this repository

Writingway 2 is already an HTML/CSS/JavaScript app. Tauri can package a web frontend while exposing native capabilities through a Rust backend and scoped permissions. This makes it suitable for a gradual transition.

## Goals

- Package the current app as a Windows/macOS/Linux desktop app.
- Preserve the browser version.
- Keep Dexie/IndexedDB as the first desktop storage layer.
- Vendor CDN dependencies for offline packaging.
- Add platform abstraction before native features.
- Add secure API-key storage later.
- Add SQLite later only after JSON export/import and data contracts are stable.
- Add local model sidecar support later, not first.

## Non-goals for the first Tauri milestone

- No immediate SQLite migration.
- No immediate llama.cpp sidecar management.
- No broad Rust rewrite of AI logic.
- No removal of the browser startup scripts.
- No new frontend framework requirement.

## Tauri phase order

### T0 — Desktop readiness for current static app

Before adding `src-tauri`, make the frontend package-ready.

Tasks:

- Vendor Dexie locally.
- Vendor JSZip locally.
- Ensure `main.html` references local vendor files.
- Confirm `file://` and local HTTP modes still work if tests use either.
- Remove or guard any browser-only assumptions that fail in WebView.
- Add `window.PlatformAdapter` with browser implementation.

Acceptance:

- Browser app loads without network access for JS dependencies.
- `pnpm run test` still passes.

### T1 — Tauri thin wrapper

Add a minimal Tauri v2 app.

Suggested tree:

```text
src-tauri/
  Cargo.toml
  tauri.conf.json
  build.rs
  capabilities/
    default.json
  src/
    main.rs
    lib.rs
```

Tasks:

- Configure Tauri to load the existing frontend.
- Add a basic app window.
- Add minimal capabilities only.
- Add package scripts to `package.json`.
- Add a Tauri platform adapter detection path.
- Do not change app storage yet.

Acceptance:

- Browser app still works.
- Tauri app opens `main.html`.
- Data can still be created and read in the app.
- No broad filesystem or shell permissions are granted.

### T2 — Desktop file operations

Move desktop export/import from browser downloads/file inputs toward native dialogs and filesystem APIs.

Tasks:

- Add platform methods:
  - `saveJsonFile(defaultName, data)`
  - `openJsonFile()`
  - `showSaveDialog()` if needed
- Keep browser fallback behavior.
- Use Tauri filesystem/dialog permissions with narrow scopes.

Acceptance:

- Browser JSON export/import still works.
- Tauri JSON export/import can use native file dialogs.
- Imported files are validated before writing to storage.

### T3 — Secure secrets for desktop

Move API-key storage to a desktop-safe path.

Tasks:

- Add `saveSecret`, `loadSecret`, and `deleteSecret` to platform adapter.
- Use Tauri secure storage such as Stronghold/keyring when implemented.
- Keep localStorage only for browser mode.
- Avoid keeping API keys in long-lived renderer state when possible.
- Consider Rust command proxy for cloud AI calls after secure storage exists.

Acceptance:

- Browser settings remain compatible.
- Tauri settings do not require plaintext API keys in localStorage.
- No API key appears in logs.

### T4 — Optional SQLite storage adapter

Only start after:

- Beat Template v2 is stable.
- Plot plan tables are stable.
- Data export/import includes all new tables.
- Tauri thin wrapper works.

Tasks:

- Define SQLite schema from stabilized Dexie data model.
- Implement `StorageAdapter` interface for SQLite.
- Use JSON export/import as migration source.
- Add a one-time migration/import flow.
- Keep Dexie as browser storage.

Acceptance:

- Browser uses Dexie.
- Tauri can use SQLite or still fallback to Dexie during transition.
- A Dexie JSON backup can import into SQLite.
- No data loss during migration tests.

### T5 — Optional local AI sidecar

Only start after:

- OpenAI-compatible local endpoints work through the AI Gateway.
- The Tauri wrapper is stable.
- User-managed LM Studio/Ollama setup is supported.

Tasks:

- Package or configure llama.cpp server as a sidecar.
- Add start/stop/status/log UI.
- Scope shell/sidecar permissions narrowly.
- Do not bundle large models by default.
- Let users choose model files explicitly.

Acceptance:

- Users can still use LM Studio/Ollama without the sidecar.
- Sidecar can be started/stopped safely.
- No model files are automatically downloaded.

### T6 — Updater and release packaging

Tasks:

- Add updater only after stable builds.
- Document signing/notarization requirements per OS.
- Add release checklist.
- Include browser ZIP release path if still desired.

## Platform adapter

Add a global adapter early:

```js
window.PlatformAdapter = {
  kind: 'browser',
  isTauri() {
    return !!window.__TAURI_INTERNALS__ || !!window.__TAURI__;
  },
  async downloadJson(filename, data) {},
  async openJsonFile() {},
  async saveSecret(key, value) {},
  async loadSecret(key) {},
  async deleteSecret(key) {},
  async invoke(command, payload) {},
  async openExternal(url) {}
};
```

For browser mode:

- `downloadJson` uses Blob + anchor click.
- `openJsonFile` uses file input wrappers or remains UI-driven.
- secrets use localStorage with user warning.

For Tauri mode later:

- file save/open use Tauri APIs.
- secrets use secure storage.
- `invoke` uses Tauri commands.
- `openExternal` uses Tauri shell/opener APIs with permissions.

## Storage adapter

Keep a storage adapter separate from platform adapter.

```js
window.StorageAdapter = {
  kind: 'dexie',
  async listProjects() {},
  async getTemplate(id) {},
  async saveTemplate(template) {},
  async listPlotPlans(projectId) {},
  async savePlotPlan(plan) {},
  async exportAll() {},
  async importAll(envelope) {}
};
```

Initial implementation can wrap existing Dexie calls. SQLite implementation comes later.

## Security requirements

- Tauri capabilities should grant only commands needed by the current phase.
- Avoid broad filesystem access.
- Avoid broad shell access.
- Do not put API keys in command-line arguments.
- Do not write full prompts/manuscripts to logs.
- Validate imported JSON before writing to storage.
- Treat AI output as untrusted input.
- Keep remote URLs explicit and user-configurable.

## Desktop-specific UI notes

Add subtle desktop affordances only when Tauri is detected:

- `Desktop mode` badge in diagnostics/settings.
- Native file export/import buttons if available.
- Secure-key storage indicator.
- Local AI helper/status only when implemented.

Avoid making browser users see desktop-only errors.

## Package scripts

Potential package scripts after Tauri is added:

```json
{
  "scripts": {
    "dev": "python3 -m http.server 8787",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "test": "pnpm run smoke && pnpm run unit && pnpm run ui"
  }
}
```

Use the exact Tauri CLI package names chosen during implementation.

## Official documentation references

Keep these references current when implementing:

- Tauri overview/start: `https://v2.tauri.app/start/`
- Tauri configuration: `https://v2.tauri.app/develop/configuration-files/`
- Tauri permissions/capabilities: `https://v2.tauri.app/security/permissions/`
- Tauri filesystem plugin: `https://v2.tauri.app/plugin/file-system/`
- Tauri SQL plugin: `https://v2.tauri.app/plugin/sql/`
- Tauri Stronghold plugin: `https://v2.tauri.app/plugin/stronghold/`
- Tauri sidecar guide: `https://v2.tauri.app/develop/sidecar/`

## Done when for the first desktop milestone

- The app builds or runs in Tauri.
- Browser mode still works.
- CDN JavaScript dependencies are vendored.
- Dexie storage still works.
- JSON export/import still works.
- Permissions are minimal.
- No API-key or storage migration is forced yet.
