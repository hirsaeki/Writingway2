# Implementation Tasks

Use this as the main task board for the coding agent. Work in order. Each phase should leave the browser app usable.

## Global preflight

- [ ] Read `AGENTS.md` and `CODING_AGENT_HANDOFF.md`.
- [ ] Confirm current scripts in `main.html` and loading order.
- [ ] Confirm Dexie schema latest version before adding new migrations.
- [ ] Run or attempt baseline tests:
  - [ ] `pnpm install`
  - [ ] `pnpm exec playwright install chromium`
  - [ ] `pnpm run test`
  - [ ] `node tests/beats.js`
  - [ ] `node tests/data-management.js`
- [ ] Record any dependency/test failures before code changes.

Done when:

- [ ] You know which tests pass at baseline or why they cannot run.
- [ ] No stale doc is being treated as current implementation truth.

---

## Phase 1 — Beat Template v2 and full BS2

### Goal

Make templates rich enough for AI planning while preserving existing simple templates.

### Touched files

- `src/db.js`
- `src/modules/beats.js`
- `src/modules/data-management.js`
- `src/state/app-state.js` if UI state is needed
- `main.html`
- `src/i18n.js`
- `tests/beats.js`
- New optional `tests/beat-template-v2.js`

### Tasks

- [ ] Add `BeatTemplateService` or equivalent helper functions.
- [ ] Implement `normalizeTemplate(template)`.
- [ ] Implement `normalizeSlot(slot, index)`.
- [ ] Implement stable `slugifySlotId(title, index)`.
- [ ] Add v2 built-in templates as object-slot templates.
- [ ] Add full BS2 15-slot template with ID `preset-save-the-cat-bs2-v2`.
- [ ] Preserve old simplified `preset-save-the-cat` or migrate safely without overwriting custom data.
- [ ] Add Dexie v12 migration to normalize existing templates.
- [ ] Update `ensureTemplates()` to seed missing v2 built-ins.
- [ ] Update `createBeatsFromTemplate()` to handle both string and object slots.
- [ ] Store stable `templateSlotId` from `slot.id` for object slots.
- [ ] Update custom template creation to create v2 slot objects from newline names.
- [ ] Update template export to version 2.
- [ ] Update template import to accept v1 and v2.
- [ ] Update tests to verify v1 compatibility and v2 behavior.
- [ ] Update English/Japanese UI strings if any labels change.

### Acceptance

- [ ] Existing string-slot templates still work.
- [ ] New full BS2 template has 15 slots.
- [ ] Applying any template creates beats.
- [ ] Beats from v2 template use stable slot IDs.
- [ ] v1 template imports normalize to v2.
- [ ] v2 template exports/imports round-trip.
- [ ] Data Management all/project export still includes templates.
- [ ] Tests pass or failures are documented.

---

## Phase 2 — AI Gateway foundation

### Goal

Introduce AI Orchestrator and provider adapter interfaces without breaking current generation.

### Touched files

- New `src/ai/ai-orchestrator.js`
- New `src/ai/ai-contracts.js`
- New `src/ai/ai-events.js`
- New `src/ai/providers/openai-chat-compatible.js`
- New `src/ai/providers/legacy-llama-completion.js`
- Later provider files as needed
- `main.html`
- `src/generation.js`
- `src/modules/ai-settings.js`
- `src/ai.js`
- `tests/gen-buildPrompt.js`
- New adapter tests

### Tasks

- [ ] Add AI request/event contract helpers.
- [ ] Add provider capability registry.
- [ ] Add OpenAI-compatible Chat Completions adapter.
- [ ] Add legacy llama.cpp `/completion` adapter.
- [ ] Add AI Orchestrator with `run(request, callbacks)`.
- [ ] Make `window.Generation.streamGeneration()` delegate to orchestrator where possible.
- [ ] Preserve existing `window.Generation.buildPrompt()` string return.
- [ ] Add `window.Generation.buildPromptMessages()` or equivalent.
- [ ] Move provider payload creation out of `src/generation.js` incrementally.
- [ ] Move stream parsing for at least one provider into adapter.
- [ ] Add safe logging helper or remove sensitive logs.
- [ ] Keep AI settings backward compatible.

### Acceptance

