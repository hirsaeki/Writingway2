# Target Architecture

## Intent

Writingway 2 should become an AI creative-writing workbench while preserving the current browser-first application. The main architectural change is not a framework rewrite. It is the introduction of clear service and adapter boundaries around AI, templates, plot planning, storage, and platform features.

## Layer model

```text
UI Layer
  main.html
  Alpine state and wrappers in src/app.js
  User-facing panels: AI Settings, Story Beats, Plot Planning, Data Management

Application Services
  AI Orchestrator
  Context Builder
  Beat Template Service
  Plot Planning Service
  Template Customization Service
  User Preference / Tuning Service
  Data Management Service

Adapters
  AI Provider Adapters
  Storage Adapters
  Platform Adapters
```

The existing UI and global modules can stay. New services should be plain browser-compatible JavaScript globals until a build step is intentionally introduced.

## Proposed module tree

```text
src/
  ai/
    ai-orchestrator.js
    ai-contracts.js
    ai-events.js
    response-normalizer.js
    providers/
      openai-responses.js
      openai-chat-compatible.js
      anthropic-messages.js
      gemini.js
      legacy-llama-completion.js
    schemas.js

  services/
    context-builder.js
    beat-template-service.js
    plot-planning-service.js
    template-customization-service.js
    preference-service.js

  platform/
    platform-adapter.js
    browser-platform.js
    tauri-platform.js

  storage/
    storage-adapter.js
    dexie-storage.js
    sqlite-storage.js        # later, Tauri-only

  modules/
    beats.js                 # UI-facing wrapper can remain here
    data-management.js
    ai-settings.js
    plot-planning.js         # new UI-facing module
```

The exact filenames may change, but the separation should remain.

## UI layer responsibilities

The UI layer should:

- Render user controls and panels.
- Maintain view state.
- Call services through stable methods.
- Display progress/errors/results.
- Provide English/Japanese strings through `src/i18n.js`.

The UI layer should not:

- Build provider-specific API payloads.
- Parse provider-specific streaming events.
- Mutate Dexie records directly for complex workflows.
- Store API keys directly in Tauri mode.
- Decide storage backends.

## Application service responsibilities

### AI Orchestrator

Owns the internal AI request contract and delegates to provider adapters.

Responsibilities:

- Accept `AIRequest` objects.
- Select provider adapter based on settings/capabilities.
- Normalize streaming and non-streaming responses into `AIEvent` objects.
- Support structured output validation.
- Support retries/repair for structured JSON tasks.
- Return usage/errors in normalized form.
- Save optional `aiRuns` records through storage service.

### Context Builder

Builds AI context from project data.

Responsibilities:

- Build prose generation context.
- Build plot generation context.
- Build template customization context.
- Return both a human-readable preview and structured messages.
- Estimate prompt size.
- Resolve compendium and scene mentions.
- Include structural beats when requested.

### Beat Template Service

Owns template contracts and operations.

Responsibilities:

- Normalize v1 string-slot templates into v2 slot objects.
- Seed built-in presets.
- Import/export v2 templates.
- Create beats from templates.
- Preserve stable slot IDs.
- Track built-in vs custom vs imported vs AI-customized templates.

### Plot Planning Service

Owns plot-plan creation and conversion to beats.

Responsibilities:

- Generate prompt/request from a selected template and project premise.
- Validate AI output against plot plan schema.
- Store draft `plotPlans`.
- Allow review before saving beats.
- Convert accepted plot-plan beats into structural `beats` rows.

### Template Customization Service

Owns AI-assisted modifications to structure templates.

Responsibilities:

- Generate a modified template from a base template and user instructions.
- Validate modified template against template schema.
- Explain changes to the user.
- Save output as a custom template with `baseTemplateId`.

### Preference / Tuning Service

Owns user-level adaptation before model fine-tuning.

Responsibilities:

- Track user adjustments to generated plot plans and templates.
- Store preferences such as preferred beat granularity, tone, genre weighting, and scene density.
- Add preferences to future AI requests.
- Optionally export examples for later provider-specific model fine-tuning.

## Adapter responsibilities

### AI Provider Adapter

Each adapter should implement the same high-level shape:

