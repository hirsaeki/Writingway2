# Testing and Acceptance Plan

## Purpose

This plan defines how a coding agent should verify the AI/template/Tauri modernization without relying on manual confidence alone.

## Baseline commands

Install and browser dependencies:

```bash
pnpm install
pnpm exec playwright install chromium
```

Run full existing tests:

```bash
pnpm run test
```

Run targeted tests:

```bash
node tests/smoke.js
node tests/gen-buildPrompt.js
node tests/data-management.js
node tests/beats.js
```

Run with a local server if needed:

```bash
python3 -m http.server 8787
APP_URL=http://localhost:8787/main.html pnpm run test
```

## Reporting rule

Every handoff must include:

- Commands run.
- Pass/fail result.
- Errors for failures.
- Commands not run and why.
- Any manual checks performed.

Do not write “tests pass” unless the relevant commands actually ran.

## Existing test coverage

| Test | Current purpose | Must keep passing |
| --- | --- | --- |
| `tests/smoke.js` | App loads, no console errors. | Yes. |
| `tests/gen-buildPrompt.js` | `Generation.buildPrompt()` behavior. | Yes. |
| `tests/data-management.js` | Export/import helpers. | Yes, update for new tables. |
| `tests/beats.js` | Beat CRUD/templates. | Yes, update for v2 slots. |
| `tests/ui-generation.js` | UI generation flow. | Yes. |
| `tests/ui-generation-retry.js` | Retry flow. | Yes. |
| `tests/ui-move-scene.js` | Scene movement. | Yes. |
| `tests/ui-sidebar.js` | Sidebar behavior. | Yes. |
| `tests/ui-projects.js` | Project UI behavior. | Yes if run. |
| `tests/unit-*` | Focused unit checks. | Yes if relevant. |

## New tests to add

### Beat Template v2

Recommended file: `tests/beat-template-v2.js`

Test cases:

- Normalizes `slots: string[]` to object slots.
- Leaves object slots stable.
- Full BS2 template has exactly 15 slots.
- Full BS2 slot IDs include:
  - `opening-image`
  - `theme-stated`
  - `setup`
  - `catalyst`
  - `debate`
  - `break-into-two`
  - `b-story`
  - `fun-and-games`
  - `midpoint`
  - `bad-guys-close-in`
  - `all-is-lost`
  - `dark-night-of-the-soul`
  - `break-into-three`
  - `finale`
  - `final-image`
- Applying a v2 template creates beats with stable `templateSlotId`.
- Applying a v1 template still creates beats.
- v1 template import normalizes to v2.
- v2 export/import round-trips.

### Dexie migration

Recommended file: `tests/migrations-template-v2.js`

Test cases:

- Seed a v11-like database state with string templates.
- Open upgraded DB.
- Confirm templates are v2 normalized.
- Confirm custom templates are not lost.
- Confirm built-ins are seeded once, not duplicated repeatedly.

### Plot plan schema

Recommended file: `tests/plot-plan-schema.js`

Test cases:

- Valid plot plan passes validation.
- Missing required `beats` fails.
- Beat missing `slotId` fails.
- Invalid `beats` type fails.
- Extra non-harmful fields are either allowed or stripped according to implementation rule.

### Plot planning service

Recommended file: `tests/plot-planning.js`

Test cases:

- Creates a draft plot plan.
- Saves plot plan to Dexie.
- Loads plot plans by project.
- Converts selected plot beats to structural beats.
- Does not convert unselected cards.
- Preserves `templateId` and `templateSlotId`.

### AI Orchestrator/adapters

Recommended file: `tests/ai-adapters.js`

Use mocked `fetch` and mocked stream readers.

Test cases:

- Adapter registry selects OpenAI-compatible adapter for `lmstudio`.
- Adapter registry selects legacy adapter for local `/completion` mode.
- Chat-completions stream parser emits `text_delta` events.
- Legacy llama stream parser emits `text_delta` events.
- Non-streaming response parser extracts text.
- Request builder does not include undefined temperature/max token fields when provider defaults are requested.
- API key is placed only in headers/settings and never in stored `aiRuns`.

### Structured output

Recommended file: `tests/structured-output.js`

Test cases:

- Parses valid JSON text.
- Rejects invalid JSON.
- Validates against plot plan schema.
- Validates against beat template schema.
- Produces useful validation error messages.
- Repair path is called once when validation fails.

### AI template customization

