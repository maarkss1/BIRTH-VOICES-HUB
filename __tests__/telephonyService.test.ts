import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/repositories/agentRepository.js', () => ({
  findAgentByPhoneNumber: vi.fn(),
  findAgentById: vi.fn(),
}));

vi.mock('../src/repositories/sessionRepository.js', () => ({
  createInboundPhoneSessionIfNoneForCallSid: vi.fn(),
  findSessionById: vi.fn(),
  updateSession: vi.fn(),
  findActivePhoneSessionByCallSid: vi.fn(),
}));

vi.mock('../src/services/callLogService.js', () => ({
  createCallLog: vi.fn(),
}));

vi.mock('../src/services/webhook.service.js', () => ({
  webhookService: { dispatch: vi.fn() },
}));

vi.mock('../lib/voice-runtime/providers/LLMGateway.js', () => ({
  llmProviderGateway: { processRequest: vi.fn() },
}));

vi.mock('../src/services/workflowRuntimeService.js', () => ({
  initializeWorkflowRuntime: vi.fn(),
  getWorkflowOpeningQuestion: vi.fn(),
  prepareWorkflowTurn: vi.fn(),
}));

import { findAgentByPhoneNumber, findAgentById } from '../src/repositories/agentRepository.js';
import {
  createInboundPhoneSessionIfNoneForCallSid,
  findSessionById,
  updateSession,
  findActivePhoneSessionByCallSid,
} from '../src/repositories/sessionRepository.js';
import { createCallLog } from '../src/services/callLogService.js';
import { webhookService } from '../src/services/webhook.service.js';
import { llmProviderGateway } from '../lib/voice-runtime/providers/LLMGateway.js';
import {
  initializeWorkflowRuntime,
  getWorkflowOpeningQuestion,
  prepareWorkflowTurn,
  type WorkflowRuntimeState,
} from '../src/services/workflowRuntimeService.js';
import { resolveAgent, startCall, handleTurn, endCall, startOutboundCall } from '../src/services/telephonyService.js';

const mockFindByPhone = vi.mocked(findAgentByPhoneNumber);
const mockFindById = vi.mocked(findAgentById);
const mockCreateInbound = vi.mocked(createInboundPhoneSessionIfNoneForCallSid);
const mockFindSessionById = vi.mocked(findSessionById);
const mockUpdateSession = vi.mocked(updateSession);
const mockFindActiveByCallSid = vi.mocked(findActivePhoneSessionByCallSid);
const mockCreateCallLog = vi.mocked(createCallLog);
const mockDispatch = vi.mocked(webhookService.dispatch);
const mockProcessRequest = vi.mocked(llmProviderGateway.processRequest);
const mockInitializeWorkflow = vi.mocked(initializeWorkflowRuntime);
const mockGetOpeningQuestion = vi.mocked(getWorkflowOpeningQuestion);
const mockPrepareWorkflowTurn = vi.mocked(prepareWorkflowTurn);

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

