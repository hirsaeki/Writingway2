# Writingway 2 Product Refactoring Plan

**Date:** 2026-05-07  
**Status:** Planning  
**Scope:** Product concepts, data model, backup strategy, and near-term refactoring priorities

This document captures the product-level refactoring direction discussed after the initial modularization work. The current `REFACTORING.md` focuses on splitting large source files. This plan focuses on the writing model itself: Beat, Brief, Scene, Prompt, Context, and backup/data management.

---

## 1. Core Problem

The current "Beat" feature is not really a story beat.

In the current UI, Beat means "synopsis-like instruction sent to the AI to generate prose." That feature is useful, but the name is misleading. A real story beat is a structural unit in the story: an event, turn, emotional shift, plot point, or planned narrative step. It should be saveable, orderable, reusable, and able to exist at project, chapter, or scene scope.

Current behavior:

- User writes a short instruction in the Beat panel.
- The app expands it into prose using the current scene and selected context.
- The input is transient and tied closely to the current scene generation flow.

Better conceptual split:

| Concept | Role |
| --- | --- |
| Beat | Structural story unit. Part of planning and plot architecture. |
| Scene | Prose/content unit. Contains manuscript text. |
| Brief | AI generation instruction for the next prose output. |
| Prompt Template | How the AI should perform a task. |
| Structure Template | Plot framework such as BS2, Three Act, Hero's Journey. |
| Context | Reference material sent to the AI. |
| Summary | Condensed reference generated from scene/chapter content. |

---

## 2. Naming Direction

Rename the current Beat UI concept to **Brief**.

Japanese UI candidates:

- `生成指示`
- `シーン指示`
- `本文生成メモ`

Recommended Japanese label: **生成指示**  
Recommended English label: **Brief** or **Generation Brief**

Suggested UI copy changes:

| Current | Recommended |
| --- | --- |
| Generate from Beat | Generate from Brief |
| Beat: | Brief: |
| BEAT TO EXPAND | BRIEF TO EXPAND |
| No beat provided | No brief provided |
| Reuse Beat | Reuse Brief |

Internal variable renames should be deferred until the UI wording is stabilized. For low-risk first pass, keep `beatInput`, `lastBeat`, and `generateFromBeat()` internally, but change user-facing text only. Later, migrate internals to `briefInput`, `lastBrief`, and `generateFromBrief()`.

---

## 3. Data Model Direction

Keep Dexie/IndexedDB for now. Do not move to SQLite until a Tauri/Electron desktop packaging phase.

Rationale:

- Current app is a browser/static app.
- Dexie works well with the existing delivery model.
- SQLite would be most valuable once the app owns a local filesystem/database path.
- Product concepts should be stabilized before changing the storage engine.

Design Dexie tables so they can migrate cleanly to SQLite later.

### Near-Term Tables

Existing important tables:

- `projects`
- `chapters`
- `scenes`
- `content`
- `prompts`
- `promptHistory`
- `compendium`
- `workshopSessions`

Proposed additions:

```text
beats
beatTemplates
generationBriefs
dataExports
```

### Proposed `beats`

Story structure units. They are not prose-generation instructions.

Fields:

```text
id
projectId
chapterId nullable
sceneId nullable
scope: project | chapter | scene
title
body
order
status: planned | drafting | done | skipped
templateId nullable
templateSlotId nullable
tags[]
created
modified
```

Notes:

- A scene may reference zero, one, or many beats.
- A beat may be associated with a scene, but should not be required to be 1:1 with a scene.
- Project-level structure beats should exist without scenes.

### Proposed `beatTemplates`

Structure templates and presets.

Fields:

```text
id
projectId nullable
name
description
source: preset | custom | imported
slots[]
created
modified
```

Example presets:

- Three Act Structure
- Save the Cat / BS2
- Hero's Journey
- Kishotenketsu
- Mystery outline
- Romance outline

Slot object shape:

```text
id
title
description
order
recommendedScope
promptHint nullable
```

### Proposed `generationBriefs`

Optional history/persistence for what is currently transient `beatInput`.

Fields:

```text
id
projectId
sceneId nullable
sourceBeatIds[]
body
contextSnapshot nullable
promptId nullable
created
usedAt nullable
```

This table is optional for the first implementation. If generation history is enough, `promptHistory` may hold this data initially.

---

## 4. Prompt Taxonomy

Current prompt handling risks becoming too broad. Separate prompt concepts early.

Recommended categories:

| Category | Purpose |
| --- | --- |
| structure | Plot/beat templates and framework guidance |
| prose | Brief-to-prose generation |
| style | Always-included voice/style guide |
| rewrite | Rewrite selected text |
| summary | Scene/chapter summaries |
| workshop | Chat/workshop behavior |
| custom | User-defined tasks |

Implementation option:

- Keep one `prompts` table.
- Add or normalize `category`.
- Later add `promptType` if category is overloaded.

Avoid mixing Structure Templates and Prompt Templates too deeply. A structure template can include prompt hints, but the template itself is not just a prompt.

---

## 5. Context Visibility

Add a clearer "what will be sent to AI" preview.

