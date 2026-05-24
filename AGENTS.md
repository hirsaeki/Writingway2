# AGENTS.md — Coding Agent Instructions for Writingway 2

This file is for coding agents working in this repository. It supersedes older handoff notes only for the AI / beat-template / plot-planning / Tauri modernization work.

## Read order

1. `CODING_AGENT_HANDOFF.md`
2. `docs/agent/00-doc-index.md`
3. `docs/agent/01-current-state-audit.md`
4. `docs/agent/02-target-architecture.md`
5. `docs/agent/03-ai-gateway-spec.md`
6. `docs/agent/04-beat-template-and-plot-spec.md`
7. `docs/agent/05-tauri-desktop-plan.md`
8. `docs/agent/06-implementation-tasks.md`
9. `docs/agent/07-testing-and-acceptance.md`
10. `docs/agent/08-risk-register.md`
11. `docs/agent/09-agent-prompts.md`

Older files such as `docs/archives/HANDOFF.md`, `PRODUCT_REFACTORING_PLAN.md`, and `PRODUCT_REFACTORING_TASKS.md` are still useful history. However, the current source already contains many completed product-refactor tasks. When there is a conflict, use the files listed above for this modernization project.

## Current repository shape

Writingway 2 is currently a static browser app:

- `main.html` is the primary UI.
- `src/app.js` creates the Alpine application and delegates to global modules.
- `src/db.js` owns the Dexie/IndexedDB schema and migrations.
- `src/generation.js` owns the main AI prompt building, provider request building, streaming parsing, and retry helpers.
- `src/modules/beats.js` owns structural story beats and simple beat templates.
- `src/modules/data-management.js` owns JSON export/import.
- `src/modules/ai-settings.js` owns provider configuration and model fetching.
- `tests/*.js` are mostly Playwright-based browser tests.

Do not assume there is a bundler. The app loads scripts directly from `main.html` in order.

## Non-negotiables

- Keep the browser version working while adding desktop/Tauri support.
- Do not replace Dexie/IndexedDB immediately. Add adapters first; migrate storage only after the data contracts are stable.
- Do not perform a broad rewrite of `src/app.js` unless a specific task requires a local extraction.
- Preserve existing user data through Dexie migrations. Never clear or overwrite local data without explicit user confirmation.
- Do not remove Writingway 1 import, Compendium, Workshop Chat, prompt management, Gist backup, or current JSON export/import.
- Do not hard-code API keys, model paths, local usernames, or absolute machine-specific paths.
- Do not log full prompts, scene text, API keys, or generated manuscripts in production paths.
- Do not ship model files or download models automatically.
- Keep English and Japanese UI strings in sync through `src/i18n.js`.
- Use official provider APIs and conservative adapter boundaries. Provider-specific quirks belong in provider adapters, not UI code.

## Implementation style

- Prefer small, phase-based commits.
- Preserve the existing global-module style unless a phase explicitly creates a new module namespace.
- Add new modules as plain browser-compatible JavaScript unless the phase explicitly introduces Tauri or a build step.
- Keep public wrapper methods stable during refactors. For example, `window.Generation.buildPrompt()` and `window.Generation.streamGeneration()` should continue to work until all callers are migrated.
- Add `_test` helpers to modules when browser-based tests need to inspect private functions.
- Use JSON schemas in `docs/schemas/` as the implementation contract for structured AI outputs and import/export formats.

## Test setup

Recommended local setup:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm run test
```

Useful targeted tests:

```bash
node tests/smoke.js
node tests/gen-buildPrompt.js
node tests/data-management.js
node tests/beats.js
```

If running through a local HTTP server:

```bash
python3 -m http.server 8787
APP_URL=http://localhost:8787/main.html pnpm run test
```

If a test cannot be run because dependencies are missing, state that explicitly in the handoff. Do not claim success without running the command.

## Tauri-specific rules

- Tauri work must start as a thin wrapper around the current browser app.
- Vendor CDN dependencies before packaging.
- Use capability-scoped permissions. Do not grant broad filesystem or shell permissions by default.
- API-key storage and AI proxying should move behind platform adapters. Browser mode may keep localStorage; Tauri mode should use a secure store once implemented.
- SQLite is a later phase. JSON export/import is the migration source of truth.
- Local model sidecars are a later phase. Initial desktop support should connect to user-managed local servers such as LM Studio or Ollama through OpenAI-compatible HTTP endpoints.

## Definition of done for each phase

A phase is not complete until:

1. Browser app still loads.
2. Existing relevant behavior still works.
3. Data migrations are backward compatible.
4. New UI strings exist in English and Japanese.
5. Tests are added or updated for the changed behavior.
6. Manual verification notes are written when automated tests are insufficient.
7. The next agent can continue from the docs without reverse-engineering intent.
