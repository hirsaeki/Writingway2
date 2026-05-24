# Current State Audit

**Date audited:** 2026-05-21  
**Scope:** Repository state from the attached `Writingway2.zip`.

## Summary

Writingway 2 is currently a static browser application with Alpine-style global state, Dexie/IndexedDB persistence, and global JavaScript modules loaded directly from `main.html`. The repository already contains much of the earlier product refactor: data management, structural beats, beat templates, context preview, and grouped AI settings.

The next modernization should not start from the old `docs/archives/HANDOFF.md` assumption that implementation has not begun. Instead, it should build on the existing code and stabilize the areas that are still too simple for the requested AI/template/Tauri goals.

## Application loading model

`main.html` loads scripts directly. The order matters.

Current script facts:

- Dexie is loaded from CDN.
- JSZip is loaded from CDN.
- `src/vendor/alpine.min.js` exists and is loaded locally.
- `src/db.js` runs before application modules.
- `src/app.js` loads near the end and wires the Alpine app.
- Modules expose globals such as `window.Generation`, `window.Beats`, `window.DataManagement`, `window.AISettings`, and `window.AI`.

Implication:

- New modules must be added to `main.html` in dependency order.
- Do not use imports/exports unless a build step is introduced intentionally.
- For Tauri packaging, CDN dependencies must be vendored before distribution.

## Storage state

`src/db.js` defines `WritingwayDB` with Dexie versions up to v11.

Known tables:

- `projects`
- `chapters`
- `scenes`
- `content`
- `prompts`
- `codex`
- `compendium`
- `promptHistory`
- `workshopSessions`
- `beats`
- `beatTemplates`

Important schema facts:

- v9 normalizes prompt categories.
- v10 adds real structural `beats`.
- v11 adds `beatTemplates` and seeds preset templates.
- `beatTemplates` is indexed as `id, name, builtIn, modified`.
- `beats` stores `templateId` and `templateSlotId` but no rich slot snapshot.
- Template slots are currently `string[]`.

## Data management state

`src/modules/data-management.js` implements a versioned JSON backup envelope:

```json
{
  "format": "writingway2.dexie-json",
  "version": 1,
  "exportedAt": "...",
  "scope": "all | project",
  "data": {}
}
```

It exports/imports the current Dexie tables, including `beats` and `beatTemplates`.

Gaps for modernization:

- Export/import format does not yet account for `plotPlans`, `aiRuns`, `templateCustomizations`, or tuning metadata.
- Beat-template import/export is handled separately in `src/modules/beats.js` as `writingway2.beat-template` version 1.
- Project import includes all beat templates, not only templates referenced by the project. This may be acceptable for now, but document the behavior.

## Beat and template state

`src/modules/beats.js` provides:

- `ensureTemplates(app)`
- `loadTemplates(app)`
- `loadBeats(app)`
- `createBeat(app)`
- `updateBeatStatus(app, beatId, status)`
- `linkBeatToScene(app, beatId, sceneId)`
- `moveBeat(app, beatId, direction)`
- `deleteBeat(app, beatId)`
- `createBeatsFromTemplate(app)`
- `createTemplate(app)`
- `exportTemplate(app)`
- `importTemplate(app, event)`
- `getBeatReferencesForScene(sceneId)`

Current presets:

- Three Act Structure: 7 string slots.
- Save the Cat / BS2: 7 simplified string slots.
- Hero's Journey: 7 string slots.
- Kishotenketsu: 4 string slots.

Gaps for modernization:

- Template slots need object shape with `id`, `title`, `order`, `description`, `purpose`, `promptHint`, and optional recommended story position.
- BS2 should be expanded to a full 15-beat preset.
- Existing `string[]` templates must remain importable and migratable.
- Template export/import needs a version 2 envelope.
- Beats created from templates should preserve `templateSlotId` as the stable slot ID, not the array index.
- Users need a UI path for reviewing generated plot cards before saving them as beats.

## Prompt and context state

The app already separates the old transient generation instruction as **Brief** / **生成指示** while preserving internal names such as `beatInput` for compatibility.

