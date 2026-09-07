import type { Prisma } from '@prisma/client';
import type { StudioEdge, StudioNode, ValidationIssue } from '../../lib/studio/types.js';
import * as workflowRepository from '../repositories/workflowRepository.js';
import * as agentRepository from '../repositories/agentRepository.js';
import { logger } from '../lib/logger.js';
import {
  knowledgeConfidenceEngine,
  type KnowledgeDocument,
} from '../../lib/voice-runtime/intelligence/KnowledgeConfidenceEngine.js';
import { executeHttpTool } from '../../lib/voice-runtime/HttpToolExecutor.js';
import type { AgentConfiguration } from '../types/agent.js';
import { getAiConsent } from './settingService.js';

export type RuntimeProvider = 'GoogleGemini' | 'OpenAI' | 'Claude';
export type RuntimeNodeType =
  | 'start'
  | 'llm'
  | 'prompt'
  | 'question'
  | 'condition'
  | 'switch'
  | 'memory'
  | 'end'
  | 'knowledge'
  | 'tool'
  | 'voice';

type RuntimeConfig = Record<string, Prisma.JsonValue>;

interface RuntimeNode extends Record<string, Prisma.JsonValue> {
  id: string;
  type: RuntimeNodeType;
  config: RuntimeConfig;
}

// Public alias for `RuntimeNode`, exported so a caller resuming an interrupted turn (Agente 05,
// see `resumeAfterTool` below and `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`)
// has a named type to reference without importing the internal `RuntimeNode` name. Structurally
// identical — `state.nodes` (already public on `WorkflowRuntimeState`) is exactly `WorkflowNode[]`.
export type WorkflowNode = RuntimeNode;

interface RuntimeEdge extends Record<string, Prisma.JsonValue> {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  isFallback: boolean;
  priority: number;
}

/**
 * This snapshot is persisted inside Session.metadata, so its public type deliberately satisfies
 * Prisma.JsonObject. Keeping the runtime state JSON-safe prevents test-only casts from hiding a
 * production persistence mismatch and makes the session snapshot portable across workers.
 *
 * Deliberately NOT extended with new top-level fields for tenantId/agentId/knowledgeDocuments
 * (added in Onda 5 for `knowledge` node support) — every field here must be a required, always
 * JSON-safe (non-`undefined`) value, because `extends Record<string, Prisma.JsonValue>` and an
 * optional property (`foo?: T`, whose type TypeScript always widens to `T | undefined`) cannot
 * coexist on one interface. A genuinely new REQUIRED field is equally unworkable here: both
 * `__tests__/telephonyService.test.ts` and `__tests__/workflowRuntimeService.test.ts` (Agente 08,
 * out of scope for this agent) build `WorkflowRuntimeState`/`Session.metadata` fixtures that
 * predate Onda 5 and do not set it, and TypeScript's spread-of-`Partial<T>` inference makes a
 * required-but-fixture-omitted field surface as `T | undefined` there too. So call-scoped,
 * JSON-safe-but-not-structurally-required data added after the original 9 fields below lives
 * inside the existing required `variables` map instead, under the reserved `__runtime*` keys —
 * see `getRuntimeTenantId`/`getRuntimeAgentId`/`getRuntimeKnowledgeDocuments` further down.
 */
export interface WorkflowRuntimeState extends Record<string, Prisma.JsonValue> {
  workflowId: string;
  version: number;
  currentNodeId: string | null;
  variables: Record<string, string>;
  preferredProvider: RuntimeProvider;
  retries: Record<string, number>;
  ended: boolean;
  nodes: RuntimeNode[];
  edges: RuntimeEdge[];
}

// Reserved `variables` keys carrying call-scoped runtime context (see the `WorkflowRuntimeState`
// doc comment above for why these live inside `variables` instead of as top-level fields). Not
// namespaced against a user typing the literal string in a Studio prompt/condition — an
// astronomically unlikely collision, and even then the leaked value (a tenant id) is not a
// secret — but kept clearly distinguishable from ordinary session variables regardless.
const RUNTIME_TENANT_ID_VAR = '__runtimeTenantId';
const RUNTIME_AGENT_ID_VAR = '__runtimeAgentId';
const RUNTIME_KNOWLEDGE_DOCS_VAR = '__runtimeKnowledgeDocumentsJson';
// Holds the last successfully resolved `voice` node override as it is carried forward across
// turns inside the same JSON-safe `variables` map (see the `WorkflowRuntimeState` doc comment
// above) — same reserved-key pattern as tenant/agent id and knowledge documents.
const RUNTIME_VOICE_OVERRIDE_VAR = '__runtimeVoiceOverrideJson';

function getRuntimeTenantId(state: WorkflowRuntimeState): string {
  return state.variables[RUNTIME_TENANT_ID_VAR] ?? '';
}

function getRuntimeAgentId(state: WorkflowRuntimeState): string | null {
  return state.variables[RUNTIME_AGENT_ID_VAR] || null;
}

function getRuntimeKnowledgeDocuments(state: WorkflowRuntimeState): KnowledgeDocument[] {
  const raw = state.variables[RUNTIME_KNOWLEDGE_DOCS_VAR];
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as KnowledgeDocument[]) : [];
  } catch {
    // A corrupted/hand-edited session snapshot must degrade to "no documents", never throw
    // mid-call — same fail-safe posture as `toStudioGraph` treating a malformed nodes/edges Json
    // column as `[]` in `initializeWorkflowRuntime`.
    return [];
  }
}

function getRuntimeVoiceOverride(state: WorkflowRuntimeState): VoiceOverride | undefined {
  const raw = state.variables[RUNTIME_VOICE_OVERRIDE_VAR];
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && typeof (parsed as Record<string, unknown>).voice === 'string'
      && (parsed as Record<string, unknown>).voice
    ) {
      const language = (parsed as Record<string, unknown>).language;
      return {
        voice: (parsed as { voice: string }).voice,
        ...(typeof language === 'string' && language ? { language } : {}),
      };
    }
    return undefined;
  } catch {
    // Same fail-safe posture as `getRuntimeKnowledgeDocuments`: a corrupted snapshot degrades to
    // "no override" (Twilio's default voice), never a thrown error mid-call.
    return undefined;
  }
}

