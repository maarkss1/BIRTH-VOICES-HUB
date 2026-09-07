import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/workflowRepository.js', () => ({
  findActiveWorkflowForTenant: vi.fn(),
}));

vi.mock('../repositories/agentRepository.js', () => ({
  getAgent: vi.fn(),
}));

import { findActiveWorkflowForTenant } from '../repositories/workflowRepository.js';
import { getAgent } from '../repositories/agentRepository.js';
import {
  initializeWorkflowRuntime,
  prepareWorkflowTurn,
  validateRuntimeCompatibility,
} from './workflowRuntimeService.js';
import type { StudioEdge, StudioNode, NodeType } from '../../lib/studio/types.js';
import type { KnowledgeDocument } from '../../lib/voice-runtime/intelligence/KnowledgeConfidenceEngine.js';

const mockFindActive = vi.mocked(findActiveWorkflowForTenant);
const mockGetAgent = vi.mocked(getAgent);

type ActiveWorkflow = Awaited<ReturnType<typeof findActiveWorkflowForTenant>>;
type Agent = Awaited<ReturnType<typeof getAgent>>;

function node(id: string, type: NodeType, config: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: id, category: 'test', config },
  } as StudioNode;
}

function edge(id: string, source: string, target: string, sourceHandle?: string, isFallback = false): StudioEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    type: 'studioEdge',
    data: { isFallback },
  } as StudioEdge;
}

function activeWorkflow(nodes: StudioNode[], edges: StudioEdge[], version = 1): NonNullable<ActiveWorkflow> {
  return {
    id: 'wf-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    name: 'Fluxo com knowledge/tool',
    status: 'active',
    nodes,
    edges,
    metadata: {},
    version,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as unknown as NonNullable<ActiveWorkflow>;
}

function agentWithKnowledge(id: string, tenantId: string, knowledge: KnowledgeDocument[]): NonNullable<Agent> {
  return {
    id,
    tenantId,
    userId: null,
    name: 'Agente de teste',
    model: 'gemini',
    configuration: { knowledge },
    phoneNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as unknown as NonNullable<Agent>;
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('validateRuntimeCompatibility: knowledge/tool are no longer blocked', () => {
  it('accepts a graph using knowledge and tool nodes (only voice/human_handoff stay blocked)', () => {
    const nodes = [
      node('start-1', 'start'),
      node('knowledge-1', 'knowledge', { database: 'faq' }),
      node('tool-1', 'tool', { method: 'GET', endpoint: 'https://api.example.com/lookup' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'knowledge-1'),
      edge('e2', 'knowledge-1', 'tool-1'),
      edge('e3', 'tool-1', 'end-1'),
    ];

    const issues = validateRuntimeCompatibility(nodes, edges);

    expect(issues).toEqual([]);
  });

  it('still fails closed for voice and human_handoff', () => {
    const nodes = [
      node('start-1', 'start'),
      node('voice-1', 'voice', { provider: 'ElevenLabs' }),
      node('handoff-1', 'human_handoff', { department: 'vendas' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'voice-1'),
      edge('e2', 'voice-1', 'handoff-1'),
      edge('e3', 'handoff-1', 'end-1'),
    ];

    const issues = validateRuntimeCompatibility(nodes, edges);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'err-runtime-unsupported-voice-1', type: 'error' }),
      expect.objectContaining({ id: 'err-runtime-unsupported-handoff-1', type: 'error' }),
    ]));
  });

  it('rejects a tool node configured with an unsupported HTTP method', () => {
    const nodes = [
      node('start-1', 'start'),
      node('tool-1', 'tool', { method: 'TRACE', endpoint: 'https://api.example.com/lookup' }),
      node('end-1', 'end'),
    ];
    const edges = [edge('e1', 'start-1', 'tool-1'), edge('e2', 'tool-1', 'end-1')];

    const issues = validateRuntimeCompatibility(nodes, edges);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'err-runtime-tool-method-tool-1', type: 'error' }),
    ]));
  });
});