function workflowState(overrides: Partial<WorkflowRuntimeState> = {}): WorkflowRuntimeState {
  return {
    workflowId: 'wf-1',
    version: 3,
    currentNodeId: 'prompt-1',
    variables: {},
    preferredProvider: 'GoogleGemini',
    retries: {},
    ended: false,
    nodes: [],
    edges: [],
    ...overrides,
  };
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

beforeEach(() => {
  vi.clearAllMocks();
  mockInitializeWorkflow.mockResolvedValue(null);
  mockGetOpeningQuestion.mockReturnValue(null);
  mockCreateInbound.mockResolvedValue({ session: session(), created: true });
});

describe('telephonyService.resolveAgent', () => {
  it('resolves by phone number first', async () => {
    mockFindByPhone.mockResolvedValue(agent());
    const result = await resolveAgent('+15551234567');
    expect(result?.id).toBe('agent-1');
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('falls back to DEFAULT_AGENT_ID when no number match exists', async () => {
    mockFindByPhone.mockResolvedValue(null);
    mockFindById.mockResolvedValue(agent({ id: 'default-agent' }));
    process.env.DEFAULT_AGENT_ID = 'default-agent';

    const result = await resolveAgent('+19998887777');
    expect(result?.id).toBe('default-agent');
    expect(mockFindById).toHaveBeenCalledWith('default-agent');
    delete process.env.DEFAULT_AGENT_ID;
  });

  it('returns null when nothing matches and no default is configured', async () => {
    mockFindByPhone.mockResolvedValue(null);
    delete process.env.DEFAULT_AGENT_ID;

    const result = await resolveAgent('+19998887777');
    expect(result).toBeNull();
  });
});

describe('telephonyService.startCall', () => {
  it('reports unconfigured for an unmapped number instead of throwing', async () => {
    mockFindByPhone.mockResolvedValue(null);
    delete process.env.DEFAULT_AGENT_ID;

    const result = await startCall({ callSid: 'CA1', from: '+1000', to: '+19998887777' });
    expect(result).toEqual({ configured: false });
    expect(mockCreateInbound).not.toHaveBeenCalled();
  });

  it('creates a phone session scoped to the resolved agent tenant', async () => {
    mockFindByPhone.mockResolvedValue(agent({ configuration: { greeting: 'Oi, tudo bem?' } }));

    const result = await startCall({ callSid: 'CA1', from: '+1000', to: '+15551234567' });
    expect(result).toEqual({ configured: true, sessionId: 'sess-1', greeting: 'Oi, tudo bem?' });
    expect(mockCreateInbound).toHaveBeenCalledWith(
      'tenant-1',
      'agent-1',
      'CA1',
      expect.objectContaining({
        callSid: 'CA1',
        turns: [expect.objectContaining({ role: 'assistant', content: 'Oi, tudo bem?' })],
      }),
    );
    expect(mockInitializeWorkflow).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ direction: 'inbound' }),
      'agent-1',
    );
  });

  it('adds the opening Question from the published workflow to the real phone greeting', async () => {
    mockFindByPhone.mockResolvedValue(agent({ configuration: { greeting: 'Olá!' } }));
    const state = workflowState({ currentNodeId: 'question-1' });
    mockInitializeWorkflow.mockResolvedValue(state);
    mockGetOpeningQuestion.mockReturnValue('Qual é o seu nome?');

    const result = await startCall({ callSid: 'CA1', from: '+1000', to: '+15551234567' });

    expect(result).toEqual({ configured: true, sessionId: 'sess-1', greeting: 'Olá! Qual é o seu nome?' });
    expect(mockCreateInbound).toHaveBeenCalledWith(
      'tenant-1',
      'agent-1',
      'CA1',
      expect.objectContaining({ workflow: state }),
    );
  });

  it('reuses the persisted session and greeting when Twilio replays the same CallSid', async () => {
    mockFindByPhone.mockResolvedValue(agent({ configuration: { greeting: 'Nova saudação não deve substituir a persistida' } }));
    mockCreateInbound.mockResolvedValue({
      session: session({
        metadata: {
          direction: 'inbound',
          callSid: 'CA1',
          from: '+1000',
          to: '+15551234567',
          turns: [{ role: 'assistant', content: 'Saudação persistida', timestamp: 1 }],
        },
      }),
      created: false,
    });

    const result = await startCall({ callSid: 'CA1', from: '+1000', to: '+15551234567' });

    expect(result).toEqual({ configured: true, sessionId: 'sess-1', greeting: 'Saudação persistida' });
  });
});

