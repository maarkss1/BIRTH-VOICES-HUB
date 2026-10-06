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

**Onda 6 update (rodada 1)**: §2/§3 updated again by Agent 04 for two changes specified in
`.agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md`: (1) a `tool` node reached
mid-call now pauses as `mode: 'tool_pending'` instead of degrading straight to the failure
fallback — see the `tool` subsection below and
`.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`; (2) `voice` is no longer blocked at
publish time — it is a Twilio-named-TTS MVP, see the new `voice` subsection below and
`.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`. Removing `voice` from the blocked
list broke the "any unsupported node type" example fixture in three tests owned by other agents
(`__tests__/workflowRuntimeService.test.ts`, `__tests__/workflowPublishGate.test.ts` — Agente 08;
`src/services/workflowVersioning.test.ts` — Agente 07, per that file's own header comment) — see
the corresponding `04-para-07-*`/`04-para-08-*` handoffs in this same onda for the one-line fixture
fix each needs (swap the example node from `voice` to `human_handoff`, which remained blocked at
the time).

**Onda 6 update (rodada 2)**: §2/§3 updated again for
`.agents/handoffs/onda-6/00-para-04-human-handoff-mvp.md`: `human_handoff` is no longer blocked at
publish time either — it dials the node's own literal `fallbackNumber` directly (no department ->
number lookup, no schema change), see the new `human_handoff` subsection below and
`.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md`. This means **no Studio node type
is unsupported by the runtime's capability gate any more** — the exact same fixture-churn problem
rodada 1 caused repeats: the three tests above had just been updated to use `human_handoff` as
their "any unsupported node type" example (`test(00): update voice-as-unsupported-example fixtures
ahead of Agente 04's Onda 6 merge`), and unblocking it broke them again. See the new
`04-para-07-*`/`04-para-08-*` handoffs for rodada 2, which suggest breaking this recurring pattern
by switching the example to a synthetically-unknown node type instead of a real domain node type
that keeps getting unblocked onda after onda.

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

`start`, `llm`, `prompt`, `question`, `condition`, `switch`, `memory`, `end`, `knowledge`, `tool`,
`voice`, `human_handoff` — every Studio node type — consumed by `src/services/telephonyService.ts`
for real phone calls (Twilio). The published version's snapshot is persisted on the phone session
and stays stable for the whole call; the LLM calls inside it always carry the session's real
`tenantId` (consent, rate limiting, cost accounting, and telemetry stay tenant-correct end to end).
`knowledge`/`tool` were added in Onda 5
(`.agents/handoffs/onda-5/00-para-04-motor-execucao-knowledge-tool.md`); `voice` and the `tool`
mid-call continuation were added in Onda 6 rodada 1
(`.agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md`); `human_handoff` was added in
Onda 6 rodada 2 (`.agents/handoffs/onda-6/00-para-04-human-handoff-mvp.md`) — see their own
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

**Onda 6 update — mid-call `tool` is executed for real via an explicit pause/resume, not the
synchronous path**: `prepareWorkflowTurn` (still synchronous, still called without `await` by
`telephonyService.ts`) never performs the HTTP call itself. When the deterministic walk reaches a
`tool` node outside the call-start segment, it now stops there and returns
`PreparedWorkflowTurn.mode === 'tool_pending'` (the same way it already stops on `prompt`/
`question`) instead of silently degrading to the failure fallback. The caller (Agente 05,
`telephonyService.ts`) is expected to `await workflowRuntimeService.resumeAfterTool(state, node)`
— which performs the real HTTP call (same consent gate, same `HttpToolExecutor` SSRF/timeout/retry
defense as call-start) and then continues walking the graph, returning the next real
`PreparedWorkflowTurn` (`llm`/`direct`, or another `tool_pending` if a second `tool` node follows
immediately). See `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md` for the exact
contract Agente 05 consumes; that handoff's `Status` field is the source of truth for whether
`telephonyService.ts` has actually been updated to call `resumeAfterTool` yet — until it has, a
`tool` node reached mid-call correctly pauses the turn but nothing yet resumes it from the
telephony side (a real product gap, not just a doc footnote, exactly like the Onda 5 gap it
replaces).

#### `voice` execution semantics (Onda 6 MVP: Twilio-named TTS, Option 1)

`voice` is a **passive** node: reaching it never itself constitutes an interaction (no `prompt`/
`question` behavior) — it only (re)resolves `PreparedWorkflowTurn.voiceOverride` for whatever
interaction comes next in the same call, then continues to its single outgoing edge like any other
deterministic node.