describe('knowledge node execution', () => {
  it('injects a confident match into the next prompt/LLM context', async () => {
    const doc: KnowledgeDocument = {
      id: 'doc-1',
      name: 'faq',
      keyword: 'reembolso',
      content: 'Reembolsos são processados em até 5 dias úteis.',
      addedAt: Date.now(),
    };
    const nodes = [
      node('start-1', 'start'),
      node('question-1', 'question', { questionText: 'Como posso ajudar?', variableToSave: 'pergunta' }),
      node('knowledge-1', 'knowledge', { database: 'faq' }),
      node('prompt-1', 'prompt', { promptText: 'Responda usando: {{knowledge_result}}' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'question-1'),
      edge('e2', 'question-1', 'knowledge-1', 'out-0'),
      edge('e3', 'question-1', 'end-1', 'out-1', true),
      edge('e4', 'knowledge-1', 'prompt-1'),
      edge('e5', 'prompt-1', 'end-1'),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));
    mockGetAgent.mockResolvedValue(agentWithKnowledge('agent-1', 'tenant-1', [doc]));

    const state = await initializeWorkflowRuntime('tenant-1', {}, 'agent-1');
    expect(state?.currentNodeId).toBe('question-1');
    expect(mockGetAgent).toHaveBeenCalledWith('agent-1', 'tenant-1');

    const prepared = prepareWorkflowTurn(state!, 'Quero saber sobre reembolso');

    expect(prepared.mode).toBe('llm');
    expect(prepared.systemInstruction).toContain('Reembolsos são processados em até 5 dias úteis.');
    expect(prepared.state.variables.knowledge_is_low_confidence).toBe('false');
  });

  it('never fabricates a result when nothing matches with enough confidence', async () => {
    const doc: KnowledgeDocument = {
      id: 'doc-1',
      name: 'faq',
      keyword: 'horario-de-funcionamento',
      content: 'Atendemos de segunda a sexta, das 9h às 18h.',
      addedAt: Date.now(),
    };
    const nodes = [
      node('start-1', 'start'),
      node('question-1', 'question', { questionText: 'Como posso ajudar?', variableToSave: 'pergunta' }),
      node('knowledge-1', 'knowledge', { database: 'faq' }),
      node('prompt-1', 'prompt', { promptText: 'Responda usando: {{knowledge_result}}' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'question-1'),
      edge('e2', 'question-1', 'knowledge-1', 'out-0'),
      edge('e3', 'question-1', 'end-1', 'out-1', true),
      edge('e4', 'knowledge-1', 'prompt-1'),
      edge('e5', 'prompt-1', 'end-1'),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));
    mockGetAgent.mockResolvedValue(agentWithKnowledge('agent-1', 'tenant-1', [doc]));

    const state = await initializeWorkflowRuntime('tenant-1', {}, 'agent-1');
    const prepared = prepareWorkflowTurn(state!, 'Qual é a cor do céu?');

    expect(prepared.state.variables.knowledge_is_low_confidence).toBe('true');
    // The engine's own honest "no match" caveat, never a fabricated fact from the unrelated doc.
    expect(prepared.systemInstruction).toContain('Não encontrei informações específicas sobre isso.');
    expect(prepared.systemInstruction).toContain('Baixa confiança');
    expect(prepared.systemInstruction).not.toContain('Atendemos de segunda a sexta');
  });

  it('never leaks another tenant\'s knowledge documents (agentId not owned by tenantId yields zero documents)', async () => {
    const nodes = [
      node('start-1', 'start'),
      node('knowledge-1', 'knowledge', { database: 'faq' }),
      node('prompt-1', 'prompt', { promptText: '{{knowledge_result}}' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'knowledge-1'),
      edge('e2', 'knowledge-1', 'prompt-1'),
      edge('e3', 'prompt-1', 'end-1'),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));
    // Simulates the real tenant-scoped repository call: an agentId belonging to another tenant
    // (or simply unknown) resolves to no row at all — never another tenant's document set.
    mockGetAgent.mockResolvedValue(null);

    const state = await initializeWorkflowRuntime('tenant-1', {}, 'agent-from-another-tenant');

    expect(mockGetAgent).toHaveBeenCalledWith('agent-from-another-tenant', 'tenant-1');
    expect(state?.variables.knowledge_is_low_confidence).toBe('true');
    expect(state?.variables.knowledge_result).toContain('Não encontrei informações específicas sobre isso.');
  });

  it('runs with zero documents (never crashes) when no agentId is supplied', async () => {
    const nodes = [
      node('start-1', 'start'),
      node('knowledge-1', 'knowledge', { database: 'faq' }),
      node('end-1', 'end'),
    ];
    const edges = [edge('e1', 'start-1', 'knowledge-1'), edge('e2', 'knowledge-1', 'end-1')];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));

    const state = await initializeWorkflowRuntime('tenant-1');

    expect(mockGetAgent).not.toHaveBeenCalled();
    expect(state?.ended).toBe(true);
    expect(state?.variables.knowledge_is_low_confidence).toBe('true');
  });
});

