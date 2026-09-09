# Workflow Execution Contract (Studio ↔ Voice Runtime)

Formalizes, as permanent documentation, the contract negotiated between the Studio (Agent 07,
`store/useStudioStore.ts`, `lib/studio/**`) and the telephony/voice runtime (Agent 04/05,
`src/services/workflowRuntimeService.ts`, `src/services/telephonyService.ts`) during Onda 2.
Source: `.agents/handoffs/onda-2/07-para-04-contrato-execucao-workflow.md` (status: `resolvido`)
and `.agents/handoffs/onda-2/07-para-09-doc-contrato-workflow.md` (the request to formalize it
here). This document reflects the **resolution actually implemented** (PR #33,
`codex/production-ready-20260814`), not the original green-field proposal — where the two
differ, this file follows the code.

**Onda 5 update**: §2/§3 below were updated directly by Agent 04 (technical author of the
`knowledge`/`tool` execution change, `.agents/handoffs/onda-5/00-para-04-motor-execucao-
knowledge-tool.md`) to keep this file from drifting from `validateRuntimeCompatibility()`'s actual
behavior, following the same "author edits the doc describing their own change" precedent already
used when this document was first created at Agent 07's request in Onda 2 (see source links
above). `docs/patterns/**` remains Agent 09's file ownership for everything else; ping 09 to
review/sync this page if anything here reads as inconsistent with the rest of `docs/patterns/**`.

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

`start`, `llm`, `prompt`, `question`, `condition`, `switch`, `memory`, `end`, `knowledge`, `tool` —
consumed by `src/services/telephonyService.ts` for real phone calls (Twilio). The published
version's snapshot is persisted on the phone session and stays stable for the whole call; the LLM
calls inside it always carry the session's real `tenantId` (consent, rate limiting, cost
accounting, and telemetry stay tenant-correct end to end). `knowledge`/`tool` were added in Onda 5
(`.agents/handoffs/onda-5/00-para-04-motor-execucao-knowledge-tool.md`) — see their own
subsections below for execution semantics and honest limitations.

#### `knowledge` execution semantics

`KnowledgeConfidenceEngine.evaluateKnowledge` is, by its own "RAG Simulator" comment, a
**keyword-confidence lookup, not a real vector/embeddings search** — this document must not (and
does not) claim otherwise (`AGENTS.md` §14). At runtime:

- The agent's `Agent.configuration.knowledge` documents (tenant-scoped via
  `agentRepository.getAgent(agentId, tenantId)`) are fetched **once**, when the call starts, and
  baked into the call's immutable state snapshot — never re-fetched mid-call, so a `knowledge`
  node reached later in the same call cannot resolve against a different tenant's documents.
- `node.data.config.database` (a free-text string) filters the document pool by exact
  (case-insensitive) match against a document's `name`; if it matches nothing, the pool is empty
  for that lookup (never silently falls back to the whole set of documents).
- The query is always the caller's most recent utterance (`variables.lastUserText`) — there is no
  config field to choose a different query source today.
- `ragTopK`, `searchStrategy`, `autoChunkSize` (Studio config fields) are accepted but **not
  honored** — the engine returns one best match, not a ranked top-K over chunked documents. Only
  `minScoreThreshold` is honored, as an extra (never looser) floor on top of the engine's own fixed
  0.6 threshold.
- A low-confidence/no-match result is never presented as fact: the result (or the engine's own
  "não encontrei" caveat) is written to `variables.knowledge_result` (plus a
  `knowledge_<nodeId>_result` per-node copy) for the next `prompt`/`question`/`condition` node to
  read via the existing `{{variable}}` template mechanism — it is not auto-injected into a prompt
  that does not reference it.
- **Known gap**: `initializeWorkflowRuntime`'s `agentId` parameter is optional and
  `telephonyService.ts` does not pass it yet in production
  (`.agents/handoffs/onda-5/04-para-05-pass-agentid-to-workflow-runtime.md`). Until that lands,
  `knowledge` runs honestly with zero documents (always "no confident match") rather than crashing
  or fabricating a result.

#### `tool` execution semantics