- [ ] Existing prose generation path still works.
- [ ] At least one cloud/openai-compatible provider can run through adapter contract in tests or mocked tests.
- [ ] Legacy local `/completion` behavior still works or is explicitly preserved as advanced/legacy.
- [ ] Prompt preview still works.
- [ ] `gen-buildPrompt` test still passes.
- [ ] No API keys/full prompts are logged by default.

---

## Phase 3 — Structured output support

### Goal

Enable AI tasks that return validated JSON objects.

### Touched files

- `src/ai/ai-orchestrator.js`
- Provider adapters
- New `src/ai/structured-output.js`
- `docs/schemas/*.json` if implementation changes
- Tests

### Tasks

- [ ] Add JSON parse helper with clear errors.
- [ ] Add lightweight schema validation helper or use a browser-compatible validator if added intentionally.
- [ ] For no-build mode, consider a minimal validator for required fields and types used by plot/template schemas.
- [ ] Add repair-request helper for invalid JSON/schema output.
- [ ] Teach adapters how to request structured output when supported.
- [ ] Add fallback strict-JSON prompt mode when native schema mode is unavailable.
- [ ] Add normalized `structured_result` or final `done.outputJson` event.

### Acceptance

- [ ] Valid structured output is parsed and returned.
- [ ] Invalid JSON is rejected with a clear error.
- [ ] Schema-invalid output is rejected or repaired.
- [ ] Raw invalid output is not silently saved.
- [ ] Tests cover success and failure.

---

## Phase 4 — Plot planning records and UI shell

### Goal

Add persistent plot plans and a review UI before AI generation.

### Touched files

- `src/db.js`
- New `src/modules/plot-planning.js`
- New `src/services/plot-planning-service.js` or global equivalent
- `src/modules/data-management.js`
- `src/state/app-state.js`
- `main.html`
- `src/i18n.js`
- Tests

### Tasks

- [ ] Add Dexie schema version for `plotPlans`.
- [ ] Add Dexie schema version for `aiRuns` or add both in one version.
- [ ] Update Data Management `TABLES`.
- [ ] Add plot planning state:
  - [ ] show/hide panel
  - [ ] selected template
  - [ ] premise
  - [ ] genre
  - [ ] target length
  - [ ] tone
  - [ ] generated cards
  - [ ] validation errors
- [ ] Add Plot Planning UI shell.
- [ ] Add manual save/load/list for plot plans without AI first.
- [ ] Add Save as Beats conversion.
- [ ] Add tests for save/load/convert.

### Acceptance

- [ ] User can open Plot Planning panel.
- [ ] User can create a draft plot plan without AI.
- [ ] User can save plot-plan cards as beats.
- [ ] Export/import includes `plotPlans` and `aiRuns` if present.
- [ ] Browser app still works.

---

## Phase 5 — AI plot generation from templates

### Goal

Generate a structured plot plan from a selected template.

### Touched files

- `src/modules/plot-planning.js`
- Plot planning service
- AI Orchestrator
- `src/i18n.js`
- Tests

### Tasks

- [ ] Build `AIRequest` for `plot.generate`.
- [ ] Include normalized template slots.
- [ ] Include premise, genre, target length, tone, and optional project context.
- [ ] Use `docs/schemas/plot-plan.schema.json`.
- [ ] Validate AI output.
- [ ] Store `aiRuns` metadata.
- [ ] Store generated result as `plotPlans.status = 'draft'`.
- [ ] Render generated cards for review.
- [ ] Add retry/repair UI for invalid structured output.

### Acceptance

- [ ] User can generate a plot plan from full BS2.
- [ ] Generated output is shown as editable cards.
- [ ] Nothing is saved as beats until user confirms.
- [ ] Invalid output is not saved silently.
- [ ] AI run metadata is stored without secrets.

---

## Phase 6 — AI template customization

### Goal

Let users customize structure templates with AI and save the result as a reusable template.

### Touched files

- `src/modules/beats.js`
- New customization service or plot/template service
- AI Orchestrator
- `main.html`
- `src/i18n.js`
- Tests

### Tasks