```js
const adapter = {
  id: 'openai-responses',
  label: 'OpenAI Responses',
  capabilities: {
    streaming: true,
    structuredOutput: true,
    tools: true,
    vision: true,
    statefulResponses: true
  },
  buildRequest(aiRequest, settings) {},
  send(request, callbacks) {},
  parseStreamChunk(chunk, state) {},
  parseNonStreamingResponse(response) {},
  extractUsage(responseOrEvent) {}
};
```

Provider quirks belong in adapters. The UI should not know how Anthropic, Gemini, OpenAI, OpenRouter, LM Studio, Ollama, or legacy llama.cpp format their payloads.

### Storage Adapter

Short-term storage remains Dexie. The point of a storage adapter is to isolate future desktop storage changes.

```js
const storage = {
  getProject(id) {},
  listProjects() {},
  getTemplate(id) {},
  saveTemplate(template) {},
  listTemplates() {},
  savePlotPlan(plotPlan) {},
  listPlotPlans(projectId) {},
  saveAiRun(aiRun) {},
  exportAll() {},
  importAll(envelope) {}
};
```

Rules:

- Do not introduce SQLite until the JSON export/import contracts and Dexie tables are stable.
- JSON export/import remains the portable migration mechanism.
- Desktop storage can later map the same adapter to SQLite.

### Platform Adapter

The platform adapter should hide browser-vs-Tauri differences.

```js
const platform = {
  kind: 'browser' | 'tauri',
  isTauri() {},
  downloadJson(filename, data) {},
  pickJsonFile() {},
  saveSecret(key, value) {},
  loadSecret(key) {},
  requestAiViaProxy(request) {},
  openExternal(url) {}
};
```

Browser mode can use downloads, file inputs, localStorage, and direct fetch. Tauri mode can later use file dialogs, filesystem permissions, secure storage, and Rust command proxying.

## Data flow: template-based plot generation

```text
User selects template + enters premise/genre/length
  ↓
PlotPlanning UI calls PlotPlanningService.generate()
  ↓
BeatTemplateService normalizes template v2
  ↓
ContextBuilder creates human preview + structured messages
  ↓
AIOrchestrator sends AIRequest with plot-plan schema
  ↓
ProviderAdapter sends provider-specific request
  ↓
AIOrchestrator validates/repairs response
  ↓
PlotPlanningService stores draft plotPlan
  ↓
UI displays cards for review
  ↓
User accepts selected cards
  ↓
PlotPlanningService converts cards to beats
```

## Data flow: template customization

```text
User chooses base template + customization instruction
  ↓
TemplateCustomizationService builds AIRequest with template schema
  ↓
AIOrchestrator obtains structured custom template
  ↓
BeatTemplateService validates and normalizes slots
  ↓
UI shows original vs customized diff
  ↓
User saves as custom template
```

## Data flow: prose generation after refactor

Existing prose generation must continue to work.

```text
Brief + current scene + selected context
  ↓
ContextBuilder creates prose context and preview
  ↓
Generation compatibility wrapper creates AIRequest
  ↓
AIOrchestrator routes to adapter
  ↓
Normalized stream events append text to UI
```

## Compatibility strategy

Keep these existing entry points alive until all callers are migrated:

- `window.Generation.buildPrompt()`
- `window.Generation.streamGeneration()`
- `window.Generation.retryGeneration()` if currently used
- `window.Beats.*` public methods
- `window.DataManagement.*` public methods
- `window.AISettings.*` public methods

Add new service globals beside them. Do not silently change public return types used by tests.

## Recommended service global names

```js
window.AIOrchestrator
window.AIProviders
window.ContextBuilder
window.BeatTemplateService
window.PlotPlanningService
window.TemplateCustomizationService
window.PlatformAdapter
window.StorageAdapter
```

## Boundaries that must remain clear

- Briefs are transient AI generation instructions.
- Beats are structural story units.
- Beat templates are story-structure frameworks.
- Plot plans are AI-generated or user-authored proposed beat sets.
- Prompts are reusable instruction text.
- User preferences are local adaptation metadata.
- Model fine-tuning is deferred until enough examples and provider-specific export formats exist.

## Avoided architecture

Do not do these first:

- Full framework migration.
- Immediate SQLite rewrite.
- Immediate local model sidecar packaging.
- Removing browser support.
- Moving all logic into Rust.
- Making AI provider choice drive UI business logic.

The product should become more capable without making the current reliable static-app path fragile.
