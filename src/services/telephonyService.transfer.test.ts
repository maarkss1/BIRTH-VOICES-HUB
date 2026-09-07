import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same mocking shape as `__tests__/telephonyService.test.ts` (Agente 08) — see
// `.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md`.
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
    currentNodeId: 'handoff-1',
    variables: {},
    preferredProvider: 'GoogleGemini',
    retries: {},
    ended: false,
    nodes: [],
    edges: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Onda 6 rodada 2 — `.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md`
describe('telephonyService.handleTurn — human_handoff transfer', () => {
  it('does not call the LLM gateway and surfaces transferDetails on a mode: "transfer" turn', async () => {
    const state = workflowState({ currentNodeId: 'handoff-1' });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({
      state,
      mode: 'transfer',
      shouldEnd: false,
      transferDetails: {
        to: '+5511999999999',
        timeoutSec: 30,
        record: false,
        message: 'Aguarde um momento enquanto encaminho sua ligação.',
      },
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Quero falar com um atendente' });

    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(result).toEqual({
      found: true,
      reply: 'Aguarde um momento enquanto encaminho sua ligação.',
      shouldEnd: false,
      voiceOverride: undefined,
      transferDetails: {
        to: '+5511999999999',
        timeoutSec: 30,
        record: false,
        message: 'Aguarde um momento enquanto encaminho sua ligação.',
      },
    });

    const persisted = mockUpdateSession.mock.calls[0][1].metadata as unknown as { workflow: WorkflowRuntimeState };
    expect(persisted.workflow.currentNodeId).toBe('handoff-1');
  });

  it('propagates a department label as-is, without resolving it to any number', async () => {
    const state = workflowState({ currentNodeId: 'handoff-1' });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({
      state,
      mode: 'transfer',
      shouldEnd: false,
      transferDetails: {
        to: '+5511988887777',
        timeoutSec: 45,
        record: true,
        message: 'Transferindo para o suporte técnico.',
        department: 'Suporte Técnico',
      },
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Preciso de suporte técnico' });

    expect(result.transferDetails).toEqual({
      to: '+5511988887777',
      timeoutSec: 45,
      record: true,
      message: 'Transferindo para o suporte técnico.',
      department: 'Suporte Técnico',
    });
  });

  it('resolves a mid-call tool -> human_handoff chain into a transfer without another Gather', async () => {
    const pendingState = workflowState({ currentNodeId: 'tool-1', nodes: [toolNode('tool-1')] });
    const transferState = workflowState({ currentNodeId: 'handoff-1', nodes: [] });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState({ currentNodeId: 'tool-1', nodes: [toolNode('tool-1')] }) },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({ state: pendingState, mode: 'tool_pending', shouldEnd: false });
    mockResumeAfterTool.mockResolvedValue({
      state: transferState,
      mode: 'transfer',
      shouldEnd: false,
      transferDetails: {
        to: '+5511977776666',
        timeoutSec: 30,
        record: false,
        message: 'Encaminhando você agora.',
      },
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Verifica meu pedido e me transfere' });

    expect(mockResumeAfterTool).toHaveBeenCalledTimes(1);
    expect(result.found).toBe(true);
    expect(result.transferDetails?.to).toBe('+5511977776666');
    expect(result.reply).toBe('Encaminhando você agora.');
  });

  it('ends the call honestly instead of inventing a destination if transferDetails is ever missing on a transfer turn', async () => {
    const state = workflowState({ currentNodeId: 'handoff-1' });

    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: workflowState() },
    }));
    mockFindById.mockResolvedValue(agent());
    // Defensive case only — the real contract guarantees `transferDetails` is always present when
    // `mode === 'transfer'`; this simulates a contract violation to prove we never guess a number.
    mockPrepareWorkflowTurn.mockReturnValue({ state, mode: 'transfer', shouldEnd: false });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'oi' });

    expect(result.found).toBe(true);
    expect(result.shouldEnd).toBe(true);
    expect(result.transferDetails).toBeUndefined();
    expect(result.reply).toBeTruthy();
  });
});
