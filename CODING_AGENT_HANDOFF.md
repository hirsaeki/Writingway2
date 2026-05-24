# Coding Agent Handoff — AI / Beat Templates / Plot Planning / Tauri Modernization

**Date:** 2026-05-21  
**Project:** Writingway 2  
**Audience:** Coding agents implementing the next refactoring sequence  
**Status:** Documentation and implementation plan prepared; coding not started in this handoff.

## Goal

Upgrade Writingway 2 from a browser-first AI writing tool into a modern AI-assisted writing workbench that supports:

- Complete, modern AI support through an AI Orchestrator and provider adapters.
- Tauri desktop packaging without breaking the existing browser version.
- Real beat-template support, including full Save the Cat / BS2-style templates.
- AI customization of structure templates.
- Template-based AI plot generation.
- User/profile/template-level fine-tuning behavior before any expensive model-level fine-tuning.

## Current source status

The current source already includes a substantial product refactor:

- Data Management panel exists in `main.html`.
- JSON all-data and project export/import exist in `src/modules/data-management.js`.
- Structural story beats exist in `src/modules/beats.js`.
- Beat templates exist in `src/db.js` Dexie v11 and in `src/modules/beats.js`.
- Preset templates currently use `slots: string[]`.
- Save the Cat / BS2 currently has only 7 simplified slots, not a full 15-beat structure.
- AI settings are grouped in the UI, but provider logic still lives mainly in `src/generation.js` and `src/modules/ai-settings.js`.
- `src/generation.js` still mixes prompt building, provider request construction, streaming parsing, provider quirks, local `/completion`, retry helpers, and workshop delegation.
- Tauri has not been added.
- `main.html` still loads Dexie and JSZip from CDNs. That is acceptable for the browser app but not for packaged desktop distribution.

Older `docs/archives/HANDOFF.md` says implementation had not started. That is stale for product-refactor phases. Use this file and `docs/agent/*` for the current modernization plan.

## Architecture direction

Introduce three internal layers while preserving the current app shell:

```text
UI
  main.html + Alpine state/method wrappers

Application Services
  AI Orchestrator
  Context Builder
  Beat Template Service
  Plot Planning Service
  Template Customization Service
  Data Management Service

Adapters
  AI provider adapters
  Storage adapters
  Platform adapters
```

The short-term rule is **stabilize contracts before changing storage or packaging**.

## Recommended implementation order

### Phase 1 — Beat template v2 and full BS2

Convert beat templates from `string[]` slots to structured slot objects while accepting old `string[]` templates. Add full BS2 15-beat preset. Keep `createBeatsFromTemplate()` working.

Primary docs:

- `docs/agent/04-beat-template-and-plot-spec.md`
- `docs/schemas/beat-template-v2.schema.json`

Primary files:

- `src/db.js`
- `src/modules/beats.js`
- `src/modules/data-management.js`
- `main.html`
- `src/i18n.js`
- `tests/beats.js`

### Phase 2 — AI Gateway / provider adapters

Create a stable internal AI request/response contract. Keep current generation methods as compatibility wrappers.

Primary docs:

- `docs/agent/03-ai-gateway-spec.md`
- `docs/schemas/ai-request.schema.json`

Primary files:

- New `src/ai/` directory
- `src/generation.js`
- `src/modules/ai-settings.js`
- `src/ai.js`
- `src/modules/context-panel.js`

### Phase 3 — Structured plot generation from templates

Add `plotPlans` and `aiRuns`, then generate structured plot plans from a selected template. Save results as editable beat cards.

Primary docs:

- `docs/agent/04-beat-template-and-plot-spec.md`
- `docs/schemas/plot-plan.schema.json`
- `docs/schemas/ai-run.schema.json`

Primary files:

- `src/db.js`
- New `src/modules/plot-planning.js`
- `src/modules/beats.js`
- `src/modules/data-management.js`
- `main.html`
- `src/i18n.js`

### Phase 4 — AI template customization and local preference tuning

Add AI-driven template customization. Save generated templates as custom templates with `baseTemplateId` and `source: "aiCustomized"`. Track user edits and preferences as local tuning metadata. Do not start model-level fine-tuning in this phase.

Primary docs:

- `docs/agent/04-beat-template-and-plot-spec.md`
- `docs/agent/06-implementation-tasks.md`

### Phase 5 — Tauri thin wrapper

Add Tauri without changing the app's storage model. Vendor CDN dependencies first. Keep browser and Tauri paths both functional.

Primary docs:

- `docs/agent/05-tauri-desktop-plan.md`

Primary files:

- `src-tauri/*`
- `package.json`
- `main.html`
- New `src/platform/*` as needed

### Phase 6 — Tauri hardening

Add secure API-key storage, file-system integration, optional SQLite adapter, optional local sidecar support, and updater only after the thin wrapper is stable.

## Key hazards

- Dexie schema migrations can cause data loss if table declarations omit existing tables.
- Updating built-in templates must not overwrite user-customized templates without clear rules.
- Structured AI output will fail occasionally. Implement validation, repair/retry, and clear error messaging.
- Provider APIs differ significantly. Keep quirks inside adapters.
- Tauri permissions must be narrow. Avoid broad filesystem/shell access.
- Sidecar local AI packaging is risky and should not be the first desktop milestone.

See `docs/agent/08-risk-register.md` for details.

## Minimum acceptance bar for the full modernization sequence

By the end of the planned sequence, a user should be able to:

1. Choose a real structure template such as full BS2.
2. Customize that template with AI for a genre/length/tone.
3. Generate a structured plot plan from the template.
4. Review the plot as cards before saving.
5. Save generated cards as structural beats.
6. Link beats to scenes and use beat references in generation context.
7. Use cloud AI or local OpenAI-compatible AI through one provider abstraction.
8. Export/import all new data through JSON.
9. Run the app in the browser and, later, as a Tauri desktop app.

## Immediate next task for a coding agent

Start with `docs/agent/06-implementation-tasks.md` Phase 1. Do not start Tauri first. The beat-template data contract must be stabilized before plot generation and before desktop storage decisions.
