import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same mocking shape as `__tests__/telephonyService.test.ts` (Agente 08) — kept in sync
// deliberately so this file only needs to add the Onda 6 exports (`resumeAfterTool`,
// `VoiceOverride`) on top of what that suite already mocks.
vi.mock('../repositories/agentRepository.js', () => ({
  findAgentByPhoneNumber: vi.fn(),
  findAgentById: vi.fn(),
}));

vi.mock('../repositories/sessionRepository.js', () => ({
  createInboundPhoneSessionIfNoneForCallSid: vi.fn(),
  findSessionById: vi.fn(),
  updateSession: vi.fn(),
  findActivePhoneSessionByCallSid: vi.fn(),
}));

vi.mock('./callLogService.js', () => ({
  createCallLog: vi.fn(),
}));

vi.mock('./webhook.service.js', () => ({
  webhookService: { dispatch: vi.fn() },
}));

vi.mock('../../lib/voice-runtime/providers/LLMGateway.js', () => ({
  llmProviderGateway: { processRequest: vi.fn() },
}));

vi.mock('./workflowRuntimeService.js', () => ({
  initializeWorkflowRuntime: vi.fn(),
  getWorkflowOpeningQuestion: vi.fn(),
  prepareWorkflowTurn: vi.fn(),
  resumeAfterTool: vi.fn(),
}));

import { findAgentById } from '../repositories/agentRepository.js';
import { findSessionById, updateSession } from '../repositories/sessionRepository.js';
import { llmProviderGateway } from '../../lib/voice-runtime/providers/LLMGateway.js';
import {
  prepareWorkflowTurn,
  resumeAfterTool,
  type PreparedWorkflowTurn,
  type WorkflowNode,
  type WorkflowRuntimeState,
} from './workflowRuntimeService.js';
import { handleTurn } from './telephonyService.js';

const mockFindById = vi.mocked(findAgentById);
const mockFindSessionById = vi.mocked(findSessionById);
const mockUpdateSession = vi.mocked(updateSession);
const mockProcessRequest = vi.mocked(llmProviderGateway.processRequest);
const mockPrepareWorkflowTurn = vi.mocked(prepareWorkflowTurn);
const mockResumeAfterTool = vi.mocked(resumeAfterTool);

type Agent = Awaited<ReturnType<typeof findAgentById>>;
type Session = Awaited<ReturnType<typeof findSessionById>>;

