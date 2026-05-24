# Risk Register

## Purpose

This register lists the main risks for the AI/template/Tauri modernization and how a coding agent should mitigate them.

## Risk levels

- **High:** Can cause data loss, security issue, or broken core app.
- **Medium:** Can block a feature or cause confusing UX.
- **Low:** Can be fixed locally with limited impact.

## Risks

### R1 — Dexie migration data loss

**Level:** High  
**Area:** Storage

Symptoms:

- Existing projects disappear after schema upgrade.
- Tables are missing after adding a new Dexie version.
- Custom templates are overwritten by built-in seed data.

Causes:

- New `db.version().stores()` omits existing tables.
- Migration clears or replaces tables.
- Built-in template seeding updates too broadly.

Mitigations:

- Always include all existing tables in every new Dexie version declaration.
- Use `bulkPut`/`modify` only on targeted records.
- Never clear user tables in migrations.
- Add migration tests before marking phase complete.
- Preserve old template IDs or create new v2 built-in IDs.

Stop condition:

- If a migration could overwrite user data, stop and redesign before coding further.

---

### R2 — Built-in templates duplicate or overwrite user templates

**Level:** Medium  
**Area:** Beat templates

Symptoms:

- Reloading creates multiple copies of the same preset.
- User-edited custom template reverts.
- Imported template becomes marked built-in.

Mitigations:

- Use stable built-in IDs.
- Seed only if missing.
- Imported templates always get new IDs unless overwrite is explicit.
- Built-ins use `source: 'builtIn'`; user templates use `custom`, `imported`, or `aiCustomized`.
- Tests should reload/seed twice and check no duplicates.

---

### R3 — Existing string-slot templates break

**Level:** Medium  
**Area:** Beat templates

Symptoms:

- Applying older templates creates empty beat titles.
- v1 template import fails.
- Tests expecting string slots fail without replacement coverage.

Mitigations:

- Normalize at service boundary.
- Keep v1 import support.
- Update tests to cover both string and object slots.

---

### R4 — `src/generation.js` becomes more complex instead of less

**Level:** High  
**Area:** AI architecture

Symptoms:

- New provider branches added directly to `streamGenerationAPI()`.
- Structured output parsing added inline to generation code.
- UI code knows provider-specific response shapes.

Mitigations:

- Create adapters before adding new provider behavior.
- Keep provider quirks inside adapter files.
- Leave compatibility wrappers in `src/generation.js`, but move logic out.
- Add tests for adapter parsing.

Stop condition:

- If a feature requires adding another large provider branch to `src/generation.js`, implement adapter boundary first.

---

### R5 — Structured AI output is trusted too early

**Level:** High  
**Area:** AI output/data integrity

Symptoms:

- Invalid JSON is saved.
- Missing plot beats become empty cards.
- AI returns explanation text and app treats it as valid.

Mitigations:

- Parse and validate before save.
- Use schema contracts in `docs/schemas/`.
- Add one repair attempt, then fail clearly.
- Preserve raw output for user copy/debug but do not persist as valid plan unless marked invalid.

---

### R6 — API keys or manuscript text leak to logs

**Level:** High  
**Area:** Privacy/security

Symptoms:

- Console shows full prompt with scene text.
- Headers or API keys are logged.
- AI run history stores secrets.

Mitigations:

- Add safe logging helper.
- Store request summaries, not full secret-bearing payloads.
- Never store API keys in `aiRuns`.
- In Tauri mode, move secrets to secure storage when implemented.
- Add code review check for `console.log` in AI paths.

---

### R7 — Provider capability mismatch

**Level:** Medium  
**Area:** AI providers

Symptoms:

- User selects a local model that cannot produce schema output.
- Tool/structured output calls fail with provider-specific errors.
- Streaming parser fails on one provider.

Mitigations:

- Use provider capability registry.
- Gate structured-output tasks by capability and fallback mode.
- Provide non-streaming fallback.
- Show user-facing warnings for model-dependent features.
- Add mocked stream tests.