/**
 * Twilio's own named TTS voice, resolved from the nearest `voice` node the call has passed
 * through (Onda 6 MVP — see the `resolveVoiceOverride` doc comment below for exactly what is and
 * is not honored). Absent whenever no `voice` node has been reached yet, or the configured
 * `provider`/`voiceId` has no known Twilio-native mapping.
 */
export interface VoiceOverride {
  voice: string;
  language?: string;
}

export interface PreparedWorkflowTurn {
  state: WorkflowRuntimeState;
  mode: 'llm' | 'direct' | 'tool_pending';
  systemInstruction?: string;
  preferredProvider?: RuntimeProvider;
  directReply?: string;
  nextQuestion?: string;
  shouldEnd: boolean;
  voiceOverride?: VoiceOverride;
}

const SUPPORTED_TYPES = new Set<RuntimeNodeType>([
  'start',
  'llm',
  'prompt',
  'question',
  'condition',
  'switch',
  'memory',
  'end',
  'knowledge',
  'tool',
  'voice',
]);

// 'knowledge' and 'tool' were unsupported through Onda 4 (see git history for the removed
// UNSUPPORTED_REASON entries) — as of Onda 5 they are executed for real
// (`applyKnowledgeNode`/`executeToolNodeAsync` below). 'voice' became executable in Onda 6 as a
// Twilio-named-TTS MVP (see `resolveVoiceOverride` below and
// `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`) — it is a passive node that only
// sets `PreparedWorkflowTurn.voiceOverride` and continues to the next node, never an interaction
// by itself. See docs/patterns/workflow-execution-contract.md §2/§3 for the up-to-date executable
// list. 'human_handoff' remains blocked: it requires a telephony transfer bridge in
// `telephonyService.ts` (Agente 05, exclusive owner) that is out of scope here — see
// .agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md.
const UNSUPPORTED_REASON: Partial<Record<string, string>> = {
  human_handoff: 'A transferência humana ainda não possui bridge de telefonia validada para produção.',
};

