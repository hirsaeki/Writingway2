# Agent Documentation Index

This directory contains the implementation-ready documentation for the Writingway 2 AI / beat-template / plot-planning / Tauri modernization.

## Documents created for the coding agent

| File | Purpose | Use when |
| --- | --- | --- |
| `AGENTS.md` | Root-level rules and guardrails for coding agents. | Always read first. |
| `CODING_AGENT_HANDOFF.md` | Current handoff, objectives, phase order, and stale-doc warning. | Always read before coding. |
| `docs/agent/01-current-state-audit.md` | Audit of existing implementation, schemas, modules, tests, and gaps. | Before touching code. |
| `docs/agent/02-target-architecture.md` | Target architecture and service/adapter boundaries. | Before adding new modules. |
| `docs/agent/03-ai-gateway-spec.md` | AI Orchestrator, request contract, provider adapter interfaces, streaming events. | During AI refactor. |
| `docs/agent/04-beat-template-and-plot-spec.md` | Beat template v2, full BS2, plotPlans, aiRuns, AI customization, tuning data. | During template and plot work. |
| `docs/agent/05-tauri-desktop-plan.md` | Tauri wrapper and desktop hardening plan. | Only after template/AI contracts are stable. |
| `docs/agent/06-implementation-tasks.md` | Phase-by-phase implementation checklist with touched files and acceptance criteria. | Use as the main task board. |
| `docs/agent/07-testing-and-acceptance.md` | Automated and manual test plan. | Before marking any phase done. |
| `docs/agent/08-risk-register.md` | Risks, symptoms, mitigations, and stop conditions. | During planning and review. |
| `docs/agent/09-agent-prompts.md` | Copy/paste prompts for a coding agent by phase. | When delegating work to an agent. |

## Schema contracts

| File | Purpose |
| --- | --- |
| `docs/schemas/ai-request.schema.json` | Internal AI request contract. |
| `docs/schemas/ai-run.schema.json` | Stored AI run/audit record contract. |
| `docs/schemas/beat-template-v2.schema.json` | Version 2 beat-template import/export contract. |
| `docs/schemas/plot-plan.schema.json` | Structured plot generation output contract. |

## Existing documents to keep as history

| File | Current interpretation |
| --- | --- |
| `docs/archives/HANDOFF.md` | Historical handoff. It is stale for the current product-refactor status. |
| `PRODUCT_REFACTORING_PLAN.md` | Still useful product context. Many phases are now implemented. |
| `PRODUCT_REFACTORING_TASKS.md` | Historical checklist. Most listed phases appear checked off in the repository. |
| `REFACTORING.md` | Older broad modularization plan. Do not use it as a prerequisite for product work. |
| Backup docs | Keep. They are still useful for existing local/Gist backup behavior. |

## How to use this documentation

1. Read the root instructions.
2. Confirm the current code state against `01-current-state-audit.md`.
3. Implement one phase from `06-implementation-tasks.md`.
4. Use the schema files as contracts for validation and tests.
5. Update the relevant docs if implementation choices change.
6. Record test results and any skipped tests in the final handoff.

## Documentation maintenance rule

When implementation diverges from these docs, update the docs in the same commit as the code change. Do not leave the next agent to infer new architecture from source alone.
