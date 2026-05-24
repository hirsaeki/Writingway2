# Copy/Paste Prompts for Coding Agents

These prompts are designed to be given to a coding agent working in this repository. Use one phase at a time. Do not ask the agent to implement all phases in a single run.

## Prompt 0 — Preflight only

```text
You are working in the Writingway 2 repository. Read AGENTS.md, CODING_AGENT_HANDOFF.md, and docs/agent/01-current-state-audit.md first.

Do not modify code yet. Inspect the repository and report:
1. current Dexie latest schema version,
2. current beat template shape,
3. current AI provider implementation locations,
4. current test commands and whether they run,
5. any conflicts between old handoff docs and current source.

Run or attempt:
- pnpm install
- pnpm exec playwright install chromium
- pnpm run test
- node tests/beats.js
- node tests/data-management.js

If a command cannot run, report the exact reason. Do not claim tests pass unless they actually ran.
```

## Prompt 1 — Beat Template v2 and full BS2

```text
Implement Phase 1 from docs/agent/06-implementation-tasks.md.

Goal: convert beat templates to a v2 object-slot format while preserving existing string-slot templates, and add a full 15-slot Save the Cat / BS2 preset.

Read these files before coding:
- AGENTS.md
- CODING_AGENT_HANDOFF.md
- docs/agent/04-beat-template-and-plot-spec.md
- docs/schemas/beat-template-v2.schema.json
- src/db.js
- src/modules/beats.js
- src/modules/data-management.js
- tests/beats.js

Requirements:
- Add normalization for both string slots and object slots.
- Add stable slot IDs.
- Add full BS2 template with 15 slots.
- Preserve old templates and user custom templates.
- Add/adjust Dexie migration safely.
- Export v2 templates by default.
- Import both v1 and v2 templates.
- Update tests or add tests for v1 compatibility and v2 behavior.
- Keep browser app working.
- Keep English/Japanese UI strings synchronized if you add labels.

Do not start AI Gateway or Tauri work in this phase.

At the end, report files changed, tests run, test results, and any manual checks.
```

## Prompt 2 — AI Gateway foundation

```text
Implement Phase 2 from docs/agent/06-implementation-tasks.md.

Goal: introduce an AI Orchestrator and provider adapter foundation without breaking existing generation.

Read these first:
- AGENTS.md
- docs/agent/03-ai-gateway-spec.md
- docs/schemas/ai-request.schema.json
- src/generation.js
- src/modules/ai-settings.js
- src/ai.js
- tests/gen-buildPrompt.js

Requirements:
- Create src/ai/ modules for contracts, orchestrator, events, and adapters.
- Add provider capability registry.
- Implement at least OpenAI-compatible chat adapter and legacy llama.cpp /completion adapter.
- Keep window.Generation.buildPrompt() returning a string.
- Add a messages/request path without breaking prompt preview.
- Make streamGeneration delegate through the orchestrator where possible.
- Move provider-specific logic out of src/generation.js incrementally.
- Do not log full prompts, scene text, or API keys by default.
- Add mocked tests for at least one adapter stream.

Do not implement plot generation yet except for contract support.

At the end, report compatibility behavior and tests run.
```

## Prompt 3 — Structured output support

```text
Implement Phase 3 from docs/agent/06-implementation-tasks.md.

Goal: add structured JSON output validation for future plot generation and template customization.

Read:
- docs/agent/03-ai-gateway-spec.md
- docs/schemas/plot-plan.schema.json
- docs/schemas/beat-template-v2.schema.json

Requirements:
- Add structured output helper(s).
- Parse JSON safely.
- Validate required fields/types for plot-plan and beat-template schemas.
- Do not save invalid output.
- Add one repair-attempt path or a clearly stubbed repair hook if provider integration is not ready.
- Add tests for valid JSON, invalid JSON, schema-invalid output, and repair/failure behavior.

Do not build full plot UI in this phase.
```

## Prompt 4 — Plot planning records and UI shell

```text
Implement Phase 4 from docs/agent/06-implementation-tasks.md.

Goal: add persistent plot plans and a review UI shell before AI generation.

Read:
- docs/agent/04-beat-template-and-plot-spec.md
- docs/schemas/plot-plan.schema.json
- src/db.js
- src/modules/data-management.js
- src/modules/beats.js
- main.html
- src/i18n.js

Requirements:
- Add Dexie table(s) for plotPlans and aiRuns.
- Update Data Management exports/imports.
- Add Plot Planning UI state and panel/modal.
- Allow manual creation of draft plot-plan cards.
- Allow saving selected plot-plan cards as structural beats.
- Do not require AI to use this phase.
- Add tests for save/load/convert/export/import.

At the end, report all migrations and test results.
```