Current prompt preview is useful but too raw for normal users. Add a summary view before or alongside the raw prompt.

Suggested preview sections:

- Brief body
- Current scene content included: yes/no and character count
- Selected prose prompt
- System/style prompt
- Compendium entries included
- Scene/chapter summaries included
- Beat references included
- Estimated prompt size
- Raw prompt toggle

Goal:

The user should understand why the AI generated a result, and what references influenced it.

---

## 6. Backup and Data Management

GitHub Gist backup should not be the primary backup model. It is useful, but too technical for the default path.

Primary backup path should be local export/import.

### Recommended Data Management UI

Create a **Data Management** panel instead of making Gist backup the main visible warning.

Actions:

- Export all data as JSON
- Import all data from JSON
- Export current project as JSON
- Import project from JSON
- Export readable manuscript formats
- GitHub Gist backup settings
- Clear local data

### Export Format

Use a versioned JSON envelope.

```json
{
  "format": "writingway2-data",
  "version": 1,
  "exportedAt": "ISO timestamp",
  "appVersion": "optional",
  "scope": "all | project",
  "data": {
    "projects": [],
    "chapters": [],
    "scenes": [],
    "content": [],
    "prompts": [],
    "promptHistory": [],
    "compendium": [],
    "workshopSessions": [],
    "beats": [],
    "beatTemplates": [],
    "generationBriefs": []
  }
}
```

Import modes:

- Replace all local data
- Merge/import as new project
- Restore current project only

### Backup Warning Change

Current red banner says auto-backup is not enabled and warns about data loss. That is technically true, but too strong if Gist is optional.

Replace it with a softer, dismissible notice:

> Local data is stored in this browser. Use Data Management to export a backup.

The red banner should not be permanent for users who intentionally use local-only storage.

---

## 7. AI Provider Settings

The AI settings UI currently exposes many provider choices directly. That is powerful but noisy.

Recommended grouping:

- Easy cloud setup
- Local API setup
- Advanced/custom providers

Also reconsider the dedicated local llama.cpp mode. Prefer treating local inference as OpenAI-compatible/local HTTP APIs where possible:

- LM Studio
- Ollama
- llama.cpp server
- text-generation-webui
- vLLM
- Custom OpenAI-compatible endpoint

Dedicated llama.cpp `/completion` support can remain as advanced/legacy if needed.

---

## 8. Implementation Phases

### Phase 1: Low-Risk Wording and UX Cleanup

Goal: fix misleading concepts without schema changes.

- Rename user-facing Beat text to Brief / 生成指示.
- Rename prompt preview labels from Beat to Brief.
- Keep internal names temporarily.
- Make backup warning softer and dismissible.
- Add Data Management entry point in the main menu.

### Phase 2: JSON Export/Import

Goal: make local data backup reliable before deeper model changes.

- Add full Dexie export as versioned JSON.
- Add full Dexie import with replace mode.
- Add current-project export.
- Add project import as new project.
- Keep Gist backup as optional cloud backup.

### Phase 3: Prompt Taxonomy

Goal: prevent prompt management from becoming a mixed bucket.

- Normalize prompt categories.
- Update UI grouping.
- Preserve migration from existing categories.
- Add import/export compatibility for prompt categories.

### Phase 4: Real Beat Model

Goal: introduce real structural beats.

- Add `beats` Dexie table.
- Add basic Beat panel for project/chapter/scene scope.
- Allow linking beats to scenes.
- Allow ordering and status.
- Do not require 1:1 beat-scene mapping.

### Phase 5: Beat Templates / Structure Presets

Goal: add reusable plot frameworks.

- Add `beatTemplates` table.
- Add presets: Three Act, BS2, Hero's Journey.
- Allow creating beats from a template.
- Add custom template import/export.

### Phase 6: Context Preview

Goal: make AI behavior inspectable.

- Add context summary preview.
- Add raw prompt toggle.
- Show included references and prompt size.
- Include linked beats in context where appropriate.

### Phase 7: Desktop Storage Decision

Goal: decide whether to move from Dexie to SQLite.

Only revisit this once a Tauri/Electron build is planned.

If desktop packaging happens:

- Use SQLite as the primary local database.
- Provide IndexedDB-to-SQLite migration/import.
- Keep JSON export/import as the portable backup format.

---

## 9. Migration Notes

Avoid large internal renames until the UI concepts settle.

Potential future migrations:

- `beatInput` -> `briefInput`
- `lastBeat` -> `lastBrief`
- `generateFromBeat()` -> `generateFromBrief()`
- `promptHistory.beat` -> `promptHistory.brief`

When adding real beats, avoid reusing the old transient `beatInput` field as structural beat data. That would preserve the current conceptual confusion.

---

## 10. Near-Term Priority List

Recommended order:

1. UI wording: Beat -> Brief / 生成指示.
2. Backup banner: soften, dismiss, and point to Data Management.
3. Data Management shell.
4. Full JSON export/import.
5. Prompt category cleanup.
6. Real `beats` model.
7. Beat templates and presets.
8. Context preview.
9. AI provider settings grouping.