const SUPPORTED_TOOL_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function asRecord(value: unknown): RuntimeConfig {
  // Workflow config is persisted in a Prisma Json column before it reaches the runtime. This cast
  // narrows that already-validated JSON boundary; the runtime never accepts arbitrary JS objects
  // directly from request bodies here.
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RuntimeConfig
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isTruthy(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toStudioGraph(nodes: unknown, edges: unknown): { nodes: StudioNode[]; edges: StudioEdge[] } {
  return {
    nodes: Array.isArray(nodes) ? nodes as StudioNode[] : [],
    edges: Array.isArray(edges) ? edges as StudioEdge[] : [],
  };
}

function outgoingFor(edges: StudioEdge[], nodeId: string): StudioEdge[] {
  return edges.filter((edge) => edge.source === nodeId);
}

function branchHandles(edges: StudioEdge[], nodeId: string): Set<string> {
  return new Set(
    outgoingFor(edges, nodeId)
      .map((edge) => edge.sourceHandle)
      .filter((handle): handle is string => typeof handle === 'string' && handle.length > 0),
  );
}

// Twilio's <Say> verb synthesizes speech only from Twilio's own voice catalog — Amazon Polly
// voices under a `Polly.<Name>` identifier, or Google voices under `Google.<name>`
// (https://www.twilio.com/docs/voice/twiml/say#voice). It has no concept of an ElevenLabs voice
// id at all, so a Studio `voice` node's default config (`provider: 'ElevenLabs', voiceId:
// 'Rachel_pt_BR'`) has no honest translation into a Twilio voice name — Option 2 (real
// ElevenLabs synthesis via <Play>) would be needed for that, and is explicitly out of scope for
// this MVP (see .agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md). This table only
// recognizes voice identifiers that ARE ALREADY real, documented Twilio voice names — it never
// guesses "the closest Twilio voice" for an unrelated provider's voice id (AGENTS.md §14: never
// fabricate). Keys are matched case-insensitively, both with and without the `Polly.`/`Google.`
// prefix, against whatever a tenant typed into the Studio inspector's `voiceId` field.
const KNOWN_TWILIO_VOICE_NAMES: Record<string, string> = {
  'polly.camila': 'Polly.Camila',
  'camila': 'Polly.Camila',
  'polly.camila-neural': 'Polly.Camila-Neural',
  'camila-neural': 'Polly.Camila-Neural',
  'polly.vitoria': 'Polly.Vitoria',
  'vitoria': 'Polly.Vitoria',
  'polly.vitória': 'Polly.Vitoria',
  'vitória': 'Polly.Vitoria',
  'polly.ricardo': 'Polly.Ricardo',
  'ricardo': 'Polly.Ricardo',
  'google.pt-br-standard-a': 'Google.pt-BR-Standard-A',
  'pt-br-standard-a': 'Google.pt-BR-Standard-A',
};

// Only a `provider` naming Twilio's own TTS engines is even eligible for the lookup above — this
// is a second, independent guard (not a substitute for the allowlist itself) against an
// accidental short-name collision with an unrelated provider's voice id.
const TWILIO_NATIVE_VOICE_PROVIDERS = new Set(['twilio', 'amazonpolly', 'amazon', 'polly', 'google', 'googletts', 'googlecloudtts']);

/**
 * Resolves a Studio `voice` node's `provider`/`voiceId` into the Twilio-native voice name
 * `PreparedWorkflowTurn.voiceOverride` carries. Only `voiceId` (an already-valid Twilio/Polly/
 * Google voice identifier) and, if present, `language` are honored — `stability`/`clarity`/
 * `speechRate` (ElevenLabs-specific synthesis controls) have no Twilio <Say> equivalent and are
 * silently ignored, never rejected as a validation error (see
 * docs/patterns/workflow-execution-contract.md §3). Returns `undefined` whenever there is no known
 * mapping — the caller must never fall back to guessing a voice name.
 */
function resolveVoiceOverride(config: RuntimeConfig): VoiceOverride | undefined {
  const provider = asString(config.provider).toLowerCase().replace(/[\s_-]+/g, '');
  const voiceId = asString(config.voiceId);
  if (!voiceId || !TWILIO_NATIVE_VOICE_PROVIDERS.has(provider)) return undefined;

  const mapped = KNOWN_TWILIO_VOICE_NAMES[voiceId.toLowerCase()];
  if (!mapped) return undefined;

  const language = asString(config.language);
  return { voice: mapped, ...(language ? { language } : {}) };
}

export function mapRuntimeProvider(value: unknown): RuntimeProvider | null {
  const normalized = asString(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'gemini' || normalized === 'googlegemini') return 'GoogleGemini';
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'claude' || normalized === 'anthropic') return 'Claude';
  return null;
}

/**
 * Server-side capability gate for the runtime, complementary to ValidationEngine's graph-shape
 * validation. A workflow may be visually valid yet still contain a node that the production
 * telephony executor cannot honestly execute. Those graphs fail closed at publish time instead
 * of being marked active and silently ignored during a real call.
 */
export function validateRuntimeCompatibility(nodes: StudioNode[], edges: StudioEdge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of nodes) {
    const type = node.type;
    if (!type || !SUPPORTED_TYPES.has(type as RuntimeNodeType)) {
      const reason = type ? UNSUPPORTED_REASON[type] : 'O nó não possui um tipo executável.';
      issues.push({
        id: `err-runtime-unsupported-${node.id}`,
        nodeId: node.id,
        type: 'error',
        message: `Este nó ainda não pode ser publicado no runtime de telefonia. ${reason ?? 'Executor de produção indisponível.'}`,
      });
      continue;
    }

    const outgoing = outgoingFor(edges, node.id);
    if (!['condition', 'switch', 'question'].includes(type) && type !== 'end' && outgoing.length > 1) {
      issues.push({
        id: `err-runtime-fanout-${node.id}`,
        nodeId: node.id,
        type: 'error',
        message: 'O runtime exige uma única saída para nós não condicionais; fan-out paralelo ainda não é executado de forma determinística.',
      });
    }

    const config = asRecord(node.data.config);

    if (type === 'llm' && !mapRuntimeProvider(config.provider)) {
      issues.push({
        id: `err-runtime-provider-${node.id}`,
        nodeId: node.id,
        type: 'error',
        message: 'Provedor LLM não suportado pelo runtime. Use Gemini, OpenAI ou Claude.',
      });
    }

    if (type === 'tool') {
      const method = asString(config.method).toUpperCase() || 'GET';
      if (!SUPPORTED_TOOL_METHODS.has(method)) {
        issues.push({
          id: `err-runtime-tool-method-${node.id}`,
          nodeId: node.id,
          type: 'error',
          message: `Método HTTP '${method}' não é suportado pelo executor de Tool. Use GET, POST, PUT, PATCH ou DELETE.`,
        });
      }
    }

    if (type === 'condition') {
      if (isTruthy(config.naturalLanguageCheck)) {
        issues.push({
          id: `err-runtime-nl-condition-${node.id}`,
          nodeId: node.id,
          type: 'error',
          message: 'Condição em linguagem natural ainda não é executável. Use uma variável de sessão e operador determinístico.',
        });
      }

      const operator = asString(config.operator).toLowerCase() || 'equals';
      if (!['equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists', 'regex'].includes(operator)) {
        issues.push({
          id: `err-runtime-condition-operator-${node.id}`,
          nodeId: node.id,
          type: 'error',
          message: `Operador de condição '${operator}' não é suportado pelo runtime.`,
        });
      }

      const handles = branchHandles(edges, node.id);
      if (!handles.has('out-0') || !handles.has('out-1')) {
        issues.push({
          id: `err-runtime-condition-edges-${node.id}`,
          nodeId: node.id,
          type: 'error',
          message: 'Condition precisa conectar out-0 (verdadeiro) e out-1 (falso/fallback).',
        });
      }
    }

    if (type === 'question') {
      const handles = branchHandles(edges, node.id);
      if (!handles.has('out-0') || !handles.has('out-1')) {
        issues.push({
          id: `err-runtime-question-edges-${node.id}`,
          nodeId: node.id,
          type: 'error',
          message: 'Question precisa conectar out-0 (resposta válida) e out-1 (tentativas esgotadas).',
        });
      }

      const validationRegex = asString(config.validationRegex);
      if (validationRegex) {
        try {
          new RegExp(validationRegex, 'i');
        } catch {
          issues.push({
            id: `err-runtime-question-regex-${node.id}`,
            nodeId: node.id,
            type: 'error',
            message: 'A expressão regular configurada na Question é inválida.',
          });
        }
      }
    }

    if (type === 'switch') {
      const outgoingSwitch = outgoingFor(edges, node.id);
      const invalidHandle = outgoingSwitch.find(
        (edge) => !edge.data?.isFallback && !(typeof edge.sourceHandle === 'string' && /^out-\d+$/.test(edge.sourceHandle)),
      );
      if (invalidHandle) {
        issues.push({
          id: `err-runtime-switch-edge-${invalidHandle.id}`,
          nodeId: node.id,
          edgeId: invalidHandle.id,
          type: 'error',
          message: 'Cada saída do Switch precisa usar um sourceHandle out-N ou ser marcada explicitamente como fallback.',
        });
      }
    }
  }

  return issues;
}