## Prompt 5 — AI plot generation from templates

```text
Implement Phase 5 from docs/agent/06-implementation-tasks.md.

Goal: generate structured plot plans from selected beat templates using the AI Gateway.

Read:
- docs/agent/03-ai-gateway-spec.md
- docs/agent/04-beat-template-and-plot-spec.md
- docs/schemas/plot-plan.schema.json

Requirements:
- Build AIRequest with task plot.generate.
- Include normalized template slots and user inputs.
- Use structured output validation.
- Store aiRuns metadata without secrets.
- Save output as plotPlans.status='draft'.
- Show generated cards for review.
- Do not save generated cards as beats until user confirms.
- Add tests using mocked AI response.
```

## Prompt 6 — AI template customization

```text
Implement Phase 6 from docs/agent/06-implementation-tasks.md.

Goal: let users customize a structure template with AI and save the result as a reusable custom template.

Read:
- docs/agent/04-beat-template-and-plot-spec.md
- docs/schemas/beat-template-v2.schema.json

Requirements:
- Add UI/modal for customization instructions.
- Build AIRequest with task template.customize.
- Validate output as beat-template v2.
- Show change summary and slot list before save.
- Save as source='aiCustomized', builtIn=false, baseTemplateId set.
- Do not modify original template.
- Add tests with mocked AI output.
```

## Prompt 7 — Local preference/template tuning

```text
Implement Phase 7 from docs/agent/06-implementation-tasks.md.

Goal: add practical local fine-tuning behavior through preferences and edit history, without calling external model fine-tuning APIs.

Requirements:
- Store explicit user preferences for plot/template generation.
- Track accepted/rejected generated plans/templates enough to summarize preferences.
- Include preference summary in future AI requests.
- Add UI to view/reset preferences.
- Export/import preference data if stored in Dexie.
- Do not call any provider fine-tuning API.
```

## Prompt 8 — Tauri readiness

```text
Implement Phase 8 from docs/agent/06-implementation-tasks.md.

Goal: prepare the browser app for Tauri packaging while preserving browser mode.

Read:
- docs/agent/05-tauri-desktop-plan.md

Requirements:
- Vendor Dexie and JSZip locally.
- Update main.html to use local scripts.
- Add browser PlatformAdapter.
- Route JSON download through PlatformAdapter where practical.
- Confirm app starts without external JS dependencies.
- Do not add src-tauri yet unless this phase is explicitly expanded.
- Run browser tests.
```

## Prompt 9 — Tauri thin wrapper

```text
Implement Phase 9 from docs/agent/06-implementation-tasks.md.

Goal: add a minimal Tauri v2 wrapper without changing storage.

Read:
- docs/agent/05-tauri-desktop-plan.md

Requirements:
- Add src-tauri skeleton.
- Configure Tauri to open the existing app.
- Add minimal capabilities only.
- Add package scripts for tauri dev/build.
- Add safe Tauri detection to PlatformAdapter.
- Keep Dexie storage for now.
- Keep browser mode working.
- Do not add SQLite or sidecars yet.

Report Tauri build/run results or exact missing prerequisites.
```

## Prompt 10 — Tauri hardening

```text
Implement only the specifically requested Tauri hardening subphase. Do not implement all hardening features at once.

Possible subphases:
A. Native file export/import.
B. Secure API-key storage.
C. Rust AI proxy.
D. SQLite storage adapter.
E. Optional llama.cpp sidecar.
F. Updater/release packaging.

Before coding, restate which subphase you are implementing and which permissions it needs. Keep browser mode working and keep permissions minimal.
```

## Prompt for reviewing an agent's patch

```text
Review this patch against AGENTS.md and docs/agent/08-risk-register.md.

Check specifically:
- Could any Dexie migration lose data?
- Are all existing tables included in new schema versions?
- Are browser paths still working?
- Are provider-specific quirks isolated in adapters?
- Are AI structured outputs validated before save?
- Are API keys and full prompts excluded from logs and aiRuns?
- Are English/Japanese strings both updated?
- Are JSON export/import tables updated?
- Did the agent run tests and report actual commands?

Return blocking issues first, then non-blocking improvements.
```