`node.data.config.method`/`endpoint`/`headers`/`bodyPayload`/`timeoutMs`/`retryLimit` drive a real
outbound HTTP call (`lib/voice-runtime/HttpToolExecutor.ts`). SSRF defense reuses
`isPrivateOrReservedHost` from `src/validators/index.ts` (the same check applied to `callbackUrl`
there and, as defense-in-depth, to webhook delivery in `webhook.worker.ts`) — HTTPS required in
production, and a literal loopback/private/link-local/cloud-metadata host is refused before any
network call. Timeout and retry count are both clamped server-side (not trusted verbatim from the
Studio config) so a single tool call cannot stall a live turn indefinitely. A failure (blocked URL,
unsupported method, timeout, non-2xx, network error) never throws: it resolves to
`variables.tool_ok = 'false'` / `variables.tool_error = '<reason>'` so a downstream `condition`
node (or a default fallback message) can branch on it — the call is never dropped because a tool
call failed.

**Known gap**: real HTTP execution only happens for a `tool` node reached during
`initializeWorkflowRuntime`'s traversal — i.e. the deterministic segment between `start` and the
call's first `prompt`/`question`. A `tool` node reached later, mid-conversation (via
`prepareWorkflowTurn`, called synchronously and without `await` by `telephonyService.ts`), cannot
perform a real network call without either breaking that synchronous call site or blocking the
event loop for every other concurrent call — so it degrades directly to the same
`tool_ok='false'` fallback a live failure would take, without ever calling the configured
endpoint. See `.agents/handoffs/onda-5/04-para-05-tool-node-async-continuation.md` for the
proposed follow-up (this is a real product limitation today, not just a doc footnote — a
`start -> question -> tool -> prompt` workflow will not actually call the endpoint yet).

### What is blocked at publish time (preview/draft only in the Studio)

`voice`, `human_handoff` — these remain selectable and configurable in the Studio canvas (so
editing isn't regressed), but `publishWorkflow()` rejects a graph that depends on them with an
explicit error. Non-deterministic fan-out, an unknown LLM provider, an invalid validation regex,
and a conditional branch without a resolvable handle also fail closed. Both require a change to
`src/services/telephonyService.ts` (TwiML generation, Agente 05 exclusive) that is out of scope
for the agent that unblocked `knowledge`/`tool` — see
`.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md` for a design proposal.

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
| `knowledge` | `database` (required), `ragTopK`†, `minScoreThreshold`, `searchStrategy`†, `autoChunkSize`† |
| `tool` | `method`, `endpoint` (required), `headers`, `bodyPayload`, `timeoutMs`, `retryLimit` |
| `memory` | `operation`, `variableName`, `variableValue`, `scope` |
| `human_handoff`⚠ | `department`, `fallbackNumber`, `ringTimeoutSec`, `recordCall`, `transferMessage` |
| `end` | `saveTranscript`, `exportToWebhook`, `postCallSurvey` |

⚠ = blocked at publish time today (§2). † = accepted by the Studio config schema but **not
honored** by the runtime's `knowledge` execution — see §2's "`knowledge` execution semantics" for
why (keyword-confidence lookup, not real chunked/ranked retrieval). Fields marked "required" are
exactly what `ValidationEngine.ts` rejects as a structural error when missing/empty — a published
(`active`) workflow is guaranteed to have these keys present and non-empty; the runtime does not
need to re-validate presence for structural safety, only handle real execution failures (endpoint
down, provider unavailable, tool timeout) normally.

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

`knowledge`/`tool` (added Onda 5) are additionally covered outside `__tests__/**` (Agent 04's own
files, following the same co-located-test precedent already used elsewhere in the repo — e.g.
`src/features/prospecting/routes/atlasgr.routes.test.ts`):

- `lib/voice-runtime/HttpToolExecutor.test.ts` — SSRF defense (blocked private/reserved hosts),
  unsupported-method rejection, timeout, retry-then-succeed, retry exhaustion, non-2xx handling,
  and that a hostile timeout/retryLimit configuration is clamped rather than trusted.
- `src/services/workflowRuntimeService.knowledgeTool.test.ts` — `validateRuntimeCompatibility` no
  longer blocking `knowledge`/`tool` (while still blocking `voice`/`human_handoff`); a confident
  `knowledge` match reaching the next LLM's `systemInstruction`; a low-confidence/no-match query
  never fabricating a result; cross-tenant isolation (an `agentId` not owned by the calling
  `tenantId` yields zero documents, never another tenant's); a `tool` node executing for real (and
  exposing `tool_ok`/`tool_result`) when reached during `initializeWorkflowRuntime`; a blocked URL
  degrading to the `tool_error` fallback without ever crashing call setup; and a `tool` node
  reached mid-call (via the synchronous `prepareWorkflowTurn`) degrading to the same fallback
  without performing a real network call.
