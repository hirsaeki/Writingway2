# Beat Template, Plot Planning, and Template Customization Specification

## Purpose

Writingway 2 already has structural beats and simple templates. The next step is to make templates rich enough for AI-assisted planning and customization.

This document defines:

- Beat Template v2.
- Full BS2 preset shape.
- Migration from current `string[]` slot templates.
- Plot plan records.
- AI run records.
- Template customization records.
- User/profile/template-level tuning behavior.

## Current problem

Current templates look like this:

```js
{
  id: 'preset-save-the-cat',
  name: 'Save the Cat / BS2',
  builtIn: true,
  slots: ['Opening Image', 'Theme Stated', 'Catalyst', 'Break into Two', 'Midpoint', 'All Is Lost', 'Finale']
}
```

This works for manual beat creation but is too shallow for AI planning because the model receives only names, not each beat's purpose, desired output, or structural position.

## Target Beat Template v2

Use `docs/schemas/beat-template-v2.schema.json` as the contract.

Recommended stored shape:

```js
{
  id: 'preset-save-the-cat-bs2',
  name: 'Save the Cat / BS2',
  version: 2,
  builtIn: true,
  source: 'builtIn',
  baseTemplateId: '',
  description: 'A 15-beat commercial story structure template.',
  medium: 'novel',
  tags: ['structure', 'bs2'],
  slots: [
    {
      id: 'opening-image',
      title: 'Opening Image',
      order: 0,
      description: 'A snapshot of the protagonist/world before the main transformation.',
      purpose: 'Establish the starting state and create contrast with the ending.',
      recommendedPosition: { percentStart: 0, percentEnd: 1 },
      promptHint: 'Show the ordinary world, mood, protagonist state, and central lack without explaining the whole plot.',
      requiredInputs: ['premise', 'protagonist'],
      outputSchema: null,
      examples: []
    }
  ],
  created: new Date(),
  modified: new Date(),
  updatedAt: Date.now()
}
```

Recommended `source` values:

| Value | Meaning |
| --- | --- |
| `builtIn` | Seeded application preset. |
| `custom` | User-created manually. |
| `imported` | Imported from a file. |
| `aiCustomized` | Created by AI from a base template. |

Recommended `medium` values:

- `novel`
- `screenplay`
- `shortStory`
- `manga`
- `game`
- `general`

## Slot fields

| Field | Required | Notes |
| --- | --- | --- |
| `id` | Yes | Stable slug. Do not use array index as permanent ID. |
| `title` | Yes | User-facing slot title. |
| `order` | Yes | Numeric order inside template. |
| `description` | Yes | What this slot represents. |
| `purpose` | Yes | Why this beat exists in the story. |
| `recommendedPosition` | No | `{ percentStart, percentEnd }` rough story position. |
| `promptHint` | No | Guidance for AI generation. |
| `requiredInputs` | No | Inputs helpful for generation. |
| `outputSchema` | No | Slot-specific schema if needed later. |
| `examples` | No | Short examples, not required. |

## Backward compatibility

Existing templates have `slots: string[]`. Support them forever at the service boundary.

Add a normalizer:

```js
function normalizeTemplate(template) {
  const slots = Array.isArray(template.slots) ? template.slots : [];
  const normalizedSlots = slots.map((slot, index) => {
    if (typeof slot === 'string') {
      return {
        id: slugify(slot) || `slot-${index + 1}`,
        title: slot,
        order: index,
        description: '',
        purpose: '',
        recommendedPosition: null,
        promptHint: '',
        requiredInputs: [],
        outputSchema: null,
        examples: []
      };
    }
    return {
      id: slot.id || slugify(slot.title) || `slot-${index + 1}`,
      title: slot.title || `Slot ${index + 1}`,
      order: Number.isFinite(slot.order) ? slot.order : index,
      description: slot.description || '',
      purpose: slot.purpose || '',
      recommendedPosition: slot.recommendedPosition || null,
      promptHint: slot.promptHint || '',
      requiredInputs: Array.isArray(slot.requiredInputs) ? slot.requiredInputs : [],
      outputSchema: slot.outputSchema || null,
      examples: Array.isArray(slot.examples) ? slot.examples : []
    };
  });

  return {
    ...template,
    version: 2,
    source: template.source || (template.builtIn ? 'builtIn' : 'custom'),
    slots: normalizedSlots
  };
}
```

## Dexie migration plan

Add a new schema version after v11. Do not omit existing tables.

Recommended v12 purpose:

- Keep `beatTemplates` table.
- Migrate existing `string[]` slots to slot objects.
- Seed/replace built-in presets with v2 shape.
- Preserve user templates.

Important rule for built-ins:

- Built-in presets may be updated by ID.
- User-customized templates must not be overwritten.
- If a user has edited a built-in directly and `builtIn: true`, consider preserving a backup copy or avoid overwriting fields other than known built-in IDs seeded by the application.

Safer built-in strategy:

1. Add new built-in IDs such as `preset-save-the-cat-bs2-v2` instead of changing existing simplified IDs.
2. Keep old `preset-save-the-cat` for compatibility or mark it as legacy.
3. Let users choose the new full template explicitly.