Recommended file: `tests/template-customization.js`

Test cases:

- Builds `template.customize` AIRequest with base template and instruction.
- Valid output saves as `source: 'aiCustomized'`.
- Base template is not modified.
- Customized template can create beats.
- Export/import retains `baseTemplateId` and customization summary.

### Data Management updates

Update `tests/data-management.js` or add `tests/data-management-new-tables.js`.

Test cases:

- `plotPlans` export in all-data export.
- `aiRuns` export in all-data export.
- Project export includes only project-related plot plans and AI runs.
- Import all restores new tables.
- Import project remaps project-related IDs where needed.

### Tauri readiness

Before actual Tauri:

- Browser app loads with vendored Dexie/JSZip.
- No external JS fetch is needed to start the app.

After actual Tauri:

- Add manual checklist first.
- Add automated Tauri tests only if tooling is configured.

## Manual verification checklist

### Browser smoke

- [ ] Open `main.html` through `start.sh` or local server.
- [ ] Create a project.
- [ ] Create a chapter and scene.
- [ ] Edit scene content and confirm autosave.
- [ ] Open Data Management.
- [ ] Export all data.
- [ ] Export current project.
- [ ] Open Story Beats.
- [ ] Create a manual beat.
- [ ] Apply a template.
- [ ] Link a beat to a scene.
- [ ] Reload and confirm data persists.

### Template v2 manual check

- [ ] Select full BS2 template.
- [ ] Confirm 15 slots are visible or applied.
- [ ] Export template.
- [ ] Import exported template.
- [ ] Apply imported template to a project.
- [ ] Confirm no duplicate built-ins are created after reload.

### Plot generation manual check

- [ ] Open Plot Planning panel.
- [ ] Select full BS2.
- [ ] Enter premise, genre, target length, tone.
- [ ] Generate with a test/mock AI provider if available.
- [ ] Confirm generated cards are editable.
- [ ] Save selected cards as beats.
- [ ] Confirm beats appear in Story Beats panel.
- [ ] Export/import data and confirm plot plan remains.

### AI provider manual check

At least one cloud provider and one local OpenAI-compatible provider should be checked when available.

- [ ] Cloud provider settings save/load.
- [ ] Local provider settings save/load.
- [ ] Model list fetch works where supported.
- [ ] Prose generation streams text.
- [ ] Non-streaming fallback works for models that require it.
- [ ] Structured output task returns valid JSON or clear error.

### Japanese/English UI check

- [ ] Switch to English.
- [ ] New labels are English.
- [ ] Switch to Japanese.
- [ ] New labels are Japanese.
- [ ] No untranslated keys appear.

### Tauri manual check after wrapper exists

- [ ] `pnpm tauri:dev` opens the app.
- [ ] Browser mode still opens.
- [ ] Create/edit project in Tauri.
- [ ] Export JSON in Tauri.
- [ ] Import JSON in Tauri.
- [ ] Close/reopen Tauri app and confirm data persists.
- [ ] Confirm app does not need external CDN scripts.
- [ ] Inspect capabilities for unnecessary permissions.

## Acceptance by phase

### Phase 1 acceptance

- Existing templates work.
- Full BS2 exists.
- V2 import/export works.
- Tests cover string and object slots.

### Phase 2 acceptance

- Existing generation still works.
- AI adapter registry exists.
- At least one adapter has mocked tests.
- No sensitive default logs.

### Phase 3 acceptance

- Structured validation works.
- Invalid structured output is not saved.
- Repair/failure behavior is clear.

### Phase 4 acceptance

- Plot plans can be saved and converted to beats manually.
- New data is exported/imported.

### Phase 5 acceptance

- AI can generate plot-plan cards from a template.
- User reviews before saving as beats.

### Phase 6 acceptance

- AI can create a customized template.
- Original template is preserved.
- Customized template can be reused.

### Phase 7 acceptance

- Local preference tuning affects later requests.
- User can view/reset preferences.
- No external fine-tuning API is called.

### Phase 8 acceptance

- App starts without CDN JS dependencies.
- Browser tests still pass.

### Phase 9 acceptance

- Tauri app opens.
- Browser app still opens.
- Permissions are minimal.

## Regression areas to watch

- Autosave.
- Scene ordering.
- Prompt preview.
- Generation retry.
- Compendium mentions.
- Beat references in context.
- Import/export destructive confirmations.
- Language selector.
- AI settings persistence.
- Browser file download/import.