- Only `provider` and `voiceId` are honored, and only when they are **already** a real,
  documented Twilio-native voice identifier (Amazon Polly under `Polly.<Name>`, or Google under
  `Google.<name>` — see Twilio's own `<Say voice="...">` reference). This is Option 1 from
  `.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md`, chosen by the Coordinator in
  Onda 6 specifically because it needs no new dependency (`objectStorage.ts`, an audio cache, or
  extra synthesis latency) to unblock the node.
- `stability`, `clarity`, `speechRate` (ElevenLabs-specific synthesis controls, still shown in the
  Studio inspector for this node) have **no Twilio `<Say>` equivalent and are silently ignored** —
  this is a deliberate MVP limitation, not a validation error, and `publishWorkflow()` never
  rejects a graph for using them.
- The Studio's own default config for this node (`provider: 'ElevenLabs', voiceId:
  'Rachel_pt_BR'`) has **no known Twilio mapping** and, per AGENTS.md §14 ("never fabricate"),
  `voiceOverride` is simply omitted in that case — Twilio speaks with its own default voice
  instead of guessing "the closest" Twilio voice to an unrelated provider's voice id. A full
  ElevenLabs voice (Option 2 — real synthesis via `<Play>`) remains a future product decision, not
  implemented here.
- `voiceOverride` is consumed by Agente 05 in `telephony.controller.ts`
  (`twiml.say({ voice, language }, texto)`) — see
  `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md` for the exact contract; that
  handoff's `Status` field says whether the Twilio side has picked it up yet.

#### `human_handoff` execution semantics (Onda 6 rodada 2 MVP: direct dial to a literal number)

`.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md` originally blocked this node on
a missing product decision: "department -> real phone number" routing would have required a new
lookup table/schema change. The Coordinator found a narrower path that needs neither
(`.agents/handoffs/onda-6/00-para-04-human-handoff-mvp.md`): the Studio node's own
`defaultConfig.fallbackNumber` (`store/useStudioStore.ts` → `nodeRegistry.human_handoff`) is
already a **literal phone number** (e.g. `'+5511999999999'`), not a lookup key — the runtime just
needed to read it and hand it to the telephony layer.

- `human_handoff` is a **terminal-of-turn** node, exactly like `prompt`/`question`/`tool`: the
  synchronous graph walk (`advanceUntilInteraction`) stops there and
  `PreparedWorkflowTurn.mode` becomes `'transfer'` with a populated `transferDetails`. Unlike
  `tool`, there is **no resume function** — the runtime has nothing left to execute once a real
  telephony bridge (Agente 05, `telephony.controller.ts`) takes over; this matches the node's own
  Studio registry cardinality (`outputs: 0` — it is not meant to route back into the graph).
- `TransferDetails` is resolved straight from the node's own config, never a department lookup:
  - `to` = `config.fallbackNumber` (string). **Required** — if it is missing/empty, the node is
    **never** a stopping point: the walk logs a warning, records
    `variables.handoff_ok = 'false'` / `variables.handoff_error = 'fallback_number_missing'` (plus
    a per-node-id copy, mirroring `applyToolFallback`'s naming), and continues past it on its
    default outgoing edge — exactly like a failed `tool` call. AGENTS.md §14 forbids fabricating a
    number, so there is no "closest" or "default" destination invented here.
  - `timeoutSec` = `config.ringTimeoutSec` (number), defaulting to `30` when missing/not a finite
    number.
  - `record` = truthy-parsed `config.recordCall` (the Studio persists it as the string `'true'`/
    `'false'`, not a JS boolean — same tolerant-truthy pattern already used for
    `naturalLanguageCheck`).
  - `message` = `config.transferMessage`, defaulting to `"Aguarde um momento enquanto encaminho sua
    ligação."` when missing/empty.
  - `department` = `config.department`, included in `TransferDetails` **only as a label** for
    Agente 05's own logging/observability. It is **never** resolved into a phone number — a real
    department -> PBX-line routing feature remains a separate, out-of-scope product decision, same
    as rodada 1 left it; this MVP dials `fallbackNumber` regardless of `department`'s value.
- A `human_handoff` reached in the initial graph segment (before the call's first
  `prompt`/`question`, i.e. inside `initializeWorkflowRuntime`) stops the walk there exactly the
  same way, but — same known limitation already documented for `voice`'s opening greeting —
  `initializeWorkflowRuntime` returns a bare `WorkflowRuntimeState`, not a `PreparedWorkflowTurn`,
  so nothing surfaces `mode: 'transfer'` for that very first turn yet. `currentNodeId` stays
  correctly parked on the node, so the next `prepareWorkflowTurn` call re-signals `'transfer'` via
  the same defensive re-check the `tool` node already relies on.
- No publish-time validation requires `fallbackNumber` to be present — a graph with a
  misconfigured `human_handoff` still publishes; the missing-destination case degrades honestly at
  runtime (never at publish) exactly as described above. This is a deliberate MVP choice, not an
  oversight: `ValidationEngine.ts`'s structural gate and `validateRuntimeCompatibility()`'s
  capability gate are only about "can the runtime attempt to execute this node type at all", not
  "is this particular instance perfectly configured" — the same latitude every other node type
  already gets (e.g. a `tool` node with an unreachable `endpoint` also publishes fine and fails at
  call time).
- `transferDetails` is consumed by Agente 05 in `telephony.controller.ts`
  (`<Say>` + `<Dial>`) — see
  `.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md` for the exact contract; that
  handoff's `Status` field says whether the Twilio side has picked it up yet.

### What is blocked at publish time (preview/draft only in the Studio)

No Studio node type is unsupported by the runtime's capability gate as of Onda 6 rodada 2 — every
type in `lib/studio/types.ts`'s `NodeType` union now has a real (if MVP-scoped, for `voice`/
`human_handoff`) execution path. `validateRuntimeCompatibility()` still fails a graph closed for
non-structural reasons: non-deterministic fan-out, an unknown LLM provider, an unsupported `tool`
HTTP method, an invalid `condition`/`question` validation regex, and a conditional branch without a
resolvable handle. `UNSUPPORTED_REASON` in `workflowRuntimeService.ts` is kept as an empty lookup
table (the extension point for the next node type that needs an unsupported-type rejection),
rather than removed, precisely so this section does not need reshaping again the next time a node
type is added to the Studio catalog ahead of the runtime supporting it.