function compileNodes(nodes: StudioNode[]): RuntimeNode[] {
  return nodes
    .filter((node): node is StudioNode & { type: RuntimeNodeType } => Boolean(node.type && SUPPORTED_TYPES.has(node.type as RuntimeNodeType)))
    .map((node) => ({ id: node.id, type: node.type, config: asRecord(node.data.config) }));
}

function compileEdges(edges: StudioEdge[]): RuntimeEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: typeof edge.sourceHandle === 'string' ? edge.sourceHandle : null,
    isFallback: edge.data?.isFallback === true,
    priority: typeof edge.data?.priority === 'number' ? edge.data.priority : 0,
  }));
}

function nodeById(state: WorkflowRuntimeState, nodeId: string | null): RuntimeNode | null {
  if (!nodeId) return null;
  return state.nodes.find((node) => node.id === nodeId) ?? null;
}

function orderedOutgoing(state: WorkflowRuntimeState, nodeId: string): RuntimeEdge[] {
  return state.edges
    .filter((edge) => edge.source === nodeId)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function selectHandle(state: WorkflowRuntimeState, nodeId: string, handle: string): RuntimeEdge | null {
  const outgoing = orderedOutgoing(state, nodeId);
  return outgoing.find((edge) => edge.sourceHandle === handle)
    ?? outgoing.find((edge) => edge.isFallback)
    ?? null;
}

function selectDefaultEdge(state: WorkflowRuntimeState, nodeId: string): RuntimeEdge | null {
  return orderedOutgoing(state, nodeId)[0] ?? null;
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? '');
}

function normalizeComparable(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function evaluateCondition(config: RuntimeConfig, variables: Record<string, string>): boolean {
  const variable = asString(config.variable);
  const operator = asString(config.operator).toLowerCase() || 'equals';
  const actual = variables[variable] ?? '';
  const expected = renderTemplate(asString(config.value), variables);
  const a = normalizeComparable(actual);
  const b = normalizeComparable(expected);

  switch (operator) {
    case 'equals': return a === b;
    case 'not_equals': return a !== b;
    case 'contains': return a.includes(b);
    case 'not_contains': return !a.includes(b);
    case 'exists': return actual.trim().length > 0;
    case 'not_exists': return actual.trim().length === 0;
    case 'regex': {
      try {
        return new RegExp(expected, 'i').test(actual);
      } catch {
        return false;
      }
    }
    default: return false;
  }
}

function applyMemoryNode(config: RuntimeConfig, variables: Record<string, string>): void {
  const operation = asString(config.operation).toLowerCase();
  const variableName = asString(config.variableName);

  if (operation === 'reset' || operation === 'reset session') {
    for (const key of Object.keys(variables)) delete variables[key];
    return;
  }

  if (!variableName) return;

  if (operation === 'delete variable' || operation === 'remove variable' || operation === 'delete') {
    delete variables[variableName];
    return;
  }

  variables[variableName] = renderTemplate(asString(config.variableValue), variables);
}

function routeSwitch(state: WorkflowRuntimeState, node: RuntimeNode): RuntimeEdge | null {
  const variableName = asString(node.config.variableToCheck);
  const actual = normalizeComparable(state.variables[variableName] ?? '');
  const paths = Object.entries(node.config)
    .map(([key, value]) => {
      const match = /^path(\d+)$/.exec(key);
      return match ? { index: Number(match[1]), value: asString(value) } : null;
    })
    .filter((entry): entry is { index: number; value: string } => entry !== null)
    .sort((a, b) => a.index - b.index);

  const matched = paths.find((entry) => normalizeComparable(entry.value) === actual);
  if (matched) return selectHandle(state, node.id, `out-${matched.index}`);

  return orderedOutgoing(state, node.id).find((edge) => edge.isFallback) ?? null;
}

/**
 * `evaluateKnowledge` is a keyword-confidence lookup over whatever documents were baked into the
 * state snapshot at call start, NOT a real vector/embeddings search — see
 * `KnowledgeConfidenceEngine.ts`'s own "RAG Simulator" comment and
 * `docs/patterns/workflow-execution-contract.md` §2. This function must never present a
 * low-confidence/no-match result as a fact (AGENTS.md §14) and must never invent a result for a
 * `database` name that matches no configured document.
 *
 * The query is always the caller's most recent utterance (`variables.lastUserText`) — the Studio
 * config table for `knowledge` (`ragTopK`, `minScoreThreshold`, `searchStrategy`,
 * `autoChunkSize`) has no field to pick a different query source today. `ragTopK`/
 * `searchStrategy`/`autoChunkSize` are accepted by the Studio schema but are NOT honored here:
 * the engine returns a single best match, not a ranked top-K over chunked documents. Only
 * `minScoreThreshold` is honored, as an additional (never looser) floor on top of the engine's
 * own fixed threshold.
 */
function applyKnowledgeNode(state: WorkflowRuntimeState, node: RuntimeNode): void {
  const query = state.variables.lastUserText ?? '';
  const requestedDatabase = asString(node.config.database);
  const documents = getRuntimeKnowledgeDocuments(state);
  const pool = requestedDatabase
    ? documents.filter((doc) => normalizeComparable(doc.name) === normalizeComparable(requestedDatabase))
    : documents;

  const result = knowledgeConfidenceEngine.evaluateKnowledge(query, pool);
  const minScoreThreshold = asNumber(node.config.minScoreThreshold, 0);
  const isLowConfidence = result.isLowConfidence || result.confidence < minScoreThreshold;

  // Fixed variable names (no `variableToSave` field exists for `knowledge` in the Studio config
  // table) — a downstream `prompt`/`question`/`condition` node reads these via the existing
  // `{{variable}}` template mechanism (see renderTemplate). Both a generic "most recent lookup"
  // set and a per-node-id set are written so multiple knowledge nodes in one graph don't clobber
  // each other's result.
  state.variables.knowledge_result = result.snippetUsed;
  state.variables.knowledge_document = result.document;
  state.variables.knowledge_confidence = String(result.confidence);
  state.variables.knowledge_is_low_confidence = String(isLowConfidence);
  state.variables[`knowledge_${node.id}_result`] = result.snippetUsed;
  state.variables[`knowledge_${node.id}_is_low_confidence`] = String(isLowConfidence);
}

// The Studio's `tool` node registry persists `headers` as a JSON-encoded string in
// `data.config.headers` (see `store/useStudioStore.ts`'s `tool` node `defaultConfig`, e.g.
// `'{"Authorization": "Bearer token_secret"}'`) — every workflow published through the Inspector
// carries it that way, never as a live object. Parsing it here (instead of requiring an object) is
// what actually makes a configured header like `Authorization` reach the request; accepting an
// object too keeps this tolerant of a future Studio change without another silent breakage.
function toToolHeaders(value: unknown, variables: Record<string, string>): Record<string, string> {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof raw === 'string') headers[key] = renderTemplate(raw, variables);
  }
  return headers;
}