---

### R8 — Browser version breaks during Tauri work

**Level:** High  
**Area:** Platform

Symptoms:

- Browser app cannot export/import because code assumes Tauri APIs.
- `window.__TAURI__` references throw errors in browser.
- CDN vendoring changes break script order.

Mitigations:

- Use `PlatformAdapter` with browser fallback.
- Feature-detect Tauri safely.
- Keep browser tests as baseline.
- Vendor dependencies one at a time and run tests.

Stop condition:

- If a Tauri change breaks browser startup, fix browser path before continuing.

---

### R9 — Tauri permissions are too broad

**Level:** High  
**Area:** Desktop security

Symptoms:

- Capability grants broad filesystem or shell access.
- Sidecar/shell commands can run arbitrary programs.
- File dialogs can read/write unexpected locations without user intent.

Mitigations:

- Start with minimal capabilities.
- Add permissions only per phase.
- Scope filesystem operations to explicit user-selected paths or app data.
- Avoid shell permissions until sidecar phase.
- Review `src-tauri/capabilities/*.json` in every Tauri change.

---

### R10 — SQLite migration starts too early

**Level:** High  
**Area:** Storage/platform

Symptoms:

- Browser and desktop data models diverge.
- New template/plot fields require duplicate migrations.
- JSON import/export no longer maps cleanly.

Mitigations:

- Keep Dexie through Tauri thin wrapper.
- Stabilize Beat Template v2, plotPlans, aiRuns first.
- Use JSON export/import as migration path.
- Add storage adapter before SQLite adapter.

Stop condition:

- If template/plot schema is still changing, do not implement SQLite yet.

---

### R11 — Sidecar local AI is attempted too early

**Level:** Medium/High  
**Area:** Desktop/local AI

Symptoms:

- Builds fail on OS-specific binaries.
- App bundles model binaries unexpectedly.
- Antivirus or permissions block the app.
- Local AI UX blocks the rest of the product.

Mitigations:

- Support LM Studio/Ollama/OpenAI-compatible endpoints first.
- Add sidecar only after AI Gateway and Tauri wrapper are stable.
- Do not bundle large models.
- Let users select model files.
- Keep sidecar optional.

---

### R12 — UI grows without user workflow clarity

**Level:** Medium  
**Area:** UX

Symptoms:

- Story Beats panel becomes crowded.
- Users cannot distinguish Brief, Beat, Template, Plot Plan, Prompt.
- Generated content is saved without review.

Mitigations:

- Keep concepts separate in labels and data model.
- Add Plot Planning as a panel/modal rather than overloading every beat UI section.
- Always review generated plot cards before saving as beats.
- Keep Japanese and English labels aligned.

---

### R13 — Existing tests become obsolete without replacement

**Level:** Medium  
**Area:** Testing

Symptoms:

- Tests are deleted because they fail after refactor.
- Tests no longer cover old behavior.
- Agent claims manual confidence only.

Mitigations:

- Update tests instead of deleting them.
- Add compatibility tests for old and new formats.
- Record skipped tests and why.
- Keep smoke and generation tests passing.

---

### R14 — Official API assumptions become stale

**Level:** Medium  
**Area:** Provider integrations

Symptoms:

- Endpoint names or structured-output parameters have changed.
- Model lists are outdated.
- Adapter assumes unsupported fields.

Mitigations:

- Check official docs before implementing provider-specific details.
- Keep adapters isolated so changes are localized.
- Make provider model IDs user-configurable.
- Add graceful error messages.

---

## Review checklist before merging a phase

- [ ] Could this change destroy or overwrite user data?
- [ ] Does browser mode still work?
- [ ] Are provider-specific quirks isolated?
- [ ] Are new AI outputs validated before save?
- [ ] Are secrets excluded from logs and stored records?
- [ ] Are English and Japanese labels present?
- [ ] Does JSON export/import include new data?
- [ ] Did tests run or is the reason documented?