function agent(overrides: Partial<NonNullable<Agent>> = {}): NonNullable<Agent> {
  return {
    id: 'agent-1',
    tenantId: 'tenant-1',
    userId: null,
    name: 'Catarina Atendimento',
    model: 'gemini',
    configuration: {},
    phoneNumber: '+15551234567',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as NonNullable<Agent>;
}

function session(overrides: Partial<NonNullable<Session>> = {}): NonNullable<Session> {
  return {
    id: 'sess-1',
    tenantId: 'tenant-1',
    userId: null,
    agentId: 'agent-1',
    channel: 'phone',
    status: 'active',
    metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as NonNullable<Session>;
}

function toolNode(id: string): WorkflowNode {
  return { id, type: 'tool', config: {} } as WorkflowNode;
}

function workflowState(overrides: Partial<WorkflowRuntimeState> = {}): WorkflowRuntimeState {
  return {
    workflowId: 'wf-1',
    version: 3,
    currentNodeId: 'tool-1',
    variables: {},
    preferredProvider: 'GoogleGemini',
    retries: {},
    ended: false,
    nodes: [toolNode('tool-1')],
    edges: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Onda 6 — `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`
describe('telephonyService.handleTurn — mid-call tool_pending continuation', () => {
  it('awaits resumeAfterTool with the pending tool node and replies from its terminal result', async () => {
    const pendingState = workflowState({ currentNodeId: 'tool-1' });
    const resumedState = workflowState({ currentNodeId: 'end-1', ended: true, nodes: [] });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({ state: pendingState, mode: 'tool_pending', shouldEnd: false });
    mockResumeAfterTool.mockResolvedValue({
      state: resumedState,
      mode: 'direct',
      directReply: 'Consulta concluída, obrigado.',
      shouldEnd: true,
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Qual o status do meu pedido?' });

    expect(mockResumeAfterTool).toHaveBeenCalledTimes(1);
    expect(mockResumeAfterTool).toHaveBeenCalledWith(
      pendingState,
      expect.objectContaining({ id: 'tool-1', type: 'tool' }),
    );
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(result).toEqual({ found: true, reply: 'Consulta concluída, obrigado.', shouldEnd: true, voiceOverride: undefined });

    const persisted = mockUpdateSession.mock.calls[0][1].metadata as unknown as { workflow: WorkflowRuntimeState };
    expect(persisted.workflow.currentNodeId).toBe('end-1');
  });

  it('chains two consecutive tool nodes, resolving each with its own resumeAfterTool call', async () => {
    const firstPending = workflowState({ currentNodeId: 'tool-1' });
    const secondPending = workflowState({ currentNodeId: 'tool-2', nodes: [toolNode('tool-2')] });
    const finalState = workflowState({ currentNodeId: 'end-1', ended: true, nodes: [] });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({ state: firstPending, mode: 'tool_pending', shouldEnd: false });
    mockResumeAfterTool
      .mockResolvedValueOnce({ state: secondPending, mode: 'tool_pending', shouldEnd: false })
      .mockResolvedValueOnce({ state: finalState, mode: 'direct', directReply: 'Tudo certo!', shouldEnd: true });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Confirma o agendamento' });

    expect(mockResumeAfterTool).toHaveBeenCalledTimes(2);
    expect(mockResumeAfterTool).toHaveBeenNthCalledWith(1, firstPending, expect.objectContaining({ id: 'tool-1' }));
    expect(mockResumeAfterTool).toHaveBeenNthCalledWith(2, secondPending, expect.objectContaining({ id: 'tool-2' }));
    expect(result).toEqual({ found: true, reply: 'Tudo certo!', shouldEnd: true, voiceOverride: undefined });
  });

  it('resolves a tool_pending turn into the LLM branch, using the resumed systemInstruction', async () => {
    const pendingState = workflowState({ currentNodeId: 'tool-1' });
    const resumedState = workflowState({ currentNodeId: 'prompt-1', nodes: [] });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({ state: pendingState, mode: 'tool_pending', shouldEnd: false });
    mockResumeAfterTool.mockResolvedValue({
      state: resumedState,
      mode: 'llm',
      systemInstruction: 'Responda com base no resultado da consulta.',
      preferredProvider: 'OpenAI',
      shouldEnd: false,
    });
    mockProcessRequest.mockResolvedValue({
      text: 'Seu pedido está a caminho.',
      providerUsed: 'OpenAI',
      latencyMs: 5,
      tokensUsed: 5,
      costUSD: 0,
      fromFallback: false,
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'E aí, chegou?' });

    expect(mockProcessRequest).toHaveBeenCalledWith(
      'E aí, chegou?',
      'OpenAI',
      'Responda com base no resultado da consulta.',
      'tenant-1',
    );
    expect(result).toEqual({ found: true, reply: 'Seu pedido está a caminho.', shouldEnd: false, voiceOverride: undefined });
  });

  it('ends the call gracefully instead of looping when the pending tool node cannot be resolved', async () => {
    const corruptedState = workflowState({ currentNodeId: 'ghost-node', nodes: [toolNode('tool-1')] });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({ state: corruptedState, mode: 'tool_pending', shouldEnd: false });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'oi' });

    expect(mockResumeAfterTool).not.toHaveBeenCalled();
    expect(result.found).toBe(true);
    expect(result.shouldEnd).toBe(true);
    expect(result.reply).toBeTruthy();
  });

  it('ends the call instead of looping forever on a cyclical tool_pending chain', async () => {
    const pendingState = workflowState({ currentNodeId: 'tool-1' });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({ state: pendingState, mode: 'tool_pending', shouldEnd: false });
    // Always resolves to another `tool_pending` on the very same node — simulates a corrupted
    // published graph with a `tool` node pointing back to itself.
    mockResumeAfterTool.mockResolvedValue({ state: pendingState, mode: 'tool_pending', shouldEnd: false } as PreparedWorkflowTurn);

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'oi' });

    expect(mockResumeAfterTool.mock.calls.length).toBeLessThanOrEqual(11);
    expect(result.found).toBe(true);
    expect(result.shouldEnd).toBe(true);
  });
});

// Onda 6 — `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`
describe('telephonyService.handleTurn — voiceOverride propagation', () => {
  it('propagates voiceOverride from a direct terminal turn', async () => {
    const state = workflowState({ currentNodeId: 'end-1', ended: true, nodes: [] });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({
      state,
      mode: 'direct',
      directReply: 'Até logo!',
      shouldEnd: true,
      voiceOverride: { voice: 'Polly.Camila', language: 'pt-BR' },
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Tchau' });

    expect(result.voiceOverride).toEqual({ voice: 'Polly.Camila', language: 'pt-BR' });
  });

  it('propagates voiceOverride resolved after a mid-call tool continuation', async () => {
    const pendingState = workflowState({ currentNodeId: 'tool-1' });
    const resumedState = workflowState({ currentNodeId: 'end-1', ended: true, nodes: [] });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({ state: pendingState, mode: 'tool_pending', shouldEnd: false });
    mockResumeAfterTool.mockResolvedValue({
      state: resumedState,
      mode: 'direct',
      directReply: 'Pronto.',
      shouldEnd: true,
      voiceOverride: { voice: 'Polly.Vitoria' },
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'ok' });

    expect(result.voiceOverride).toEqual({ voice: 'Polly.Vitoria' });
  });

  it('leaves voiceOverride undefined when no voice node was reached', async () => {
    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({
      state: workflowState({ currentNodeId: 'end-1', ended: true, nodes: [] }),
      mode: 'direct',
      directReply: 'Combinado.',
      shouldEnd: true,
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Combinado' });

    expect(result.voiceOverride).toBeUndefined();
  });
});
