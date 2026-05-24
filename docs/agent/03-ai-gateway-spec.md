# AI Gateway Specification

## Purpose

The current AI implementation is useful but too centralized. `src/generation.js` builds prompts, builds provider payloads, parses streaming responses, detects reasoning models, handles local llama.cpp `/completion`, and delegates some workshop retries. This makes modern AI features hard to add safely.

The AI Gateway refactor introduces one internal request contract and provider adapters. Existing user-facing behavior should continue through compatibility wrappers.

## Goals

- Support modern cloud providers and local OpenAI-compatible providers through one internal contract.
- Add structured-output support for plot plans and template customization.
- Keep prose generation working.
- Normalize streaming and non-streaming outputs.
- Keep provider-specific behavior out of UI code.
- Support future Tauri API proxying and secure key storage.
- Store auditable AI run metadata without storing secrets.

## Non-goals for the first AI Gateway phase

- Do not remove existing providers.
- Do not force all local AI through llama.cpp sidecars.
- Do not migrate storage to SQLite.
- Do not add model-level fine-tuning APIs yet.
- Do not require a build step unless separately approved.

## Internal request contract

Use `docs/schemas/ai-request.schema.json` as the schema reference.

Recommended JavaScript shape:

```js
const request = {
  task: 'prose.generate',
  system: 'Optional top-level system/developer guidance',
  messages: [
    { role: 'system', content: '...' },
    { role: 'user', content: '...' }
  ],
  context: {
    projectId: '...',
    sceneId: '...',
    beatIds: [],
    templateId: '...',
    plotPlanId: '...'
  },
  responseSchema: null,
  tools: [],
  stream: true,
  modelProfile: {
    provider: 'openai',
    model: '...',
    contextWindow: null,
    supportsTools: false,
    supportsStructuredOutput: false,
    supportsVision: false
  },
  generation: {
    temperature: 0.8,
    maxOutputTokens: 1200,
    reasoningEffort: 'none'
  },
  metadata: {
    source: 'scene-panel',
    saveRun: true
  }
};
```

Supported task IDs:

| Task | Purpose | Structured output? |
| --- | --- | --- |
| `prose.generate` | Brief-to-prose continuation. | Optional, usually no. |
| `rewrite` | Rewrite selected text. | Optional. |
| `scene.summarize` | Summarize a scene/chapter. | Optional. |
| `compendium.extract` | Extract worldbuilding facts. | Yes, later. |
| `plot.generate` | Generate plot beats from a template. | Yes. |
| `template.customize` | Customize a structure template. | Yes. |
| `beat.expand` | Expand a structural beat into scene ideas or prose brief. | Optional/yes. |
| `workshop.chat` | Workshop chat. | No or optional. |

## Normalized events

Provider adapters should emit normalized events. UI code should consume these events instead of provider-specific SSE payloads.

```js
{
  type: 'start',
  runId: '...'
}

{
  type: 'text_delta',
  text: 'partial text'
}

{
  type: 'json_delta',
  text: 'partial JSON text'
}

{
  type: 'tool_call',
  toolCall: {
    id: '...',
    name: '...',
    argumentsText: '...'
  }
}

{
  type: 'usage',
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  }
}

{
  type: 'done',
  outputText: '...',
  outputJson: null,
  raw: null
}

{
  type: 'error',
  error: {
    message: '...',
    provider: '...',
    status: 400
  }
}
```

## Provider adapter interface

Recommended shape:

```js
function createProviderAdapter() {
  return {
    id: 'openai-responses',
    label: 'OpenAI Responses',
    capabilities: {
      streaming: true,
      nonStreaming: true,
      structuredOutput: true,
      tools: true,
      vision: false,
      local: false,
      requiresApiKey: true
    },
    normalizeSettings(settings) {},
    canHandle(aiRequest, settings) {},
    buildPayload(aiRequest, settings) {},
    async send(aiRequest, settings, callbacks) {},
    parseStreamLine(line, state) {},
    parseFinalResponse(json, state) {}
  };
}
```

Adapters should not touch Alpine app state directly. They receive settings and callbacks.

## Initial adapters

### `openai-responses.js`

Use for OpenAI's Responses-style API and for compatible providers that support `/v1/responses`.

Responsibilities:

- Build Responses payloads.
- Map `responseSchema` to provider structured-output configuration.
- Map reasoning controls when supported.
- Parse text deltas and final response objects.
- Support non-streaming fallback.

### `openai-chat-compatible.js`

Use for OpenAI-compatible Chat Completions providers:

- OpenRouter.
- LM Studio `/v1/chat/completions`.
- Ollama `/v1/chat/completions` when configured.
- NanoGPT/custom compatible endpoints when possible.
- Legacy OpenAI Chat Completions while supported.

Responsibilities:

- Build `messages` payloads.
- Optionally use JSON/schema response format when supported by a specific provider.
- Parse `choices[].delta.content` streams.
- Normalize usage.

### `anthropic-messages.js`

Use for Anthropic Messages API.

Responsibilities:

- Split `system` from non-system messages if needed.
- Build Messages payload.
- Parse Anthropic SSE events into text deltas.
- Map structured output through tool/schema strategy when supported.
- Normalize usage.

### `gemini.js`

Use for Google Gemini native API.

Responsibilities:

- Map internal messages to Gemini contents.
- Build streaming and non-streaming payloads.
- Support structured output configuration where supported.
- Parse candidate content parts.

### `legacy-llama-completion.js`

Use for current llama.cpp `/completion` compatibility.

Responsibilities:

- Convert messages to ChatML only for this legacy endpoint.
- Preserve current local-mode behavior.
- Parse `data: { content, stop }` SSE chunks.
- Mark capabilities as limited: no guaranteed structured output, no tools, legacy only.