## Full BS2 preset

Recommended slot definitions:

| Order | Slot ID | Title | Approx. position | Purpose |
| ---: | --- | --- | --- | --- |
| 0 | `opening-image` | Opening Image | 0-1% | Show the protagonist/world before transformation. |
| 1 | `theme-stated` | Theme Stated | 1-5% | Plant the story's moral/emotional argument. |
| 2 | `setup` | Set-Up | 1-10% | Establish ordinary world, wants, flaws, stakes, and supporting cast. |
| 3 | `catalyst` | Catalyst | 10-12% | Introduce the event that disrupts the status quo. |
| 4 | `debate` | Debate | 12-20% | Show resistance, uncertainty, or failed attempts before commitment. |
| 5 | `break-into-two` | Break into Two | 20-25% | Commit to the new world, quest, relationship, or story mode. |
| 6 | `b-story` | B Story | 22-30% | Introduce relationship/theme thread that pressures the inner arc. |
| 7 | `fun-and-games` | Fun and Games | 25-50% | Deliver the premise's promise; explore the new world and complications. |
| 8 | `midpoint` | Midpoint | 45-55% | Major reversal, false win/false loss, stakes escalation. |
| 9 | `bad-guys-close-in` | Bad Guys Close In | 50-68% | External and internal pressures tighten after the midpoint. |
| 10 | `all-is-lost` | All Is Lost | 68-75% | Apparent defeat or irreversible loss. |
| 11 | `dark-night-of-the-soul` | Dark Night of the Soul | 75-80% | Protagonist processes defeat and confronts the inner flaw. |
| 12 | `break-into-three` | Break into Three | 80-85% | Synthesize plot/theme into a final plan or transformed choice. |
| 13 | `finale` | Finale | 85-99% | Resolve conflict through transformed action. |
| 14 | `final-image` | Final Image | 99-100% | Show contrast with opening and confirm transformation. |

Suggested built-in object ID:

```text
preset-save-the-cat-bs2-v2
```

Keep the simplified existing `preset-save-the-cat` unless a migration clearly preserves user expectations.

## Other preset upgrades

Three Act, Hero's Journey, and Kishotenketsu should also use slot objects.

Minimum upgrade:

- Preserve current slot names.
- Add stable IDs.
- Add brief description/purpose/promptHint.
- Add `source: 'builtIn'`, `version: 2`, and `medium: 'general'`.

## Creating beats from template v2

Current beats created from templates use:

```js
{
  title: slot,
  templateSlotId: String(index)
}
```

Update to:

```js
{
  title: slot.title,
  body: slot.promptHint || slot.description || '',
  templateId: template.id,
  templateSlotId: slot.id,
  templateSlotTitle: slot.title,       // optional snapshot
  templateSlotOrder: slot.order,       // optional snapshot
  tags: template.tags || []
}
```

Do not require every generated beat to remain linked to the template forever. A beat is editable story data.

## Beat template import/export v2

Version 2 envelope:

```json
{
  "format": "writingway2.beat-template",
  "version": 2,
  "exportedAt": "2026-05-21T00:00:00.000Z",
  "template": {}
}
```

Rules:

- Accept v1 imports where `template.slots` is `string[]`.
- Normalize to v2 before saving.
- Imported templates should get a new ID unless the user explicitly chooses overwrite.
- Imported templates should use `source: "imported"` and `builtIn: false`.
- Export should write v2 by default.

## Plot plan data model

Add a new `plotPlans` table after template v2 is stable.

Recommended table index:

```js
plotPlans: 'id, projectId, templateId, status, created, modified, updatedAt'
```

Recommended row:

```js
{
  id: '...',
  projectId: '...',
  templateId: 'preset-save-the-cat-bs2-v2',
  name: 'Dark fantasy BS2 plot',
  status: 'draft',
  premise: '...',
  genre: 'dark fantasy',
  targetLength: '100000 words',
  tone: 'bleak but hopeful',
  medium: 'novel',
  source: 'ai',
  beats: [
    {
      id: '...',
      slotId: 'opening-image',
      slotTitle: 'Opening Image',
      title: 'The ruined harbor',
      summary: '...',
      characterArc: '...',
      conflict: '...',
      sceneIdeas: ['...'],
      openQuestions: ['...'],
      tags: []
    }
  ],
  aiRunId: '...',
  created: new Date(),
  modified: new Date(),
  updatedAt: Date.now()
}
```

Recommended statuses:

- `draft`
- `reviewed`
- `accepted`
- `archived`

Use `docs/schemas/plot-plan.schema.json` as the structured output contract.

## AI run data model

Add `aiRuns` when plot generation or template customization begins.

Recommended table index:

```js
aiRuns: 'id, projectId, task, provider, model, status, created, updatedAt'
```

Recommended row:

```js
{
  id: '...',
  projectId: '...',
  sceneId: '',
  templateId: '...',
  plotPlanId: '...',
  task: 'plot.generate',
  provider: 'openai',
  model: '...',
  status: 'succeeded',
  requestSummary: {
    promptChars: 0,
    hasSchema: true,
    contextKinds: ['template', 'premise', 'compendium']
  },
  responseSummary: {
    outputChars: 0,
    structured: true,
    validationErrors: []
  },
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  },
  created: new Date(),
  updatedAt: Date.now()
}
```