/**
 * `tool` failure fallback — applied whenever a real HTTP attempt (`executeToolNodeAsync`) did not
 * end in `result.ok`, regardless of which entry point drove it (call-start's
 * `advanceUntilInteractionAsync`, or a mid-call `resumeAfterTool`). Never a fabricated success,
 * never an unhandled exception up into `telephonyService.ts`.
 *
 * Onda 6 history: through Onda 5, a `tool` node reached mid-conversation (via the synchronous
 * `prepareWorkflowTurn`) could not perform a real network call at all — the synchronous path had
 * no way to `await` one — so it degraded straight to this fallback without ever calling the
 * configured endpoint. As of Onda 6, `advanceUntilInteraction` (sync) instead stops the graph at a
 * `tool` node (`mode: 'tool_pending'`, see `PreparedWorkflowTurn`) and the real call happens in
 * `resumeAfterTool` below — this function is now reached only on a genuine failure (timeout,
 * blocked URL, non-2xx, consent not granted), never merely because the call was reached
 * mid-conversation. See `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`.
 */
function applyToolFallback(state: WorkflowRuntimeState, node: RuntimeNode, reason: string): void {
  state.variables.tool_ok = 'false';
  state.variables.tool_status = reason;
  state.variables.tool_error = reason;
  delete state.variables.tool_result;
  state.variables[`tool_${node.id}_ok`] = 'false';
  state.variables[`tool_${node.id}_error`] = reason;
}

/**
 * Real execution path for a `tool` node — called from `advanceUntilInteractionAsync` (before the
 * call's first `prompt`/`question`) and, as of Onda 6, from `resumeAfterTool` (a `tool` node
 * reached later, mid-conversation). SSRF/timeout/retry defense lives in `executeHttpTool`
 * (`lib/voice-runtime/HttpToolExecutor.ts`), reusing `isPrivateOrReservedHost` from
 * `src/validators/index.ts` — never re-implemented here.
 *
 * Gated on the same tenant-level external-data-egress consent already required for AI providers
 * (`getAiConsent`, AGENTS.md §16) before the call fires: a `tool` node sends caller/lead fields
 * (`{{from}}`, `{{to}}`, workflow variables) to a tenant-configured URL, an external destination
 * for personal data exactly like the AI Gateway's, and today the only consent primitive this
 * platform has is that one — reusing it here is a real check now rather than none while a
 * dedicated "tool endpoint" consent flag is decided as a separate product change. Checked fresh on
 * every call (never cached in the immutable per-call state), fail-closed on the lookup itself
 * erroring (mirrors `requireAiProviderConsent`'s middleware, which returns 503 rather than
 * treating a DB error as "no consent") — never fabricate consent, never let an outage silently
 * downgrade to "allowed".
 */
async function executeToolNodeAsync(state: WorkflowRuntimeState, node: RuntimeNode): Promise<void> {
  const tenantId = getRuntimeTenantId(state);
  try {
    const consent = await getAiConsent(tenantId);
    if (!consent.granted) {
      logger.warn('Workflow tool node blocked: tenant has not granted external data consent', {
        workflowId: state.workflowId,
        tenantId,
        nodeId: node.id,
      });
      applyToolFallback(state, node, 'consent_not_granted');
      return;
    }
  } catch (error) {
    logger.error('Failed to verify tenant consent before executing workflow tool node', {
      workflowId: state.workflowId,
      tenantId,
      nodeId: node.id,
      error: error instanceof Error ? error.message : String(error),
    });
    applyToolFallback(state, node, 'consent_check_unavailable');
    return;
  }

  const endpoint = renderTemplate(asString(node.config.endpoint), state.variables);
  const bodyPayload = typeof node.config.bodyPayload === 'string'
    ? renderTemplate(node.config.bodyPayload, state.variables)
    : node.config.bodyPayload;

  const result = await executeHttpTool({
    method: asString(node.config.method) || 'GET',
    endpoint,
    headers: toToolHeaders(node.config.headers, state.variables),
    bodyPayload,
    timeoutMs: asOptionalNumber(node.config.timeoutMs),
    retryLimit: asOptionalNumber(node.config.retryLimit),
  });

  if (result.ok) {
    state.variables.tool_ok = 'true';
    state.variables.tool_status = String(result.status ?? '');
    state.variables.tool_result = result.body ?? '';
    delete state.variables.tool_error;
    state.variables[`tool_${node.id}_ok`] = 'true';
    state.variables[`tool_${node.id}_result`] = result.body ?? '';
    logger.info('Workflow tool node executed successfully', {
      workflowId: state.workflowId,
      tenantId: getRuntimeTenantId(state),
      agentId: getRuntimeAgentId(state),
      nodeId: node.id,
      status: result.status,
    });
    return;
  }

  logger.warn('Workflow tool node failed; continuing the call on the fallback path', {
    workflowId: state.workflowId,
    tenantId: getRuntimeTenantId(state),
    agentId: getRuntimeAgentId(state),
    nodeId: node.id,
    reason: result.error,
  });
  applyToolFallback(state, node, result.error ?? 'unknown_error');
}