describe('tool node execution', () => {
  it('executes a real HTTP call at call start (advanceUntilInteractionAsync) and exposes tool_ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"balance":42}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const nodes = [
      node('start-1', 'start'),
      node('tool-1', 'tool', { method: 'GET', endpoint: 'https://api.example.com/balance', timeoutMs: 2000 }),
      node('prompt-1', 'prompt', { promptText: 'Saldo: {{tool_result}}' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'tool-1'),
      edge('e2', 'tool-1', 'prompt-1'),
      edge('e3', 'prompt-1', 'end-1'),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));

    const state = await initializeWorkflowRuntime('tenant-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state?.variables.tool_ok).toBe('true');
    expect(state?.variables.tool_result).toBe('{"balance":42}');
  });

  it('a blocked/failed tool call never throws and leaves a recoverable fallback for the next node', async () => {
    const nodes = [
      node('start-1', 'start'),
      // Points at a cloud-metadata address: must be refused before any network call, and must not
      // take down call setup.
      node('tool-1', 'tool', { method: 'GET', endpoint: 'https://169.254.169.254/latest/meta-data' }),
      node('condition-1', 'condition', { variable: 'tool_ok', operator: 'equals', value: 'true' }),
      node('end-ok', 'end'),
      node('end-fail', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'tool-1'),
      edge('e2', 'tool-1', 'condition-1'),
      edge('e3', 'condition-1', 'end-ok', 'out-0'),
      edge('e4', 'condition-1', 'end-fail', 'out-1', true),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));

    const state = await initializeWorkflowRuntime('tenant-1');

    expect(state).not.toBeNull();
    expect(state?.variables.tool_ok).toBe('false');
    expect(state?.variables.tool_error).toBe('blocked_url');
    // The call kept going and routed on the failure branch instead of crashing.
    expect(state?.currentNodeId).toBe('end-fail');
    expect(state?.ended).toBe(true);
  });

  it('mid-call (prepareWorkflowTurn, synchronous) a tool node degrades to the fallback path instead of blocking or crashing', () => {
    const nodes = [
      node('start-1', 'start'),
      node('question-1', 'question', { questionText: 'Qual seu CPF?', variableToSave: 'cpf' }),
      node('tool-1', 'tool', { method: 'GET', endpoint: 'https://api.example.com/cpf-lookup' }),
      node('end-ok', 'end'),
      node('end-fail', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'question-1'),
      edge('e2', 'question-1', 'tool-1', 'out-0'),
      edge('e3', 'question-1', 'end-fail', 'out-1', true),
      edge('e4', 'tool-1', 'end-ok'),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));

    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    // Build the state synchronously (bypassing the real async init) to exercise exactly the
    // synchronous `prepareWorkflowTurn` -> `advanceUntilInteraction` path a live phone turn uses.
    const syntheticState = {
      workflowId: 'wf-1',
      version: 1,
      currentNodeId: 'question-1',
      variables: {},
      preferredProvider: 'GoogleGemini' as const,
      retries: {},
      ended: false,
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, config: n.data.config ?? {} })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: typeof e.sourceHandle === 'string' ? e.sourceHandle : null,
        isFallback: e.data?.isFallback === true,
        priority: 0,
      })),
    };

    const prepared = prepareWorkflowTurn(syntheticState as Parameters<typeof prepareWorkflowTurn>[0], '12345678900');

    // Never performs a real network call synchronously — that would require blocking the event
    // loop, which this runtime refuses to do (see workflowRuntimeService.ts's applyToolFallback).
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prepared.state.variables.tool_ok).toBe('false');
    expect(prepared.state.variables.tool_error).toBe('tool_unavailable_mid_call');
    expect(prepared.state.currentNodeId).toBe('end-ok');
    expect(prepared.shouldEnd).toBe(true);
  });
});
