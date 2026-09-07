import { Prisma } from '@prisma/client';
import * as agentRepository from '../repositories/agentRepository.js';
import * as sessionRepository from '../repositories/sessionRepository.js';
import * as callLogService from './callLogService.js';
import { webhookService } from './webhook.service.js';
import { llmProviderGateway } from '../../lib/voice-runtime/providers/LLMGateway.js';
import {
  getWorkflowOpeningQuestion,
  initializeWorkflowRuntime,
  prepareWorkflowTurn,
  resumeAfterTool,
  type PreparedWorkflowTurn,
  type VoiceOverride,
  type WorkflowNode,
  type WorkflowRuntimeState,
} from './workflowRuntimeService.js';
import { logger } from '../lib/logger.js';

const DEFAULT_GREETING = 'Olá! Aqui é a assistente virtual do Birth Voices Hub. Como posso ajudar você hoje?';
const DEFAULT_OUTBOUND_GREETING =
  'Olá! Aqui é a assistente virtual do Birth Voices Hub. Você tem um minuto para conversarmos?';
const DEFAULT_SYSTEM_PROMPT =
  'Você é uma assistente de voz do Birth Voices Hub, especializada em atendimento e qualificação de contatos. ' +
  'Seja acolhedora, clara e objetiva nas respostas, adequadas para serem faladas em voz alta.';
const REPROMPT_MESSAGE = 'Desculpe, não consegui ouvir. Pode repetir, por favor?';
const GOODBYE_MESSAGE = 'Não foi possível captar sua resposta. Vamos encerrar por aqui, tente novamente em instantes.';
const TOOL_CHAIN_ERROR_MESSAGE = 'Desculpe, não consegui concluir essa etapa agora. Vamos encerrar por aqui, tente novamente em instantes.';
// Defensive bound on consecutive `tool` nodes resolved in a single turn (see
// `resolvePreparedTurn` below). `resumeAfterTool` never loops on its own — this only guards
// against a corrupted/cyclical published graph turning one Twilio webhook request into an
// unbounded chain of outbound HTTP calls before a TwiML response is ever sent back.
const MAX_TOOL_CHAIN_STEPS = 10;

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface PhoneSessionMetadata {
  callSid: string | null;
  from: string | null;
  to: string;
  turns: ConversationTurn[];
  direction?: 'inbound' | 'outbound';
  context?: Record<string, unknown>;
  callbackUrl?: string | null;
  /** Immutable runtime snapshot selected when the call starts. */
  workflow?: WorkflowRuntimeState;
}