Context preview exists in `src/modules/context-panel.js` and `src/generation.js` includes:

- Current scene context.
- Prose template text.
- Compendium entries.
- Previous scene summaries.
- Story beat references.
- Raw prompt preview compatibility.

Gaps for modernization:

- Context building should become an application service that can return structured messages, not only raw prompt strings.
- AI plot generation and template customization require structured outputs, not freeform prose generation.
- Prompt preview should eventually show both user-readable summary and provider-specific normalized messages.

## AI provider state

Current AI logic is split across:

- `src/ai.js`: initialization/health helper.
- `src/modules/ai-settings.js`: provider settings, save/load, model fetching, connection tests.
- `src/generation.js`: prompt building, provider request construction, streaming parsing, non-streaming fallback, local `/completion`, retry helpers.
- `src/modules/generation.js`: older/extracted generation module. Check actual call paths before editing.

Current provider handling in `src/generation.js` includes branches for:

- `openrouter`
- `anthropic`
- `openai`
- `google`
- `nanogpt`
- `lmstudio`
- `custom`
- local llama.cpp `/completion`

Gaps for modernization:

- OpenAI Responses-style requests and structured outputs are not a first-class abstraction.
- Provider capability detection is not normalized.
- Streaming event formats are parsed inside one large function.
- API-mode prompts can still be sent as a single ChatML-ish user message in some paths.
- JSON/schema output for plot generation is not implemented.
- AI run metadata is not stored.
- API keys are stored in localStorage. This is acceptable for browser mode but not ideal for Tauri mode.
- Prompt and manuscript text can be logged in development paths; production logging rules need tightening.

## UI state

Relevant UI sections in `main.html`:

- Data Management panel around the mid-file panel area.
- Story Beats panel with manual beat creation, template selection, template export/import, custom string template creation, beat list, status updates, scene linking.
- AI Settings panel with provider selection, model selection, endpoint/key inputs, generation parameters.
- Scene options and prompt/context previews later in the file.

Gaps for modernization:

- Beat-template creation UI accepts newline-separated slot names only.
- No UI for structured slot metadata.
- No UI for AI template customization.
- No UI for template-based plot generation.
- No plot-plan review panel.
- No Tauri-specific UI or platform detection.

## Test state

`package.json` includes:

```json
{
  "scripts": {
    "dev": "python3 -m http.server 8787",
    "smoke": "node tests/smoke.js",
    "unit": "node tests/gen-buildPrompt.js",
    "ui": "node tests/ui-generation.js && node tests/ui-generation-retry.js && node tests/ui-move-scene.js && node tests/ui-sidebar.js",
    "test": "pnpm run smoke && pnpm run unit && pnpm run ui"
  }
}
```

Existing targeted tests include:

- `tests/beats.js`
- `tests/data-management.js`
- `tests/gen-buildPrompt.js`
- `tests/smoke.js`
- Multiple UI tests.

Gaps for modernization:

- `tests/beats.js` assumes `template.slots` is an array of strings. Update it for slot objects while preserving backward compatibility tests.
- Add tests for v1 template import and v2 template import/export.
- Add tests for plot plan schema validation and saving plot beats.
- Add adapter tests using mocked fetch streams.
- Add migration tests for new Dexie versions.
- Add Tauri checks only after Tauri is introduced; keep browser tests as the baseline.

## Documentation state

Existing docs include:

- `README.md`
- `docs/archives/HANDOFF.md`
- `PRODUCT_REFACTORING_PLAN.md`
- `PRODUCT_REFACTORING_TASKS.md`
- `REFACTORING.md`
- Backup/import troubleshooting docs.

Important note:

- `PRODUCT_REFACTORING_TASKS.md` shows phases 0-9 checked off, including Real Beat Model, Beat Templates, Context Preview, and AI Provider Settings Grouping.
- `docs/archives/HANDOFF.md` still says implementation had not started. Treat it as stale for the current modernization.

## Recommended first code change

Start with Beat Template v2. It is the lowest-risk foundation for later plot generation and template customization.

Do not start with Tauri. Tauri should wrap a stabilized app, not force early storage and packaging decisions.
