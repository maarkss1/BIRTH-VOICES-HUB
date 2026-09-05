# Workflow Execution Contract (Studio ↔ Voice Runtime)

Formalizes, as permanent documentation, the contract negotiated between the Studio (Agent 07,
`store/useStudioStore.ts`, `lib/studio/**`) and the telephony/voice runtime (Agent 04/05,
`src/services/workflowRuntimeService.ts`, `src/services/telephonyService.ts`) during Onda 2.
Source: `.agents/handoffs/onda-2/07-para-04-contrato-execucao-workflow.md` (status: `resolvido`)
and `.agents/handoffs/onda-2/07-para-09-doc-contrato-workflow.md` (the request to formalize it
here). This document reflects the **resolution actually implemented** (PR #33,
`codex/production-ready-20260814`), not the original green-field proposal — where the two
differ, this file follows the code.

## 1. Where the runtime reads a workflow "ready to execute"

`workflowRepository.findActiveWorkflowForTenant(tenantId)` — **never**
`findWorkflowForTenant(tenantId)`, which returns the most recently edited workflow regardless of
validity.

- `status: 'active'` is set **only** by `workflowService.publishWorkflow()`, and only after both
  gates below pass.
- Any subsequent edit to `nodes`/`edges` (`saveWorkflow`/`updateWorkflow`) demotes `status` back
  to `'draft'` automatically. A runtime that only reads `active` workflows structurally cannot
  execute a graph that has not passed validation at the moment it was marked active — this is
  what closes `AGENTS.md` blocker #13 ("Studio permitindo publicar/ativar um workflow que não
  passou pelo ValidationEngine").
- `Workflow.nodes`/`Workflow.edges` are Prisma `Json` — parse defensively on the runtime side
  (treat anything that is not an array as `[]`; never let a corrupted `Json` value throw).

## 2. The publish gate is two checks, not one

`workflowService.publishWorkflow()` runs, in order:

1. **`ValidationEngine.validate()`** (structural): required fields per node type are present and
   non-empty (see the table in §3). This is the check the Studio UI also runs live in the
   Inspector.
2. **`validateRuntimeCompatibility()`** (capability gate, server-side only): does the telephony
   runtime actually know how to execute every node/edge semantic in this graph, today. A grap
   that is structurally valid can still fail this second check and receive **422** with
   `issues` describing why — see `POST /workflow/publish` in `docs/api/openapi.yaml`.

A node type appearing in the Studio's visual catalog is **not** evidence that the runtime
executes it — the server is the only source of truth for execution capability. This distinction
existed loosely in Onda 2 and is now a hard publish-time gate, not a runtime crash risk.

### What the runtime actually executes today

`start`, `llm`, `prompt`, `question`, `condition`, `switch`, `memory`, `end` — deterministic
execution, consumed by `src/services/telephonyService.ts` for real phone calls (Twilio). The
published version's snapshot is persisted on the phone session and stays stable for the whole
call; the LLM calls inside it always carry the session's real `tenantId` (consent, rate limiting,
cost accounting, and telemetry stay tenant-correct end to end).

### What is blocked at publish time (preview/draft only in the Studio)