function configString(configuration: unknown, key: string, fallback: string): string {
  if (configuration && typeof configuration === 'object' && key in configuration) {
    const value = (configuration as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      const value = context[key];
      return value == null ? '' : String(value);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function resolveAgent(toNumber: string) {
  const byNumber = await agentRepository.findAgentByPhoneNumber(toNumber);
  if (byNumber) return byNumber;

  const defaultAgentId = process.env.DEFAULT_AGENT_ID;
  if (defaultAgentId) {
    const fallbackAgent = await agentRepository.findAgentById(defaultAgentId);
    if (fallbackAgent) return fallbackAgent;
  }

  return null;
}

export async function startCall(params: { callSid: string; from: string; to: string }) {
  const agent = await resolveAgent(params.to);
  if (!agent) {
    logger.warn('Incoming call to unconfigured number', { to: params.to, callSid: params.callSid });
    return { configured: false as const };
  }

  const workflow = await initializeWorkflowRuntime(agent.tenantId, {
    direction: 'inbound',
    from: params.from,
    to: params.to,
  }, agent.id);

  const configuredGreeting = configString(agent.configuration, 'greeting', DEFAULT_GREETING);
  const openingQuestion = getWorkflowOpeningQuestion(workflow);
  const greeting = openingQuestion ? `${configuredGreeting} ${openingQuestion}` : configuredGreeting;

  // Persist the opening prompt as part of the transcript. Besides making transcripts complete, it
  // lets a Twilio retry return the exact same first response from the existing CallSid session.
  const metadata: PhoneSessionMetadata = {
    direction: 'inbound',
    callSid: params.callSid,
    from: params.from,
    to: params.to,
    turns: [{ role: 'assistant', content: greeting, timestamp: Date.now() }],
    ...(workflow ? { workflow } : {}),
  };

  const result = await sessionRepository.createInboundPhoneSessionIfNoneForCallSid(
    agent.tenantId,
    agent.id,
    params.callSid,
    metadata,
  );

  if (!result.created) {
    const persisted = result.session.metadata as unknown as PhoneSessionMetadata;
    const persistedGreeting = persisted?.turns?.find((turn) => turn.role === 'assistant')?.content;
    logger.info('Twilio initial webhook replay reused existing phone session', {
      callSid: params.callSid,
      sessionId: result.session.id,
    });
    return {
      configured: true as const,
      sessionId: result.session.id,
      greeting: persistedGreeting || greeting,
    };
  }

  return {
    configured: true as const,
    sessionId: result.session.id,
    greeting,
  };
}

/** Opens the conversation on a call we placed ourselves. */
export async function startOutboundCall(params: { sessionId: string; callSid: string }) {
  const session = await sessionRepository.findSessionById(params.sessionId);
  if (!session || !session.agentId) return { found: false as const };

  const agent = await agentRepository.findAgentById(session.agentId);
  if (!agent) return { found: false as const };

  const metadata = (session.metadata as unknown as PhoneSessionMetadata) || ({ turns: [] } as unknown as PhoneSessionMetadata);
  metadata.turns = metadata.turns || [];

  // Twilio may retry the outbound TwiML request. Once this CallSid has already been bound to the
  // session, reuse the persisted opening line instead of appending it to the transcript twice or
  // re-freezing a different workflow version mid-call.
  if (params.callSid && metadata.callSid === params.callSid) {
    const persistedGreeting = metadata.turns.find((turn) => turn.role === 'assistant')?.content;
    if (persistedGreeting) {
      return { found: true as const, greeting: persistedGreeting };
    }
  }

  const workflow = await initializeWorkflowRuntime(session.tenantId, {
    direction: 'outbound',
    from: metadata.from ?? '',
    to: metadata.to ?? '',
    ...(metadata.context ?? {}),
  }, agent.id);
  if (workflow) metadata.workflow = workflow;

  const baseGreeting = renderTemplate(
    configString(agent.configuration, 'outboundGreeting', DEFAULT_OUTBOUND_GREETING),
    metadata.context ?? {},
  );
  const openingQuestion = getWorkflowOpeningQuestion(workflow);
  const greeting = openingQuestion ? `${baseGreeting} ${openingQuestion}` : baseGreeting;

  metadata.turns.push({ role: 'assistant', content: greeting, timestamp: Date.now() });
  if (params.callSid) metadata.callSid = params.callSid;

  await sessionRepository.updateSession(session.id, { metadata: metadata as unknown as Prisma.InputJsonValue });

  return { found: true as const, greeting };
}

/**
 * Resolves a `PreparedWorkflowTurn` down to a terminal mode (`'llm'` or `'direct'`), driving the
 * mid-call `tool` continuation described in
 * `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`: each `mode: 'tool_pending'` is
 * resumed with `await resumeAfterTool(...)`, which performs the real HTTP call for that node and
 * returns the next step of the graph walk — itself another `tool_pending` when a second `tool`
 * node follows immediately. `resumeAfterTool` never throws (timeout/blocked URL/no consent all
 * degrade to its own fallback path), so the only defensive case handled here is a corrupted state
 * whose `currentNodeId` no longer resolves to the pending `tool` node, or a chain exceeding
 * `MAX_TOOL_CHAIN_STEPS` — both end the call rather than hang the Twilio webhook response.
 */
async function resolvePreparedTurn(prepared: PreparedWorkflowTurn): Promise<PreparedWorkflowTurn> {
  let current = prepared;
  let steps = 0;

  while (current.mode === 'tool_pending') {
    steps += 1;
    if (steps > MAX_TOOL_CHAIN_STEPS) {
      logger.error('Workflow tool_pending chain exceeded the safety limit; ending the call', {
        workflowId: current.state.workflowId,
        currentNodeId: current.state.currentNodeId,
      });
      return { state: current.state, mode: 'direct', directReply: TOOL_CHAIN_ERROR_MESSAGE, shouldEnd: true };
    }

    const pendingNode = current.state.nodes.find(
      (node): node is WorkflowNode => node.id === current.state.currentNodeId,
    );

    if (!pendingNode) {
      logger.error('tool_pending turn without a matching pending tool node in state.nodes', {
        workflowId: current.state.workflowId,
        currentNodeId: current.state.currentNodeId,
      });
      return { state: current.state, mode: 'direct', directReply: TOOL_CHAIN_ERROR_MESSAGE, shouldEnd: true };
    }

    // Sequential by necessity: each tool's result may feed the graph position/variables the next
    // iteration reads, so these cannot run concurrently.
    current = await resumeAfterTool(current.state, pendingNode);
  }

  return current;
}

// Explicit union (instead of leaving `handleTurn`'s return type fully inferred) so `voiceOverride`
// can be declared optional on the `found: true` branch — matching TypeScript's own inference for
// the `reply`/`shouldEnd` siblings on the `found: false` branch, which is what already lets
// existing fixtures/mocks that predate this field (`__tests__/telephony.controller.test.ts` and
// `__tests__/telephonyService.test.ts`, both Agente 08) build a `{ found: true, reply, shouldEnd }`
// object without it and keep compiling unchanged. See
// `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`.
export type HandleTurnResult =
  | { found: false; reply?: undefined; shouldEnd?: undefined; voiceOverride?: undefined }
  | { found: true; reply: string; shouldEnd: boolean; voiceOverride?: VoiceOverride };

export async function handleTurn(
  params: { sessionId: string; speechResult: string },
): Promise<HandleTurnResult> {
  const session = await sessionRepository.findSessionById(params.sessionId);
  if (!session || !session.agentId) return { found: false as const };

  const agent = await agentRepository.findAgentById(session.agentId);
  if (!agent) return { found: false as const };

  const metadata = (session.metadata as unknown as PhoneSessionMetadata) || { turns: [] };
  metadata.turns = metadata.turns || [];
  metadata.turns.push({ role: 'user', content: params.speechResult, timestamp: Date.now() });

  let reply: string;
  let shouldEnd = false;
  let voiceOverride: VoiceOverride | undefined;

  if (metadata.workflow) {
    // `prepareWorkflowTurn` may return `mode: 'tool_pending'` when the graph walk reaches a `tool`
    // node mid-call (see `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md`);
    // `resolvePreparedTurn` drives it to a terminal `'llm'`/`'direct'` mode before this function
    // decides how to reply, exactly as it would for the original synchronous result.
    const prepared = await resolvePreparedTurn(prepareWorkflowTurn(metadata.workflow, params.speechResult));
    voiceOverride = prepared.voiceOverride;

    if (prepared.mode === 'direct') {
      metadata.workflow = prepared.state;
      reply = prepared.directReply || 'Pode continuar.';
      shouldEnd = prepared.shouldEnd;
    } else {
      const systemInstruction = prepared.systemInstruction
        || configString(agent.configuration, 'systemPrompt', DEFAULT_SYSTEM_PROMPT);
      const preferredProvider = prepared.preferredProvider ?? 'GoogleGemini';
      const gatewayResponse = await llmProviderGateway.processRequest(
        params.speechResult,
        preferredProvider,
        systemInstruction,
        session.tenantId,
      );

      if (!gatewayResponse.blockedByConsent) {
        metadata.workflow = prepared.state;
        shouldEnd = prepared.shouldEnd;
      }

      reply = gatewayResponse.text;
      if (!gatewayResponse.blockedByConsent && prepared.nextQuestion) {
        reply = `${reply} ${prepared.nextQuestion}`.trim();
      }
    }
  } else {
    const systemInstruction = configString(agent.configuration, 'systemPrompt', DEFAULT_SYSTEM_PROMPT);
    const gatewayResponse = await llmProviderGateway.processRequest(
      params.speechResult,
      'GoogleGemini',
      systemInstruction,
      session.tenantId,
    );
    reply = gatewayResponse.text;
  }

  metadata.turns.push({ role: 'assistant', content: reply, timestamp: Date.now() });

  await sessionRepository.updateSession(session.id, { metadata: metadata as unknown as Prisma.InputJsonValue });

  return { found: true as const, reply, shouldEnd, voiceOverride };
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.max(0, Math.floor(totalSeconds % 60));
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const TWILIO_STATUS_TO_CALL_LOG: Record<string, string> = {
  completed: 'Concluído',
  busy: 'Ocupado',
  'no-answer': 'Não atendida',
  failed: 'Falha',
  canceled: 'Cancelada',
};

export async function endCall(params: { callSid: string; status: string; durationSeconds: number }) {
  const session = await sessionRepository.findActivePhoneSessionByCallSid(params.callSid);
  if (!session) return { found: false as const };

  await sessionRepository.updateSession(session.id, { status: params.status === 'completed' ? 'completed' : 'failed' });

  const agent = session.agentId ? await agentRepository.findAgentById(session.agentId) : null;
  const metadata = (session.metadata as unknown as PhoneSessionMetadata) || ({ turns: [] } as unknown as PhoneSessionMetadata);
  const outcome = TWILIO_STATUS_TO_CALL_LOG[params.status] || params.status;
  const isOutbound = metadata.direction === 'outbound';

  await callLogService.createCallLog(session.tenantId, null, {
    contactName: isOutbound ? String(metadata.context?.name ?? metadata.to ?? 'Ligação Telefônica') : 'Ligação Telefônica',
    duration: formatDuration(params.durationSeconds),
    status: outcome,
    agent: agent?.name || 'Agente não identificado',
  });

  await webhookService.dispatch(
    session.tenantId,
    'agent.call.ended',
    {
      sessionId: session.id,
      callSid: params.callSid,
      direction: metadata.direction ?? 'inbound',
      from: metadata.from ?? null,
      to: metadata.to ?? null,
      status: params.status,
      outcome,
      durationSeconds: params.durationSeconds,
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? null,
      transcript: metadata.turns ?? [],
      context: metadata.context ?? {},
      workflowId: metadata.workflow?.workflowId ?? null,
      workflowVersion: metadata.workflow?.version ?? null,
    },
    metadata.callbackUrl ?? undefined,
  );

  return { found: true as const };
}

export const messages = {
  reprompt: REPROMPT_MESSAGE,
  goodbye: GOODBYE_MESSAGE,
};