Do not store API keys. Avoid storing full manuscript text unless the user explicitly opts into detailed AI history.

## Template customization model

Template customization can be represented as a saved `beatTemplates` row with:

```js
{
  source: 'aiCustomized',
  baseTemplateId: 'preset-save-the-cat-bs2-v2',
  customization: {
    instruction: 'Adapt for a 100k-word dark fantasy novel with more inner conflict.',
    changeSummary: [
      'Split Fun and Games into exploration and betrayal buildup.',
      'Reduce romance emphasis in B Story.',
      'Expand finale into four escalation beats.'
    ],
    aiRunId: '...'
  }
}
```

A separate `templateCustomizations` table is optional. Start by embedding a small customization object in the template row. Add a table later only if version history becomes necessary.

## User/profile/template fine-tuning

Do not start provider model fine-tuning first. Start with local adaptation.

Recommended table:

```js
userPreferences: 'id, scope, projectId, key, updatedAt'
```

Or use a simpler localStorage object initially.

Recommended preference keys:

- `plot.beatDensity`
- `plot.prefersLongerMidpoint`
- `plot.prefersDetailedInnerArc`
- `plot.defaultMedium`
- `style.defaultTone`
- `ai.acceptedProvider`
- `ai.structuredOutputRetryLimit`

Recommended learning events:

```js
{
  id: '...',
  projectId: '...',
  source: 'plotPlanEdit',
  before: { summary: '...' },
  after: { summary: '...' },
  inference: {
    key: 'plot.prefersDetailedInnerArc',
    confidence: 0.6
  },
  created: new Date()
}
```

MVP tuning behavior:

- Save explicit user preferences from UI controls.
- Track accepted/rejected generated templates and plot plans.
- Summarize preferences into future AI requests.
- Offer an export of examples later for provider-specific fine-tuning.

Do not call external fine-tuning APIs until:

- The user has opted in.
- Training examples are exportable and reviewable.
- Provider-specific cost and data policy warnings are implemented.

## User workflow: generate plot from template

1. User opens Story Beats / Plot Planning.
2. User chooses a structure template.
3. User enters premise, genre, target length, tone, optional cast/setting notes.
4. User clicks **Generate Plot from Template**.
5. UI shows context summary and raw request toggle.
6. AI returns structured plot plan.
7. App validates the output.
8. UI displays beat cards by template slot.
9. User edits/reorders/selects cards.
10. User saves selected cards as structural beats.

## User workflow: customize template with AI

1. User chooses a base template.
2. User enters customization instruction.
3. UI shows what will be sent to AI.
4. AI returns a v2 template and change summary.
5. UI displays original-vs-customized slot list.
6. User saves as custom template.
7. Custom template appears in the template selector.

## UI additions

Minimal additions to Story Beats panel:

- Button: **Generate Plot from Template**.
- Button: **Customize Template with AI**.
- Read-only details for selected template slots.
- Optional advanced editor for slot metadata.

New Plot Planning panel or modal:

- Template selector.
- Premise.
- Genre.
- Target length.
- Tone.
- Include compendium toggle.
- Include existing beats toggle.
- Generate button.
- Review cards.
- Save as beats button.

New Template Customization modal:

- Base template selector.
- Customization instruction.
- Generate button.
- Diff/review.
- Save custom template button.

## i18n requirements

Add English and Japanese strings for:

- Generate Plot from Template / テンプレートからプロット生成
- Customize Template with AI / AIでテンプレートをカスタマイズ
- Plot Plan / プロット案
- Save as Beats / ビートとして保存
- Template Slot / テンプレートスロット
- Premise / 前提
- Target Length / 目標文字数
- Tone / トーン
- Review Generated Plot / 生成されたプロットを確認
- Invalid AI Output / AI出力が無効です
- Retry Structured Output / 構造化出力を再試行

## Data export/import additions

When new tables are added, update `DataManagement.TABLES`:

- `plotPlans`
- `aiRuns`
- Optional: `userPreferences`
- Optional: `tuningEvents`

Project export should include project-related plot plans and AI runs. Decide whether all templates are included or only referenced templates. The current behavior includes all templates for project export; keep or document any change.

## Testing requirements

Add/update tests for:

- v1 string-slot template normalization.
- v2 template import/export.
- Full BS2 has 15 slots with stable IDs.
- `createBeatsFromTemplate()` works for both string and object slots.
- Existing custom templates survive migration.
- Plot plan schema accepts valid output.
- Invalid plot plan output is rejected.
- Saving plot plan as beats creates rows with `templateSlotId` equal to stable slot IDs.
- Data export/import includes new tables.

## Done when

- Users can choose a full BS2 template.
- Existing templates still work.
- New v2 templates can be imported/exported.
- Plot plan structured output can be validated before save.
- AI-customized templates are saved as user templates.
- JSON backup includes all new records.