If a future node type is added to the Studio catalog before the runtime can execute it, update this
document and the "blocked at publish" paragraph above in the same change — do not let this file
drift from `validateRuntimeCompatibility()`'s actual behavior.

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
| `voice`‡ | `provider`, `voiceId`, `language` (honored only alongside a recognized `voiceId`), `stability`†, `clarity`†, `speechRate`† |
| `llm` | `provider`, `model`, `temperature`, `topP`, `maxTokens`, `safetySettings` |
| `prompt` | `promptText` (required, non-empty), `streaming`, `thinking`, `fallbackText` |
| `question` | `questionText` (required), `maxRetryCount`, `speechTimeoutMs`, `validationRegex`, `variableToSave`, `fallbackPrompt` |
| `condition` | `variable`, `operator`, `value`, `naturalLanguageCheck`, `matchConfidenceThreshold` |
| `switch` | `variableToCheck`, `path0`, `path1`, `path2`, … (`pathN` per handle `out-N`) |
| `knowledge` | `database` (required), `ragTopK`†, `minScoreThreshold`, `searchStrategy`†, `autoChunkSize`† |
| `tool` | `method`, `endpoint` (required), `headers`, `bodyPayload`, `timeoutMs`, `retryLimit` |
| `memory` | `operation`, `variableName`, `variableValue`, `scope` |
| `human_handoff`§ | `department`§§, `fallbackNumber`, `ringTimeoutSec`, `recordCall`, `transferMessage` |
| `end` | `saveTranscript`, `exportToWebhook`, `postCallSurvey` |

† = accepted by the Studio config schema but **not honored** by the runtime's execution for that
node type — see §2's "`knowledge` execution semantics" (keyword-confidence lookup, not real
chunked/ranked retrieval) and "`voice` execution semantics" (ElevenLabs-specific synthesis controls
have no Twilio `<Say>` equivalent) for why. ‡ = executable since Onda 6 rodada 1, but only a
`voiceId` that is already a real, documented Twilio-native voice name resolves to a non-empty
`voiceOverride` — see §2's "`voice` execution semantics" for the never-fabricate rule this follows.
§ = executable since Onda 6 rodada 2, but **not required at publish time** — see §2's
"`human_handoff` execution semantics" for why a missing `fallbackNumber` degrades gracefully at
runtime (never invents a number) instead of failing the publish gate. §§ = `department` is a label
only, never resolved into a phone number/PBX line — see the same subsection. Fields marked
"required" (none for `human_handoff` — see § above) are exactly what `ValidationEngine.ts` rejects
as a structural error when missing/empty for the node types that do have one; a published
(`active`) workflow is guaranteed to have those keys present and non-empty where required; the
runtime does not need to re-validate presence for structural safety in those cases, only handle
real execution failures (endpoint down, provider unavailable, tool timeout, missing
`fallbackNumber`) normally.

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

