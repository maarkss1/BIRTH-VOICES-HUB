import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/repositories/workflowRepository.js', () => ({
  findActiveWorkflowForTenant: vi.fn(),
}));

import { findActiveWorkflowForTenant } from '../src/repositories/workflowRepository.js';
import {
  initializeWorkflowRuntime,
  prepareWorkflowTurn,
  validateRuntimeCompatibility,
} from '../src/services/workflowRuntimeService.js';
import type { StudioEdge, StudioNode, NodeType } from '../lib/studio/types.js';

const mockFindActive = vi.mocked(findActiveWorkflowForTenant);

type ActiveWorkflow = Awaited<ReturnType<typeof findActiveWorkflowForTenant>>;

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

function activeWorkflow(nodes: StudioNode[], edges: StudioEdge[], version = 2): NonNullable<ActiveWorkflow> {
  return {
    id: 'wf-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    name: 'Fluxo publicado',
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workflowRuntimeService capability gate', () => {
  it('fails closed for Studio nodes that the production phone runtime cannot execute yet', () => {
    const nodes = [
      node('start-1', 'start'),
      // Onda 6 history: this example node was 'voice' through rodada 1, then 'human_handoff'
      // through rodada 2 — each got unblocked by a real feature within the same onda, breaking
      // this test twice in a row (see .agents/handoffs/onda-6/04-para-08-*.md, both rodadas).
      // Every real Studio NodeType is executable today, so a synthetic/nonexistent type is the
      // only example that cannot be invalidated by a future feature unblocking a real node.
      node('bogus-1', 'este_tipo_nao_existe' as unknown as NodeType, {}),
      node('end-1', 'end'),
    ];
    const edges = [edge('e1', 'start-1', 'bogus-1'), edge('e2', 'bogus-1', 'end-1')];

    const issues = validateRuntimeCompatibility(nodes, edges);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'err-runtime-unsupported-bogus-1', type: 'error' }),
    ]));
  });

  it('rejects ambiguous parallel fan-out outside explicit branch nodes', () => {
    const nodes = [node('start-1', 'start'), node('prompt-a', 'prompt', { promptText: 'A' }), node('prompt-b', 'prompt', { promptText: 'B' })];
    const edges = [edge('e1', 'start-1', 'prompt-a'), edge('e2', 'start-1', 'prompt-b')];

    const issues = validateRuntimeCompatibility(nodes, edges);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'err-runtime-fanout-start-1', type: 'error' }),
    ]));
  });
});

describe('workflowRuntimeService execution', () => {
  it('never loads a draft/non-active workflow for a real call', async () => {
    mockFindActive.mockResolvedValue(null);

    const state = await initializeWorkflowRuntime('tenant-1');

    expect(state).toBeNull();
    expect(mockFindActive).toHaveBeenCalledWith('tenant-1');
  });

  it('loads an active tenant workflow, applies its LLM provider and stops on the first prompt', async () => {
    const nodes = [
      node('start-1', 'start'),
      node('llm-1', 'llm', { provider: 'OpenAI' }),
      node('prompt-1', 'prompt', { promptText: 'Seja objetivo com {{company}}.' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'llm-1'),
      edge('e2', 'llm-1', 'prompt-1'),
      edge('e3', 'prompt-1', 'end-1'),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));

    const state = await initializeWorkflowRuntime('tenant-1', { company: 'Atlas GR' });

    expect(state).not.toBeNull();
    expect(state?.currentNodeId).toBe('prompt-1');
    expect(state?.preferredProvider).toBe('OpenAI');

    const prepared = prepareWorkflowTurn(state!, 'Quero saber mais');
    expect(prepared.mode).toBe('llm');
    expect(prepared.systemInstruction).toBe('Seja objetivo com Atlas GR.');
    expect(prepared.preferredProvider).toBe('OpenAI');
    expect(prepared.shouldEnd).toBe(true);
    expect(prepared.state.currentNodeId).toBe('end-1');
  });

  it('stores a valid Question answer and routes deterministically through Condition handles', async () => {
    const nodes = [
      node('start-1', 'start'),
      node('question-1', 'question', {
        questionText: 'Qual é o seu nome?',
        variableToSave: 'customer_name',
        validationRegex: '^[A-Za-zÀ-ÿ ]{2,50}$',
        maxRetryCount: 1,
        fallbackPrompt: 'Pode repetir seu nome?',
      }),
      node('condition-1', 'condition', { variable: 'customer_name', operator: 'equals', value: 'Ana' }),
      node('prompt-1', 'prompt', { promptText: 'Cumprimente {{customer_name}} pelo nome.' }),
      node('end-ok', 'end'),
      node('end-fail', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'question-1'),
      edge('e2', 'question-1', 'condition-1', 'out-0'),
      edge('e3', 'question-1', 'end-fail', 'out-1', true),
      edge('e4', 'condition-1', 'prompt-1', 'out-0'),
      edge('e5', 'condition-1', 'end-fail', 'out-1', true),
      edge('e6', 'prompt-1', 'end-ok'),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));

    const state = await initializeWorkflowRuntime('tenant-1');
    expect(state?.currentNodeId).toBe('question-1');

    const prepared = prepareWorkflowTurn(state!, 'Ana');

    expect(prepared.mode).toBe('llm');
    expect(prepared.systemInstruction).toBe('Cumprimente Ana pelo nome.');
    expect(prepared.state.variables.customer_name).toBe('Ana');
    expect(prepared.state.currentNodeId).toBe('end-ok');
    expect(prepared.shouldEnd).toBe(true);
  });

  it('re-prompts an invalid Question answer without advancing the cursor', async () => {
    const nodes = [
      node('start-1', 'start'),
      node('question-1', 'question', {
        questionText: 'Informe dois dígitos.',
        variableToSave: 'code',
        validationRegex: '^\\d{2}$',
        maxRetryCount: 2,
        fallbackPrompt: 'Preciso de exatamente dois dígitos.',
      }),
      node('end-ok', 'end'),
      node('end-fail', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'question-1'),
      edge('e2', 'question-1', 'end-ok', 'out-0'),
      edge('e3', 'question-1', 'end-fail', 'out-1', true),
    ];
    mockFindActive.mockResolvedValue(activeWorkflow(nodes, edges));

    const state = await initializeWorkflowRuntime('tenant-1');
    const prepared = prepareWorkflowTurn(state!, 'abc');

    expect(prepared.mode).toBe('direct');
    expect(prepared.directReply).toBe('Preciso de exatamente dois dígitos.');
    expect(prepared.state.currentNodeId).toBe('question-1');
    expect(prepared.state.retries['question-1']).toBe(1);
    expect(prepared.shouldEnd).toBe(false);
  });
});