`voice`, `knowledge`, `tool`, `human_handoff` — these remain selectable and configurable in the
Studio canvas (so editing isn't regressed), but `publishWorkflow()` rejects a graph that depends
on them with an explicit error. Non-deterministic fan-out, an unknown LLM provider, an invalid
validation regex, and a conditional branch without a resolvable handle also fail closed.

If support for one of these is added to the runtime, update this document and the "blocked at
publish" list above in the same change — do not let this file drift from
`validateRuntimeCompatibility()`'s actual behavior.

## 3. `StudioNode` shape (`lib/studio/types.ts`)

```ts
type NodeType =
  | 'start' | 'end' | 'prompt' | 'question' | 'condition' | 'switch'
  | 'memory' | 'knowledge' | 'tool' | 'human_handoff' | 'voice' | 'llm';

interface StudioNodeData {
  label: string;
  category: string;
  config?: Record<string, unknown>; // shape per type, see table below
  // lifecycleState/validation/metrics are UI-only (Studio) — the runtime ignores them.
}

// id: string; type: NodeType; position: {x, y}; data: StudioNodeData
type StudioNode = Node<StudioNodeData, NodeType>; // @xyflow/react Node generic
```

### `data.config` by node type (source: `store/useStudioStore.ts` → `nodeRegistry`)

| type | config fields relevant to execution |
|---|---|
| `start` | `channel`, `language`, `timezone`, `provider` (e.g. Twilio), `persona`, `model` |
| `voice`⚠ | `provider` (e.g. ElevenLabs), `voiceId`, `stability`, `clarity`, `speechRate` |
| `llm` | `provider`, `model`, `temperature`, `topP`, `maxTokens`, `safetySettings` |
| `prompt` | `promptText` (required, non-empty), `streaming`, `thinking`, `fallbackText` |
| `question` | `questionText` (required), `maxRetryCount`, `speechTimeoutMs`, `validationRegex`, `variableToSave`, `fallbackPrompt` |
| `condition` | `variable`, `operator`, `value`, `naturalLanguageCheck`, `matchConfidenceThreshold` |
| `switch` | `variableToCheck`, `path0`, `path1`, `path2`, … (`pathN` per handle `out-N`) |
| `knowledge`⚠ | `database` (required), `ragTopK`, `minScoreThreshold`, `searchStrategy`, `autoChunkSize` |
| `tool`⚠ | `method`, `endpoint` (required), `headers`, `bodyPayload`, `timeoutMs`, `retryLimit` |
| `memory` | `operation`, `variableName`, `variableValue`, `scope` |
| `human_handoff`⚠ | `department`, `fallbackNumber`, `ringTimeoutSec`, `recordCall`, `transferMessage` |
| `end` | `saveTranscript`, `exportToWebhook`, `postCallSurvey` |

⚠ = blocked at publish time today (§2). Fields marked "required" are exactly what
`ValidationEngine.ts` rejects as a structural error when missing/empty — a published (`active`)
workflow is guaranteed to have these keys present and non-empty; the runtime does not need to
re-validate presence for structural safety, only handle real execution failures (endpoint down,
provider unavailable) normally.

## 4. `StudioEdge` shape and conditional routing

```ts
interface StudioEdgeData {
  condition?: string;   // free text today (e.g. "Intent == Suporte"), not an executable DSL
  isFallback?: boolean; // true = fallback/else branch
  priority?: number;
  event?: string;
}
// edge: { id, source, target, sourceHandle?, targetHandle?, data }
```

- `condition` nodes have 2 outputs: `sourceHandle: 'out-0'` (success — the runtime evaluates
  `data.config.variable == data.config.value` via explicit handle routing, **not** by
  interpreting `StudioEdgeData.condition` as executable text) and `'out-1'` (fallback,
  `data.isFallback === true`).
- `switch` nodes have N outputs, `sourceHandle: 'out-<index>'`, each corresponding to
  `data.config['path' + index]`.
- `question` nodes have 2 outputs (`out-0` success / `out-1` retries exhausted).
- Every other node type has exactly one output (`nodeRegistry` documents cardinality per type).
- **`StudioEdgeData.condition` is free text typed in the Inspector — never `eval`'d.** Only the
  Studio's local simulator (`useStudioStore.startSimulation`) interprets a simplified subset of
  it for preview purposes. The real runtime routes `condition`/`switch` purely by explicit
  handles (`out-N`), never by evaluating the free-text string. A richer condition DSL would be a
  product decision requiring a `StudioEdgeData` schema change — see `AGENTS.md` §12 rule 4
  (interface contract before either side changes consumption) before building one.

## 5. Test coverage backing this contract

- `__tests__/workflowRuntimeService.test.ts` — active/draft selection, providers, prompt,
  question, condition, retries, fail-closed capability gate.
- `__tests__/workflowPublishGate.test.ts` — publish allowed only for a graph that is both
  structurally valid **and** executable.
- `__tests__/telephonyService.test.ts` — published-snapshot integration with real phone turns,
  tenant/consent propagation, conversation cursor.
- `__tests__/telephony.controller.test.ts` — an `end` node produces a final TwiML response +
  `Hangup`, never another `Gather`.

These live in `__tests__/**`, owned by Agent 08 — this document only describes what they already
assert; it does not duplicate their assertions as a second source of truth that could drift.