## Provider capability registry

Add a registry that describes provider capabilities independently from UI labels:

```js
const AI_PROVIDER_CAPABILITIES = {
  openai: {
    adapter: 'openai-responses',
    cloud: true,
    requiresApiKey: true,
    structuredOutput: true,
    tools: true,
    supportsModelList: true
  },
  anthropic: {
    adapter: 'anthropic-messages',
    cloud: true,
    requiresApiKey: true,
    structuredOutput: 'tool-or-schema',
    tools: true,
    supportsModelList: false
  },
  google: {
    adapter: 'gemini',
    cloud: true,
    requiresApiKey: true,
    structuredOutput: true,
    tools: true,
    supportsModelList: false
  },
  openrouter: {
    adapter: 'openai-chat-compatible',
    cloud: true,
    requiresApiKey: true,
    structuredOutput: 'model-dependent',
    tools: 'model-dependent',
    supportsModelList: true
  },
  lmstudio: {
    adapter: 'openai-chat-compatible',
    local: true,
    requiresApiKey: false,
    structuredOutput: 'model-dependent',
    tools: 'model-dependent',
    supportsModelList: true
  },
  ollama: {
    adapter: 'openai-chat-compatible',
    local: true,
    requiresApiKey: false,
    structuredOutput: 'model-dependent',
    tools: 'model-dependent',
    supportsModelList: true
  },
  llamaCompletion: {
    adapter: 'legacy-llama-completion',
    local: true,
    requiresApiKey: false,
    structuredOutput: false,
    tools: false,
    supportsModelList: false
  },
  custom: {
    adapter: 'openai-chat-compatible',
    cloud: false,
    local: false,
    requiresApiKey: 'optional',
    structuredOutput: 'unknown',
    tools: 'unknown',
    supportsModelList: false
  }
};
```

The UI can still group providers as:

- Easy cloud setup.
- Local API setup.
- Advanced/custom.

But task support should be based on capabilities.

## Structured output handling

Structured tasks should pass a JSON Schema through `request.responseSchema`.

Minimum behavior:

1. Ask provider for schema-constrained output when the adapter supports it.
2. If schema-constrained output is not supported, use a strict JSON prompt fallback.
3. Parse response as JSON.
4. Validate against schema.
5. If validation fails, attempt one repair request using the original output and validation errors.
6. If repair fails, show a clear error and preserve the raw output for manual copy.

Never silently save invalid structured output.

## Compatibility wrapper for prose generation

`window.Generation.buildPrompt()` currently returns a string used by tests and preview UI. Preserve it.

Add a new method instead of changing the old one immediately:

```js
window.Generation.buildPromptMessages = function buildPromptMessages(brief, sceneContext, options) {
  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    asString() { return messagesToChatML(this.messages); }
  };
};
```

Then make `streamGeneration()` accept either:

- existing string prompt,
- messages array,
- new `AIRequest` object.

## Logging and privacy

Default production behavior:

- Do not log full prompts.
- Do not log generated manuscript text.
- Do not log API keys or headers.
- Do not log full provider response bodies unless debug mode is explicitly enabled.

Acceptable logs:

- Provider ID.
- Model ID.
- Task ID.
- Error status/message.
- Token usage.
- Whether streaming or non-streaming was used.

Add a central helper such as:

```js
window.DebugLog = {
  enabled: false,
  safe(event, payload) {},
  sensitive(event, payload) {}
};
```

`DebugLog.sensitive()` should be a no-op unless explicit debug mode is enabled.

## API key handling

Browser mode:

- Existing localStorage settings can remain.
- UI should warn that keys are stored locally in browser storage.

Tauri mode later:

- Store keys through the platform adapter.
- Prefer secure storage/Stronghold/keyring once implemented.
- Consider routing provider calls through Rust commands so keys do not live in renderer state longer than necessary.

## AI run records

Add `aiRuns` only when structured AI features begin.

Store:

- task
- provider
- model
- projectId/sceneId/templateId/plotPlanId where relevant
- status
- request summary, not secrets
- response summary or structured output reference
- usage
- validation errors
- timestamps

Do not store API keys. Avoid storing full manuscript text unless the user opts into history.

See `docs/schemas/ai-run.schema.json`.

## Testing requirements

Add tests for:

- Adapter selection by provider/task.
- Messages-to-provider payload mapping.
- Streaming parser with mocked chunks for each adapter.
- Structured output validation success.
- Structured output invalid JSON failure.
- Structured output repair path.
- Compatibility: `window.Generation.buildPrompt()` still returns a string.
- Compatibility: existing generation UI still appends streamed text.

## Official documentation references

Keep these references current when implementing provider-specific behavior:

- OpenAI Responses and migration: `https://developers.openai.com/api/docs/guides/migrate-to-responses`
- OpenAI structured outputs: `https://developers.openai.com/api/docs/guides/structured-outputs`
- OpenAI function/tool calling: `https://developers.openai.com/api/docs/guides/function-calling`
- Anthropic structured outputs: `https://platform.claude.com/docs/en/build-with-claude/structured-outputs`
- Anthropic streaming: `https://platform.claude.com/docs/en/build-with-claude/streaming`
- Gemini structured output: `https://ai.google.dev/gemini-api/docs/structured-output`
- LM Studio OpenAI compatibility: `https://lmstudio.ai/docs/developer/openai-compat`
- Ollama OpenAI compatibility: `https://docs.ollama.com/api/openai-compatibility`

## Done when

- Existing generation still works.
- At least one cloud provider and one local OpenAI-compatible provider can be represented by the new contract.
- Structured-output requests can be made through the orchestrator with validation.
- Provider-specific payload and stream parsing logic no longer grows inside `src/generation.js`.
- Tests cover compatibility wrappers and at least one mocked adapter stream.