`knowledge`/`tool` (added Onda 5) and `tool_pending`/`voice`/`human_handoff` (added Onda 6) are
additionally covered outside `__tests__/**` (Agent 04's own files, following the same
co-located-test precedent already used elsewhere in the repo — e.g.
`src/features/prospecting/routes/atlasgr.routes.test.ts`):

- `lib/voice-runtime/HttpToolExecutor.test.ts` — SSRF defense (blocked private/reserved hosts),
  unsupported-method rejection, timeout, retry-then-succeed, retry exhaustion, non-2xx handling,
  and that a hostile timeout/retryLimit configuration is clamped rather than trusted.
- `src/services/workflowRuntimeService.knowledgeTool.test.ts` — `validateRuntimeCompatibility` no
  longer blocking `knowledge`/`tool`/`voice`/`human_handoff` (no node type is unsupported today,
  and a `human_handoff` with no `fallbackNumber` still publishes); a confident `knowledge` match
  reaching the next LLM's `systemInstruction`; a low-confidence/no-match query never fabricating a
  result; cross-tenant isolation (an `agentId` not owned by the calling `tenantId` yields zero
  documents, never another tenant's); a `tool` node executing for real (and exposing
  `tool_ok`/`tool_result`) when reached during `initializeWorkflowRuntime`; a blocked URL degrading
  to the `tool_error` fallback without ever crashing call setup; a `tool` node reached mid-call (via
  the synchronous `prepareWorkflowTurn`) pausing as `tool_pending` (Onda 6) instead of faking a
  fallback; `resumeAfterTool` performing the real HTTP call for that paused node and continuing the
  graph (including a `start -> question -> tool -> prompt` workflow that actually calls the
  endpoint with a variable collected earlier in the same call); `resumeAfterTool` gated on the same
  consent check as call-start; a `voice` node resolving `voiceOverride` only for an already-valid
  Twilio/Polly voice name, never fabricating one for the Studio's ElevenLabs default; `voice`
  behaving as a passive node that never blocks its own outgoing edge; a `human_handoff` reached
  mid-call (`start -> question -> human_handoff -> end`) returning `mode: 'transfer'` with
  `transferDetails.to` equal to the configured `fallbackNumber`, plus honest defaults for
  `ringTimeoutSec`/`recordCall`/`transferMessage`/`department`; a `human_handoff` with a missing/
  empty `fallbackNumber` never producing `mode: 'transfer'` (it degrades like a failed `tool`,
  setting `handoff_ok`/`handoff_error` and continuing past the node instead); a `human_handoff`
  reached in the initial graph segment correctly parking `currentNodeId` there without fabricating
  a transfer, with the very next turn re-signaling `'transfer'`; and a `tool -> human_handoff` chain
  where `resumeAfterTool` itself surfaces `mode: 'transfer'` once the tool call completes.
- `src/controllers/knowledge.controller.test.ts` — the Onda 6 text-only knowledge upload endpoint:
  an infected upload (EICAR) rejected with 422 and never indexed; the antivirus scanner itself
  being unavailable rejected with 503 (fail closed) and never indexed; a clean, valid `.md` upload
  indexed with its decoded content; a binary disguised as `.txt` (invalid UTF-8) rejected with 422
  and never fabricated as extracted text; the virus scan running before the text-validity check,
  not merely in addition to it; and the usual 404/400 guards (unknown/foreign agent, missing
  fields).

**Known cross-agent test debt (rodada 2)**: three fixtures owned by other agents
(`__tests__/workflowRuntimeService.test.ts`, `__tests__/workflowPublishGate.test.ts` — Agente 08;
`src/services/workflowVersioning.test.ts` — Agente 07) used `human_handoff` as their "any node type
the runtime does not yet support" example — the very fixture the Coordinator had them swap to in
rodada 1 specifically because `voice` had just stopped being a valid example. Unblocking
`human_handoff` in rodada 2 broke the same 4 assertions again for the same underlying reason: **no
real Studio node type is unsupported any more**, so this class of fixture has no stable target left
to swap to. See `.agents/handoffs/onda-6/04-para-07-human-handoff-fixture-desatualizada.md` and
`04-para-08-human-handoff-fixtures-desatualizadas.md` for the exact failures and a suggested fix
that breaks the cycle (a synthetically-unknown node type instead of a real one).
