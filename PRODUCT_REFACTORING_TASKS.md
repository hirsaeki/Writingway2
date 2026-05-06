# Writingway 2 Product Refactoring Tasks

**Date:** 2026-05-07  
**Source plan:** `PRODUCT_REFACTORING_PLAN.md`  
**Priority:** Product refactoring first, with only the small enabling code refactors needed for each phase.

This is the execution checklist. It intentionally avoids doing the full legacy `REFACTORING.md` first. Instead, each product phase includes only the local cleanup needed to make that phase safe.

---

## Guiding Rule

Do not perform broad `app.js` decomposition as a prerequisite.

For each product phase:

1. Identify the touched area.
2. Extract or clean only what that phase needs.
3. Ship the product-facing change.
4. Add focused tests or manual verification.

---

## Phase 0: Preflight

- [ ] Review current dirty worktree before starting.
- [ ] Confirm existing language selector fixes remain intact.
- [ ] Confirm startup scripts no longer auto-start llama.cpp.
- [ ] Confirm `PRODUCT_REFACTORING_PLAN.md` is the product design source of truth.

Done when:

- [ ] Baseline app starts from `start.sh` / `start.bat`.
- [ ] No unrelated user edits are overwritten.

---

## Phase 1: Brief Naming and Backup UX Cleanup

Goal: fix misleading language and reduce the backup warning pressure without schema changes.

Touched areas:

- `main.html`
- `src/i18n.js`
- `src/generation.js`
- `src/modules/generation.js` if still used by any path
- `src/app.js` only where wrapper labels/history require it

Tasks:

- [ ] Change user-facing `Beat` wording to `Brief` in English UI.
- [ ] Change user-facing `ビート` wording to `生成指示` in Japanese UI.
- [ ] Change prompt preview labels from `BEAT` / `ビート` to `BRIEF` / `生成指示`.
- [ ] Keep internal names (`beatInput`, `lastBeat`, `generateFromBeat`) for this phase.
- [ ] Add comments or TODO markers where internal names intentionally remain old.
- [ ] Soften the permanent red backup warning.
- [ ] Make the backup warning dismissible or move it to a non-blocking notice.
- [ ] Add a main-menu entry point for future `Data Management`.

Done when:

- [ ] UI no longer presents the transient AI instruction as a story Beat.
- [ ] Existing generation still works.
- [ ] Existing prompt history/retry behavior still works.
- [ ] Users can work locally without a permanent red Gist warning.

Verification:

- [ ] Open landing and project views in Japanese and English.
- [ ] Generate from the renamed Brief panel.
- [ ] Preview prompt and confirm wording.
- [ ] Confirm backup settings still open and save.

---

## Phase 2: Data Management Shell

Goal: create a clear home for local backup/import/export before implementing all data movement.

Touched areas:

- `main.html`
- `src/state/app-state.js`
- `src/app.js`
- New module, recommended: `src/modules/data-management.js`
- `src/i18n.js`

Tasks:

- [ ] Add `showDataManagement` state.
- [ ] Add Data Management menu item.
- [ ] Create Data Management panel/modal shell.
- [ ] Add buttons for:
  - [ ] Export all data
  - [ ] Import all data
  - [ ] Export current project
  - [ ] Import project
  - [ ] GitHub Gist backup settings
- [ ] Route Gist backup settings from this panel.
- [ ] Keep destructive actions such as clear local data out of this phase unless separately confirmed.

Done when:

- [ ] Data Management panel opens from the UI.
- [ ] Gist backup is accessible from Data Management.
- [ ] Buttons can be disabled/placeholders if export/import is not implemented yet.

Verification:

- [ ] Open/close panel in Japanese and English.
- [ ] Navigate from Data Management to Cloud/Gist backup settings.

---

## Phase 3: Full Dexie JSON Export

Goal: provide a reliable local backup path.

Touched areas:

- `src/modules/data-management.js`
- `src/db.js`
- `src/i18n.js`
- Tests as needed

Tasks:

- [ ] Define export envelope:
  - [ ] `format`
  - [ ] `version`
  - [ ] `exportedAt`
  - [ ] `scope`
  - [ ] `data`
- [ ] Export all current Dexie tables.
- [ ] Include known existing tables:
  - [ ] `projects`
  - [ ] `chapters`
  - [ ] `scenes`
  - [ ] `content`
  - [ ] `prompts`
  - [ ] `promptHistory`
  - [ ] `codex` if still used
  - [ ] `compendium`
  - [ ] `workshopSessions`
- [ ] Include future-table compatibility for missing optional tables.
- [ ] Download as `.json`.
- [ ] Add current-project export.
- [ ] Ensure exported project data includes related chapters, scenes, content, compendium, prompts, and workshop sessions where applicable.

Done when:

- [ ] User can export all local data.
- [ ] User can export the current project.
- [ ] Export JSON is versioned and readable.

Verification:

- [ ] Export with no projects.
- [ ] Export with one populated project.
- [ ] Export with multiple projects.
- [ ] Validate JSON parses.

---

## Phase 4: Dexie JSON Import

Goal: restore data from the local backup format.

Touched areas:

- `src/modules/data-management.js`
- `src/db.js`
- `src/i18n.js`
- Tests as needed

Tasks:

- [ ] Validate import envelope.
- [ ] Implement full replace import.
- [ ] Implement current-project import as new project.
- [ ] Prevent accidental overwrite with confirmation dialogs.
- [ ] Preserve IDs for full restore.
- [ ] Generate new project-related IDs for import-as-new-project where needed.
- [ ] Refresh app state after import.
- [ ] Handle unsupported version with a clear error.

Done when:

- [ ] User can restore an all-data backup.
- [ ] User can import a project backup without destroying other projects.
- [ ] Invalid files fail safely.

Verification:

- [ ] Export all, clear test data manually or in a test DB, import all.
- [ ] Export project, import as new project.
- [ ] Try invalid JSON.
- [ ] Try valid JSON with wrong `format`.

---

## Phase 5: Prompt Taxonomy Cleanup

Goal: prevent prompts from becoming an unclear mixed bucket.

Touched areas:

- `src/prompts.js`
- `src/modules/context-panel.js`
- `src/modules/generation.js`
- `src/generation.js`
- `main.html`
- `src/i18n.js`
- `src/db.js` if schema migration is needed

Tasks:

- [ ] Audit existing prompt categories.
- [ ] Define supported categories:
  - [ ] `structure`
  - [ ] `prose`
  - [ ] `style`
  - [ ] `rewrite`
  - [ ] `summary`
  - [ ] `workshop`
  - [ ] `custom`
- [ ] Add migration/defaulting for existing prompts.
- [ ] Update prompt manager grouping.
- [ ] Preserve existing prose/rewrite/summary/workshop behavior.
- [ ] Decide whether `alwaysInclude` belongs only to `style` or remains available broadly.

Done when:

- [ ] Prompt UI clearly separates task types.
- [ ] Existing projects keep their prompts.
- [ ] Generation, rewrite, summary, and workshop still find the right prompts.

Verification:

- [ ] Create prompts in each category.
- [ ] Export/import prompts.
- [ ] Generate prose with a prose prompt.
- [ ] Rewrite with a rewrite prompt.
- [ ] Use workshop prompt.

---

## Phase 6: Real Beat Model

Goal: introduce structural Beats without confusing them with Briefs.

Touched areas:

- `src/db.js`
- `src/state/app-state.js`
- New module, recommended: `src/modules/beats.js`
- `main.html`
- `src/i18n.js`

Tasks:

- [ ] Add Dexie schema version for `beats`.
- [ ] Implement `beats` CRUD module.
- [ ] Add beat fields:
  - [ ] `id`
  - [ ] `projectId`
  - [ ] `chapterId`
  - [ ] `sceneId`
  - [ ] `scope`
  - [ ] `title`
  - [ ] `body`
  - [ ] `order`
  - [ ] `status`
  - [ ] `templateId`
  - [ ] `templateSlotId`
  - [ ] `tags`
  - [ ] `created`
  - [ ] `modified`