async function loadAgentKnowledgeDocuments(tenantId: string, agentId: string): Promise<KnowledgeDocument[]> {
  try {
    // Tenant-scoped lookup: `agentRepository.getAgent` only returns a row when `agentId` actually
    // belongs to `tenantId`, so a mismatched/foreign agentId yields no documents rather than
    // another tenant's knowledge base — this is the tenant-isolation guarantee for `knowledge`.
    const agent = await agentRepository.getAgent(agentId, tenantId);
    if (!agent) return [];
    const config = (agent.configuration as unknown as AgentConfiguration) || {};
    return Array.isArray(config.knowledge) ? config.knowledge : [];
  } catch (error) {
    logger.error('Failed to load agent knowledge documents for workflow runtime', {
      tenantId,
      agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Executes every node type that has no I/O side effect requiring `await` — shared by both
 * `advanceUntilInteraction` (sync, every phone turn) and `advanceUntilInteractionAsync` (async,
 * call start only) so `condition`/`switch`/`memory`/`llm`/`knowledge` semantics can never drift
 * between the two entry points. Returns the id of the next node to visit, or `null` to stop.
 * Caller has already handled `prompt`/`question`/`end`/`tool` before reaching this function.
 */
function advanceDeterministicNode(state: WorkflowRuntimeState, node: RuntimeNode): string | null {
  if (node.type === 'llm') {
    const provider = mapRuntimeProvider(node.config.provider);
    if (provider) state.preferredProvider = provider;
    return selectDefaultEdge(state, node.id)?.target ?? null;
  }

  if (node.type === 'memory') {
    applyMemoryNode(node.config, state.variables);
    return selectDefaultEdge(state, node.id)?.target ?? null;
  }

  if (node.type === 'condition') {
    const matched = evaluateCondition(node.config, state.variables);
    return selectHandle(state, node.id, matched ? 'out-0' : 'out-1')?.target ?? null;
  }

  if (node.type === 'switch') {
    return routeSwitch(state, node)?.target ?? null;
  }

  if (node.type === 'knowledge') {
    applyKnowledgeNode(state, node);
    return selectDefaultEdge(state, node.id)?.target ?? null;
  }

  if (node.type === 'voice') {
    // Passive node: it never interacts with the caller by itself, only (re)sets the active
    // Twilio voice override for whatever interaction comes next — see `resolveVoiceOverride`.
    // Reaching a `voice` node with no known mapping clears any earlier override rather than
    // leaving a stale one from a previous `voice` node in the same call.
    const override = resolveVoiceOverride(node.config);
    if (override) {
      state.variables[RUNTIME_VOICE_OVERRIDE_VAR] = JSON.stringify(override);
    } else {
      delete state.variables[RUNTIME_VOICE_OVERRIDE_VAR];
    }
    return selectDefaultEdge(state, node.id)?.target ?? null;
  }

  return selectDefaultEdge(state, node.id)?.target ?? null;
}

/**
 * Synchronous graph walk used by every `prepareWorkflowTurn` call (a live phone turn,
 * `telephonyService.ts` calling it without `await`). As of Onda 6, a `tool` node is a stopping
 * point exactly like `prompt`/`question`/`end`: it cannot perform a real network call from inside
 * this synchronous function (that would either break the non-`await`ed call site or block the
 * event loop for every other concurrent call), so it leaves `currentNodeId` pointed at the `tool`
 * node itself and returns — `prepareWorkflowTurn` turns that into `mode: 'tool_pending'` and the
 * caller must resume with `resumeAfterTool` (below), which performs the real HTTP call and then
 * continues the walk from there. See `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`.
 */
function advanceUntilInteraction(state: WorkflowRuntimeState, fromNodeId: string | null): WorkflowRuntimeState {
  let currentId = fromNodeId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      state.ended = true;
      state.currentNodeId = null;
      logger.error('Workflow runtime stopped an unexpected cycle', { workflowId: state.workflowId, nodeId: currentId });
      return state;
    }
    visited.add(currentId);

    const node = nodeById(state, currentId);
    if (!node) {
      state.ended = true;
      state.currentNodeId = null;
      logger.error('Workflow runtime could not resolve node', { workflowId: state.workflowId, nodeId: currentId });
      return state;
    }

    if (node.type === 'prompt' || node.type === 'question' || node.type === 'tool') {
      state.currentNodeId = node.id;
      return state;
    }

    if (node.type === 'end') {
      state.ended = true;
      state.currentNodeId = node.id;
      return state;
    }

    currentId = advanceDeterministicNode(state, node);
  }

  state.ended = true;
  state.currentNodeId = null;
  return state;
}

/**
 * Async twin of `advanceUntilInteraction`, used only by `initializeWorkflowRuntime` (i.e. the
 * segment of the graph between `start` and the call's first `prompt`/`question`). A `tool` node
 * reached here performs a real HTTP call inline (`executeToolNodeAsync`) because this function is
 * already `await`ed by its only caller; a `tool` node reached later, mid-conversation, instead
 * goes through `advanceUntilInteraction` (sync) + `resumeAfterTool` — see that pair's doc
 * comments for why the two entry points cannot share one code path.
 */
async function advanceUntilInteractionAsync(state: WorkflowRuntimeState, fromNodeId: string | null): Promise<WorkflowRuntimeState> {
  let currentId = fromNodeId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      state.ended = true;
      state.currentNodeId = null;
      logger.error('Workflow runtime stopped an unexpected cycle', { workflowId: state.workflowId, nodeId: currentId });
      return state;
    }
    visited.add(currentId);

    const node = nodeById(state, currentId);
    if (!node) {
      state.ended = true;
      state.currentNodeId = null;
      logger.error('Workflow runtime could not resolve node', { workflowId: state.workflowId, nodeId: currentId });
      return state;
    }

    if (node.type === 'prompt' || node.type === 'question') {
      state.currentNodeId = node.id;
      return state;
    }

    if (node.type === 'end') {
      state.ended = true;
      state.currentNodeId = node.id;
      return state;
    }

    if (node.type === 'tool') {
      await executeToolNodeAsync(state, node);
      currentId = selectDefaultEdge(state, node.id)?.target ?? null;
      continue;
    }

    currentId = advanceDeterministicNode(state, node);
  }

  state.ended = true;
  state.currentNodeId = null;
  return state;
}

