# Writingway 2 Handoff

**Date:** 2026-05-07  
**Status:** Product refactoring planning completed. Implementation not started.

## Read First

1. `PRODUCT_REFACTORING_PLAN.md`
2. `PRODUCT_REFACTORING_TASKS.md`
3. `REFACTORING.md` only as secondary context for older code-modularization plans

The product refactoring plan is the current priority. Do not complete the old broad `REFACTORING.md` plan before product work unless a specific product phase needs a small local cleanup.

## Current Priority

Follow `PRODUCT_REFACTORING_TASKS.md`.

Start with:

1. Phase 0: Preflight
2. Phase 1: Brief Naming and Backup UX Cleanup
3. Phase 2: Data Management Shell

## Product Decisions

- The current "Beat" feature is actually an AI generation instruction.
- User-facing "Beat" should become **Brief** in English and **生成指示** in Japanese.
- Real Beats should later become structural story units with their own data model.
- Scene and Beat should not be forced into a 1:1 relationship.
- Dexie/IndexedDB remains the storage layer for now.
- SQLite should be revisited only if/when a Tauri or Electron desktop app becomes an active goal.
- JSON export/import should become the primary local backup mechanism.
- GitHub Gist backup should become optional cloud backup, not the default warning path.
- The permanent red "auto backup not enabled" banner should be softened or made dismissible.
- Product refactoring should move first; broad `app.js` decomposition should happen only where needed.

## Recent Changes Already Made

- `start.bat` and `start.sh` no longer auto-start local llama.cpp.
- Both startup scripts now serve the app on `localhost:8787`.
- README quick start was updated away from llama.cpp being required.
- Language selector issues were fixed:
  - Options are fixed as `日本語` and `English`.
  - Selects use `:value="language"` and `@change="setLanguage($event.target.value)"`.
  - `app.t()` passes Alpine's current language into `window.t()`.
- `PRODUCT_REFACTORING_PLAN.md` was added.
- `PRODUCT_REFACTORING_TASKS.md` was added.

## Important Files

- `main.html`
  - Primary UI.
  - Contains current Brief/Beat panel and backup warning banner.
- `src/i18n.js`
  - All user-facing text.
  - Current Beat wording still exists here.
- `src/generation.js`
  - Main generation prompt building and streaming.
  - Contains `BEAT TO EXPAND` and generation logic.
- `src/modules/generation.js`
  - Older/extracted generation module; check whether any path still uses it before editing.
- `src/state/app-state.js`
  - Alpine state definitions.
- `src/app.js`
  - Main Alpine methods and wrappers.
- `src/db.js`
  - Dexie schema and migrations.
- `src/modules/github-backup.js`
  - Existing GitHub Gist backup implementation.
- `src/prompts.js`
  - Prompt management.

## Cautions

- The worktree may be dirty. Do not revert user changes.
- Keep UI wording changes separate from internal variable renames at first.
- Avoid renaming `beatInput`, `lastBeat`, or `generateFromBeat()` until the UI behavior is stable.
- When adding Dexie schema versions, preserve existing user data.
- Any import feature must avoid destructive overwrite without explicit confirmation.
- Do not make GitHub Token/Gist setup mandatory for normal local use.

## Suggested Next Commit Scope

First implementation commit should probably cover only:

- Beat -> Brief / 生成指示 user-facing text
- Backup warning softened/dismissible
- Data Management menu entry placeholder

Do not include real Beat schema, JSON import/export, or prompt taxonomy in the first commit unless the scope is explicitly expanded.