describe('telephonyService.handleTurn', () => {
  it('returns not-found when the session no longer exists', async () => {
    mockFindSessionById.mockResolvedValue(null);
    const result = await handleTurn({ sessionId: 'missing', speechResult: 'oi' });
    expect(result).toEqual({ found: false });
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('appends both turns and persists them, using the agent system prompt and real tenant', async () => {
    mockFindSessionById.mockResolvedValue(session());
    mockFindById.mockResolvedValue(agent({ configuration: { systemPrompt: 'Seja breve.' } }));
    mockProcessRequest.mockResolvedValue({
      text: 'Claro, posso ajudar.',
      providerUsed: 'GoogleGemini',
      latencyMs: 10,
      tokensUsed: 5,
      costUSD: 0,
      fromFallback: false,
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Estou com dúvidas sobre o orçamento' });

    expect(result).toEqual({ found: true, reply: 'Claro, posso ajudar.', shouldEnd: false });
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'Estou com dúvidas sobre o orçamento',
      'GoogleGemini',
      'Seja breve.',
      'tenant-1',
    );

    const persistedMetadata = mockUpdateSession.mock.calls[0][1].metadata as { turns: Array<{ role: string; content: string }> };
    expect(persistedMetadata.turns.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(persistedMetadata.turns[1].content).toBe('Claro, posso ajudar.');
  });

  it('executes the workflow turn and persists its cursor only after an allowed AI request', async () => {
    const current = workflowState();
    const advanced = workflowState({ currentNodeId: 'end-1', ended: true });
    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: current },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({
      state: advanced,
      mode: 'llm',
      systemInstruction: 'Qualifique o contato de forma objetiva.',
      preferredProvider: 'OpenAI',
      nextQuestion: undefined,
      shouldEnd: true,
    });
    mockProcessRequest.mockResolvedValue({
      text: 'Perfeito, obrigado pelas informações.',
      providerUsed: 'OpenAI',
      latencyMs: 8,
      tokensUsed: 5,
      costUSD: 0,
      fromFallback: false,
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Quero uma demonstração' });

    expect(mockProcessRequest).toHaveBeenCalledWith(
      'Quero uma demonstração',
      'OpenAI',
      'Qualifique o contato de forma objetiva.',
      'tenant-1',
    );
    expect(result).toEqual({ found: true, reply: 'Perfeito, obrigado pelas informações.', shouldEnd: true });
    const persisted = mockUpdateSession.mock.calls[0][1].metadata as unknown as { workflow: WorkflowRuntimeState };
    expect(persisted.workflow.currentNodeId).toBe('end-1');
  });

  it('does not advance the workflow cursor when AI consent blocks the request', async () => {
    const current = workflowState();
    const advanced = workflowState({ currentNodeId: 'end-1', ended: true });
    mockFindSessionById.mockResolvedValue(session({
      metadata: { callSid: 'CA123', from: '+1000', to: '+15551234567', turns: [], workflow: current },
    }));
    mockFindById.mockResolvedValue(agent());
    mockPrepareWorkflowTurn.mockReturnValue({
      state: advanced,
      mode: 'llm',
      systemInstruction: 'Prompt publicado',
      preferredProvider: 'GoogleGemini',
      shouldEnd: true,
    });
    mockProcessRequest.mockResolvedValue({
      text: 'Consentimento de IA necessário.',
      providerUsed: 'NONE',
      latencyMs: 1,
      tokensUsed: 0,
      costUSD: 0,
      fromFallback: false,
      blockedByConsent: true,
    });

    const result = await handleTurn({ sessionId: 'sess-1', speechResult: 'Olá' });

    expect(result.shouldEnd).toBe(false);
    const persisted = mockUpdateSession.mock.calls[0][1].metadata as unknown as { workflow: WorkflowRuntimeState };
    expect(persisted.workflow.currentNodeId).toBe('prompt-1');
  });
});

describe('telephonyService.startOutboundCall', () => {
  it('returns not-found when the pre-created session is gone', async () => {
    mockFindSessionById.mockResolvedValue(null);
    const result = await startOutboundCall({ sessionId: 'missing', callSid: 'CA9' });
    expect(result).toEqual({ found: false });
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it('personalises the greeting from the call context', async () => {
    mockFindSessionById.mockResolvedValue(
      session({ metadata: { direction: 'outbound', callSid: null, from: '+1000', to: '+2000', context: { name: 'João' }, turns: [] } }),
    );
    mockFindById.mockResolvedValue(agent({ configuration: { outboundGreeting: 'Olá {{name}}, tem um minuto?' } }));

    const result = await startOutboundCall({ sessionId: 'sess-1', callSid: 'CA9' });

    expect(result).toEqual({ found: true, greeting: 'Olá João, tem um minuto?' });
  });

  it('drops unknown placeholders instead of speaking them aloud', async () => {
    mockFindSessionById.mockResolvedValue(
      session({ metadata: { direction: 'outbound', callSid: null, from: '+1000', to: '+2000', context: {}, turns: [] } }),
    );
    mockFindById.mockResolvedValue(agent({ configuration: { outboundGreeting: 'Olá {{name}}, tudo bem?' } }));

    const result = await startOutboundCall({ sessionId: 'sess-1', callSid: 'CA9' });

    expect(result).toEqual({ found: true, greeting: 'Olá , tudo bem?' });
  });

  it('records the greeting as the first transcript turn and backfills the CallSid', async () => {
    mockFindSessionById.mockResolvedValue(
      session({ metadata: { direction: 'outbound', callSid: null, from: '+1000', to: '+2000', context: {}, turns: [] } }),
    );
    mockFindById.mockResolvedValue(agent({ configuration: { outboundGreeting: 'Bom dia!' } }));

    await startOutboundCall({ sessionId: 'sess-1', callSid: 'CA9' });

    const persisted = mockUpdateSession.mock.calls[0][1].metadata as unknown as {
      callSid: string;
      turns: Array<{ role: string; content: string }>;
    };
    expect(persisted.callSid).toBe('CA9');
    expect(persisted.turns).toHaveLength(1);
    expect(persisted.turns[0]).toMatchObject({ role: 'assistant', content: 'Bom dia!' });
    expect(mockInitializeWorkflow).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ direction: 'outbound' }),
      'agent-1',
    );
  });

  it('reuses the persisted outbound greeting on a TwiML replay without writing again', async () => {
    mockFindSessionById.mockResolvedValue(
      session({
        metadata: {
          direction: 'outbound',
          callSid: 'CA9',
          from: '+1000',
          to: '+2000',
          context: {},
          turns: [{ role: 'assistant', content: 'Bom dia persistido!', timestamp: 1 }],
        },
      }),
    );
    mockFindById.mockResolvedValue(agent());

    const result = await startOutboundCall({ sessionId: 'sess-1', callSid: 'CA9' });

    expect(result).toEqual({ found: true, greeting: 'Bom dia persistido!' });
    expect(mockInitializeWorkflow).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });
});

describe('telephonyService.endCall', () => {
  it('does nothing when no active session matches the CallSid', async () => {
    mockFindActiveByCallSid.mockResolvedValue(null);
    const result = await endCall({ callSid: 'CA-missing', status: 'completed', durationSeconds: 42 });
    expect(result).toEqual({ found: false });
    expect(mockCreateCallLog).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('marks the session completed and writes a CallLog with a real duration and agent name', async () => {
    mockFindActiveByCallSid.mockResolvedValue(session());
    mockFindById.mockResolvedValue(agent({ name: 'Catarina Atendimento' }));

    await endCall({ callSid: 'CA123', status: 'completed', durationSeconds: 135 });

    expect(mockUpdateSession).toHaveBeenCalledWith('sess-1', { status: 'completed' });
    expect(mockCreateCallLog).toHaveBeenCalledWith('tenant-1', null, expect.objectContaining({
      duration: '02:15',
      status: 'Concluído',
      agent: 'Catarina Atendimento',
    }));
  });

  it('dispatches agent.call.ended to the callback URL the call was placed with', async () => {
    mockFindActiveByCallSid.mockResolvedValue(
      session({
        metadata: {
          direction: 'outbound',
          callSid: 'CA123',
          from: '+1000',
          to: '+2000',
          callbackUrl: 'https://crm.example.com/hook',
          context: { leadId: 'lead-9' },
          turns: [{ role: 'assistant', content: 'Bom dia!', timestamp: 1 }],
        },
      }),
    );
    mockFindById.mockResolvedValue(agent({ name: 'Catarina SDR' }));

    await endCall({ callSid: 'CA123', status: 'completed', durationSeconds: 60 });

    expect(mockDispatch).toHaveBeenCalledWith(
      'tenant-1',
      'agent.call.ended',
      expect.objectContaining({
        sessionId: 'sess-1',
        direction: 'outbound',
        outcome: 'Concluído',
        context: { leadId: 'lead-9' },
        transcript: [{ role: 'assistant', content: 'Bom dia!', timestamp: 1 }],
      }),
      'https://crm.example.com/hook',
    );
  });

  it('still reports an unanswered call, with an empty transcript', async () => {
    mockFindActiveByCallSid.mockResolvedValue(
      session({
        metadata: { direction: 'outbound', callSid: 'CA123', from: '+1000', to: '+2000', context: {}, turns: [] },
      }),
    );
    mockFindById.mockResolvedValue(agent());

    await endCall({ callSid: 'CA123', status: 'no-answer', durationSeconds: 0 });

    expect(mockUpdateSession).toHaveBeenCalledWith('sess-1', { status: 'failed' });
    expect(mockDispatch).toHaveBeenCalledWith(
      'tenant-1',
      'agent.call.ended',
      expect.objectContaining({ status: 'no-answer', outcome: 'Não atendida', durationSeconds: 0, transcript: [] }),
      undefined,
    );
  });
});