function cloneState(state: WorkflowRuntimeState): WorkflowRuntimeState {
  return structuredClone(state);
}

function advancePastCurrent(state: WorkflowRuntimeState, current: RuntimeNode, handle?: string): WorkflowRuntimeState {
  const edge = handle ? selectHandle(state, current.id, handle) : selectDefaultEdge(state, current.id);
  return advanceUntilInteraction(state, edge?.target ?? null);
}

function questionText(state: WorkflowRuntimeState): string | undefined {
  const current = nodeById(state, state.currentNodeId);
  if (!current || current.type !== 'question') return undefined;
  const text = renderTemplate(asString(current.config.questionText), state.variables);
  return text || undefined;
}

function closingMessage(state: WorkflowRuntimeState): string {
  const current = nodeById(state, state.currentNodeId);
  const configured = current?.type === 'end' ? asString(current.config.closingMessage) : '';
  return configured || 'Obrigado pelo contato. Até logo.';
}

export async function initializeWorkflowRuntime(
  tenantId: string,
  initialVariables: Record<string, unknown> = {},
  // Optional today because `telephonyService.ts` (Agente 05) does not pass it yet at its two
  // call sites (`startCall`/`startOutboundCall`, both of which already have the resolved `Agent`
  // in scope) — see .agents/handoffs/onda-5/04-para-05-pass-agentid-to-workflow-runtime.md.
  // Without it, `knowledge` nodes execute honestly with zero documents (never a fabricated
  // match) instead of failing; adding the argument is additive and does not change any existing
  // caller's behavior.
  agentId?: string,
): Promise<WorkflowRuntimeState | null> {
  const workflow = await workflowRepository.findActiveWorkflowForTenant(tenantId);
  if (!workflow) return null;

  const { nodes, edges } = toStudioGraph(workflow.nodes, workflow.edges);
  const runtimeIssues = validateRuntimeCompatibility(nodes, edges);
  if (runtimeIssues.length > 0) {
    logger.error('Active workflow is not runtime-compatible; refusing to execute it', {
      tenantId,
      workflowId: workflow.id,
      issueIds: runtimeIssues.map((issue) => issue.id),
    });
    return null;
  }

  const start = nodes.find((node) => node.type === 'start');
  if (!start) return null;

  const knowledgeDocuments = agentId ? await loadAgentKnowledgeDocuments(tenantId, agentId) : [];

  const state: WorkflowRuntimeState = {
    workflowId: workflow.id,
    version: workflow.version,
    currentNodeId: start.id,
    variables: {
      ...Object.fromEntries(
        Object.entries(initialVariables)
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      ),
      [RUNTIME_TENANT_ID_VAR]: tenantId,
      ...(agentId ? { [RUNTIME_AGENT_ID_VAR]: agentId } : {}),
      [RUNTIME_KNOWLEDGE_DOCS_VAR]: JSON.stringify(knowledgeDocuments),
    },
    preferredProvider: 'GoogleGemini',
    retries: {},
    ended: false,
    nodes: compileNodes(nodes),
    edges: compileEdges(edges),
  };

  return advanceUntilInteractionAsync(state, start.id);
}

export function getWorkflowOpeningQuestion(state: WorkflowRuntimeState | null): string | null {
  if (!state || state.ended) return null;
  return questionText(state) ?? null;
}

// Single attachment point for `voiceOverride` on every `PreparedWorkflowTurn` this module
// returns (`prepareWorkflowTurn` and `resumeAfterTool`), so no individual `return` inside either
// function has to remember to carry it — see `resolveVoiceOverride`/`getRuntimeVoiceOverride`
// above for what is and is not resolvable.
function attachVoiceOverride(turn: PreparedWorkflowTurn): PreparedWorkflowTurn {
  const voiceOverride = getRuntimeVoiceOverride(turn.state);
  return voiceOverride ? { ...turn, voiceOverride } : turn;
}

function isToolPending(state: WorkflowRuntimeState): boolean {
  return nodeById(state, state.currentNodeId)?.type === 'tool';
}

export function prepareWorkflowTurn(state: WorkflowRuntimeState, userText: string): PreparedWorkflowTurn {
  return attachVoiceOverride(prepareWorkflowTurnInternal(state, userText));
}