- [ ] Add customization UI/modal.
- [ ] Build `AIRequest` for `template.customize`.
- [ ] Use `docs/schemas/beat-template-v2.schema.json`.
- [ ] Validate AI output.
- [ ] Show change summary and slot list.
- [ ] Save as `source: 'aiCustomized'`, `builtIn: false`, `baseTemplateId` set.
- [ ] Preserve original template.
- [ ] Export/import customized templates.
- [ ] Store `aiRuns` metadata.

### Acceptance

- [ ] User can create a custom template from BS2 using AI.
- [ ] Saved template appears in selector.
- [ ] Original template is unchanged.
- [ ] Customized template can create beats.
- [ ] Customized template can be exported/imported.

---

## Phase 7 — Local preference/template tuning

### Goal

Implement practical “fine-tune” behavior without provider model training.

### Touched files

- New `src/services/preference-service.js` or global equivalent
- `src/db.js` if persistent tables are added
- `src/modules/plot-planning.js`
- `src/modules/beats.js`
- AI Orchestrator / Context Builder
- Data Management

### Tasks

- [ ] Decide initial storage: localStorage or Dexie `userPreferences`.
- [ ] Track explicit user preferences for plot generation.
- [ ] Track accepted/rejected plot plans and customized templates.
- [ ] Summarize preferences into future AI requests.
- [ ] Add export/import support if using Dexie.
- [ ] Add UI to view/reset preferences.
- [ ] Defer actual provider model fine-tuning.

### Acceptance

- [ ] User preferences influence later AI requests.
- [ ] User can reset tuning/preferences.
- [ ] No external training API is called.
- [ ] Data export/import includes tuning data if stored in Dexie.

---

## Phase 8 — Tauri desktop readiness

### Goal

Prepare the current browser app for packaging.

### Touched files

- `main.html`
- `src/vendor/*`
- New `src/platform/*`
- `src/modules/data-management.js`
- `package.json`
- Tests

### Tasks

- [ ] Vendor Dexie locally.
- [ ] Vendor JSZip locally.
- [ ] Update `main.html` to use local vendor scripts.
- [ ] Add browser `PlatformAdapter`.
- [ ] Route JSON download through platform adapter where practical.
- [ ] Ensure tests still work offline.

### Acceptance

- [ ] Browser app loads without external JS dependencies.
- [ ] JSON export/import still works.
- [ ] Tests pass.

---

## Phase 9 — Tauri thin wrapper

### Goal

Create an installable desktop wrapper without changing app storage.

### Touched files

- New `src-tauri/*`
- `package.json`
- `main.html` if needed
- `src/platform/*`
- Docs

### Tasks

- [ ] Add Tauri v2 project skeleton.
- [ ] Configure window and frontend path.
- [ ] Add minimal capabilities.
- [ ] Add `tauri:dev` and `tauri:build` scripts.
- [ ] Add Tauri detection to `PlatformAdapter`.
- [ ] Keep Dexie as initial storage.
- [ ] Document prerequisites and build steps.

### Acceptance

- [ ] Tauri app opens.
- [ ] Browser app still opens.
- [ ] No broad permissions are granted.
- [ ] Existing data flows work in Tauri WebView.

---

## Phase 10 — Tauri hardening

### Goal

Add native desktop features after the thin wrapper is stable.

### Tasks

- [ ] Add native file save/open for JSON export/import.
- [ ] Add secure API-key storage.
- [ ] Add optional Rust AI proxy.
- [ ] Add SQLite adapter only after JSON migration tests pass.
- [ ] Add optional local AI sidecar only after local OpenAI-compatible endpoint support is solid.
- [ ] Add updater/release process last.

### Acceptance

- [ ] Desktop features are optional and scoped.
- [ ] Browser version remains supported.
- [ ] Permissions are minimal.
- [ ] Data migration is reversible through JSON backup.

---

## Final modernization acceptance

- [ ] Full BS2 template exists and is usable.
- [ ] Templates are structured v2 objects.
- [ ] AI can generate structured plot plans from templates.
- [ ] AI can customize templates.
- [ ] Generated plot plans are reviewed before becoming beats.
- [ ] AI provider logic is adapter-based.
- [ ] JSON export/import covers new data.
- [ ] Browser app still works.
- [ ] Tauri thin wrapper works or is ready to build.
- [ ] Tests and manual verification notes are complete.