- [ ] Add a basic Beat planning panel.
- [ ] Support project/chapter/scene scope.
- [ ] Allow linking beats to scenes without requiring 1:1 mapping.
- [ ] Allow ordering and status changes.

Done when:

- [ ] Users can create and manage real story Beats.
- [ ] Brief generation remains separate.
- [ ] A scene can reference multiple beats or none.

Verification:

- [ ] Create project-level beat.
- [ ] Create chapter-level beat.
- [ ] Link beat to scene.
- [ ] Reorder beats.
- [ ] Reload app and confirm persistence.

---

## Phase 7: Beat Templates and Structure Presets

Goal: support known structure frameworks and custom/imported templates.

Touched areas:

- `src/db.js`
- New or existing beat module
- `main.html`
- `src/i18n.js`
- Data export/import module

Tasks:

- [ ] Add Dexie schema version for `beatTemplates`.
- [ ] Define preset templates:
  - [ ] Three Act Structure
  - [ ] Save the Cat / BS2
  - [ ] Hero's Journey
  - [ ] Optional: Kishotenketsu
- [ ] Add create beats from template action.
- [ ] Add custom template creation.
- [ ] Add template export/import.
- [ ] Include templates in all-data export/import.

Done when:

- [ ] Users can instantiate a structure preset into project beats.
- [ ] Users can customize and reuse templates.
- [ ] Templates survive export/import.

Verification:

- [ ] Create beats from each preset.
- [ ] Edit a custom template.
- [ ] Export/import template.

---

## Phase 8: Context Preview

Goal: make AI inputs inspectable without forcing users to read raw prompts.

Touched areas:

- `src/modules/context-panel.js`
- `src/generation.js`
- `src/modules/generation.js`
- `main.html`
- `src/i18n.js`

Tasks:

- [ ] Add context summary preview.
- [ ] Show included:
  - [ ] Brief
  - [ ] Current scene content
  - [ ] Prose prompt
  - [ ] System/style prompt
  - [ ] Compendium entries
  - [ ] Scene/chapter summaries
  - [ ] Beat references
- [ ] Add raw prompt toggle.
- [ ] Show approximate character/token count.
- [ ] Preserve existing full prompt preview for debugging.

Done when:

- [ ] User can see what references will be sent before generation.
- [ ] Raw prompt remains accessible.

Verification:

- [ ] Preview with no context.
- [ ] Preview with compendium entries.
- [ ] Preview with scene summaries.
- [ ] Preview with linked beats once Phase 6 exists.

---

## Phase 9: AI Provider Settings Grouping

Goal: reduce setup friction while keeping advanced options.

Touched areas:

- `main.html`
- `src/modules/ai-settings.js`
- `src/ai.js`
- `src/generation.js`
- `src/i18n.js`

Tasks:

- [ ] Group providers into:
  - [ ] Easy cloud setup
  - [ ] Local API setup
  - [ ] Advanced/custom
- [ ] Reframe local inference around OpenAI-compatible/local HTTP APIs.
- [ ] Keep dedicated llama.cpp `/completion` support as advanced/legacy if needed.
- [ ] Update help text.
- [ ] Keep saved settings compatible.

Done when:

- [ ] New users have fewer choices up front.
- [ ] Existing provider settings still load.
- [ ] Local API providers remain available.

Verification:

- [ ] Load existing saved settings.
- [ ] Save each provider category.
- [ ] Generate with at least one cloud and one local API setup where available.

---

## Deferred: Desktop SQLite Storage

Do not start this until Tauri/Electron packaging is an active goal.

Future tasks:

- [ ] Choose Tauri or Electron.
- [ ] Define SQLite schema from stabilized Dexie tables.
- [ ] Implement IndexedDB JSON export as migration source.
- [ ] Implement SQLite import/migration.
- [ ] Keep JSON export/import as portable backup.