function prepareWorkflowTurnInternal(state: WorkflowRuntimeState, userText: string): PreparedWorkflowTurn {
  const next = cloneState(state);
  next.variables.lastUserText = userText;

  if (next.ended) {
    return { state: next, mode: 'direct', directReply: closingMessage(next), shouldEnd: true };
  }

  const current = nodeById(next, next.currentNodeId);
  if (!current) {
    next.ended = true;
    return { state: next, mode: 'direct', directReply: closingMessage(next), shouldEnd: true };
  }

  // Defensive only: a correct caller never calls `prepareWorkflowTurn` again while the previous
  // turn's `mode` was `'tool_pending'` — it calls `resumeAfterTool` instead (see
  // `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`). If it does anyway, re-signal
  // `tool_pending` rather than silently treating the tool node as a generic dead end.
  if (current.type === 'tool') {
    return { state: next, mode: 'tool_pending', shouldEnd: false };
  }

  if (current.type === 'question') {
    const regexText = asString(current.config.validationRegex);
    let valid = true;
    if (regexText) {
      try {
        valid = new RegExp(regexText, 'i').test(userText);
      } catch {
        valid = false;
      }
    }

    if (!valid) {
      const attempts = (next.retries[current.id] ?? 0) + 1;
      next.retries[current.id] = attempts;
      const maxRetryCount = Math.max(0, asNumber(current.config.maxRetryCount, 3));
      const fallbackPrompt = renderTemplate(
        asString(current.config.fallbackPrompt) || asString(current.config.questionText) || 'Não entendi. Pode repetir?',
        next.variables,
      );

      if (attempts <= maxRetryCount) {
        return { state: next, mode: 'direct', directReply: fallbackPrompt, shouldEnd: false };
      }

      delete next.retries[current.id];
      advancePastCurrent(next, current, 'out-1');
      if (isToolPending(next)) {
        return { state: next, mode: 'tool_pending', shouldEnd: false };
      }
      const nextQuestion = questionText(next);
      return {
        state: next,
        mode: 'direct',
        directReply: [fallbackPrompt, nextQuestion].filter(Boolean).join(' '),
        shouldEnd: next.ended,
      };
    }

    const variableToSave = asString(current.config.variableToSave);
    if (variableToSave) next.variables[variableToSave] = userText;
    delete next.retries[current.id];
    advancePastCurrent(next, current, 'out-0');

    if (isToolPending(next)) {
      return { state: next, mode: 'tool_pending', shouldEnd: false };
    }

    const afterQuestion = nodeById(next, next.currentNodeId);
    if (afterQuestion?.type === 'prompt') {
      const instruction = renderTemplate(asString(afterQuestion.config.promptText), next.variables);
      advancePastCurrent(next, afterQuestion);
      if (isToolPending(next)) {
        return { state: next, mode: 'tool_pending', shouldEnd: false };
      }
      return {
        state: next,
        mode: 'llm',
        systemInstruction: instruction,
        preferredProvider: next.preferredProvider,
        nextQuestion: questionText(next),
        shouldEnd: next.ended,
      };
    }

    const nextQuestion = questionText(next);
    return {
      state: next,
      mode: 'direct',
      directReply: nextQuestion ?? (next.ended ? closingMessage(next) : 'Obrigado. Pode continuar.'),
      shouldEnd: next.ended,
    };
  }

  if (current.type === 'prompt') {
    const instruction = renderTemplate(asString(current.config.promptText), next.variables);
    advancePastCurrent(next, current);
    if (isToolPending(next)) {
      return { state: next, mode: 'tool_pending', shouldEnd: false };
    }
    return {
      state: next,
      mode: 'llm',
      systemInstruction: instruction,
      preferredProvider: next.preferredProvider,
      nextQuestion: questionText(next),
      shouldEnd: next.ended,
    };
  }

  next.ended = true;
  return { state: next, mode: 'direct', directReply: closingMessage(next), shouldEnd: true };
}

/**
 * Resumes a call that `prepareWorkflowTurn` paused with `mode: 'tool_pending'` — the async
 * continuation promised in `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`. `node`
 * must be the pending `tool` node (`state.nodes.find((n) => n.id === state.currentNodeId)`, or
 * whatever reference the caller already holds from the turn that returned `tool_pending`); if it
 * does not match a `tool` node actually at `state.currentNodeId`, this degrades to ending the call
 * rather than guessing at a graph position, exactly like `prepareWorkflowTurn` does for any other
 * unresolvable/corrupted state.
 *
 * Performs the real HTTP call (`executeToolNodeAsync`, reusing the same consent gate and
 * `HttpToolExecutor` SSRF/timeout/retry defense already used at call start), then continues
 * walking the graph exactly like `prepareWorkflowTurn` would — including returning another
 * `tool_pending` if a second `tool` node follows immediately, or `tool_ok='false'`/`tool_error`
 * on the same fallback path a live call-start failure already takes (`applyToolFallback`) — never
 * a fabricated success and never an unhandled exception back into `telephonyService.ts`.
 */
export async function resumeAfterTool(state: WorkflowRuntimeState, node: WorkflowNode): Promise<PreparedWorkflowTurn> {
  const next = cloneState(state);
  const toolNode = nodeById(next, node.id);

  if (!toolNode || toolNode.type !== 'tool') {
    logger.error('resumeAfterTool called without a matching pending tool node', {
      workflowId: next.workflowId,
      nodeId: node.id,
    });
    next.ended = true;
    return attachVoiceOverride({ state: next, mode: 'direct', directReply: closingMessage(next), shouldEnd: true });
  }

  await executeToolNodeAsync(next, toolNode);
  advancePastCurrent(next, toolNode);

  if (isToolPending(next)) {
    return attachVoiceOverride({ state: next, mode: 'tool_pending', shouldEnd: false });
  }

  const current = nodeById(next, next.currentNodeId);

  if (current?.type === 'prompt') {
    const instruction = renderTemplate(asString(current.config.promptText), next.variables);
    advancePastCurrent(next, current);
    if (isToolPending(next)) {
      return attachVoiceOverride({ state: next, mode: 'tool_pending', shouldEnd: false });
    }
    return attachVoiceOverride({
      state: next,
      mode: 'llm',
      systemInstruction: instruction,
      preferredProvider: next.preferredProvider,
      nextQuestion: questionText(next),
      shouldEnd: next.ended,
    });
  }

  if (current?.type === 'question') {
    return attachVoiceOverride({
      state: next,
      mode: 'direct',
      directReply: questionText(next) ?? (next.ended ? closingMessage(next) : 'Obrigado. Pode continuar.'),
      shouldEnd: next.ended,
    });
  }

  return attachVoiceOverride({ state: next, mode: 'direct', directReply: closingMessage(next), shouldEnd: true });
}
