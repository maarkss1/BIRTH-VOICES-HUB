import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../src/repositories/agentRepository.js', () => ({
  getAgent: vi.fn(),
}));

// initiateOutboundCall no longer calls `findActiveOutboundSessionToNumber` + `createPhoneSession`
// as two separate round-trips (see src/services/outboundCallService.ts) — the double-submit guard
// and the session creation are now one Serializable DB transaction exposed as
// `createOutboundPhoneSessionIfNoneInFlight`. Only mock what the service actually calls.
vi.mock('../src/repositories/sessionRepository.js', () => ({
  createOutboundPhoneSessionIfNoneInFlight: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('../src/services/telephonyProvider.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/telephonyProvider.js')>(
    '../src/services/telephonyProvider.js',
  );
  return { ...actual, getTelephonyProvider: vi.fn() };
});

import { getAgent } from '../src/repositories/agentRepository.js';
import {
  createOutboundPhoneSessionIfNoneInFlight,
  updateSession,
} from '../src/repositories/sessionRepository.js';
import { getTelephonyProvider } from '../src/services/telephonyProvider.js';
import { TwilioNotConfiguredError } from '../src/services/twilioClient.js';
import {
  initiateOutboundCall,
  AgentNotFoundError,
  DuplicateCallError,
} from '../src/services/outboundCallService.js';

const mockGetAgent = vi.mocked(getAgent);
const mockUpdateSession = vi.mocked(updateSession);
const mockCreateOutboundPhoneSession = vi.mocked(createOutboundPhoneSessionIfNoneInFlight);
const mockGetTelephonyProvider = vi.mocked(getTelephonyProvider);

const mockPlaceCall = vi.fn();
const mockAssertConfigured = vi.fn();

type Agent = Awaited<ReturnType<typeof getAgent>>;
type Session = NonNullable<Awaited<ReturnType<typeof createOutboundPhoneSessionIfNoneInFlight>>['session']>;

function agent(overrides: Partial<NonNullable<Agent>> = {}): NonNullable<Agent> {
  return {
    id: 'agent-1',
    tenantId: 'tenant-1',
    userId: null,
    name: 'Catarina SDR',
    model: 'gemini',
    configuration: {},
    phoneNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as NonNullable<Agent>;
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    tenantId: 'tenant-1',
    userId: null,
    agentId: 'agent-1',
    channel: 'phone',
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as Session;
}

function request(overrides: Partial<Parameters<typeof initiateOutboundCall>[0]> = {}) {
  return {
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    targetNumber: '+5511999998888',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertConfigured.mockImplementation(() => {});
  mockGetTelephonyProvider.mockReturnValue({
    name: 'test-provider',
    assertConfigured: mockAssertConfigured,
    placeCall: mockPlaceCall,
  });
  mockGetAgent.mockResolvedValue(agent());
  mockCreateOutboundPhoneSession.mockResolvedValue({ session: session(), inFlight: false });
  mockPlaceCall.mockResolvedValue({ callId: 'CA999', status: 'queued', from: '+5511333333333' });
});

describe('outboundCallService.initiateOutboundCall', () => {
  it('rejects an agent belonging to another tenant without dialing', async () => {
    mockGetAgent.mockResolvedValue(null);

    await expect(initiateOutboundCall(request())).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(mockPlaceCall).not.toHaveBeenCalled();
    expect(mockCreateOutboundPhoneSession).not.toHaveBeenCalled();
  });

  it('refuses to dial a number that already has a call in flight', async () => {
    mockCreateOutboundPhoneSession.mockResolvedValue({ session: null, inFlight: true });

    await expect(initiateOutboundCall(request())).rejects.toBeInstanceOf(DuplicateCallError);
    expect(mockPlaceCall).not.toHaveBeenCalled();
  });

  // The double-submit guard lives in a Serializable DB transaction: two concurrent requests for
  // the same tenant+number can never both observe "free" — Postgres aborts the losing transaction
  // with a serialization failure (Prisma P2034) instead of letting it write a second session. The
  // service must treat that failure exactly like `inFlight: true`, not surface it as a raw 500.
  it('treats a lost concurrent-transaction race (Prisma P2034) as a duplicate call, not a 500', async () => {
    mockCreateOutboundPhoneSession.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock.', {
        code: 'P2034',
        clientVersion: '5.22.0',
      }),
    );

    await expect(initiateOutboundCall(request())).rejects.toBeInstanceOf(DuplicateCallError);
    expect(mockPlaceCall).not.toHaveBeenCalled();
  });

  it('propagates an unrelated database error instead of masking it as a duplicate call', async () => {
    mockCreateOutboundPhoneSession.mockRejectedValue(new Error('connection terminated unexpectedly'));

    await expect(initiateOutboundCall(request())).rejects.toThrow('connection terminated unexpectedly');
    expect(mockPlaceCall).not.toHaveBeenCalled();
  });

  it('does not create a session when the deployment cannot place calls', async () => {
    mockAssertConfigured.mockImplementation(() => {
      throw new TwilioNotConfiguredError('faltando TWILIO_FROM_NUMBER');
    });

    await expect(initiateOutboundCall(request())).rejects.toBeInstanceOf(TwilioNotConfiguredError);
    expect(mockCreateOutboundPhoneSession).not.toHaveBeenCalled();
  });

  it('asks the provider to dial, threading the session id through for the media callback', async () => {
    const result = await initiateOutboundCall(request({ context: { name: 'João' } }));

    expect(result).toEqual({ sessionId: 'sess-1', callSid: 'CA999', status: 'queued' });
    expect(mockPlaceCall).toHaveBeenCalledWith({ to: '+5511999998888', sessionId: 'sess-1' });
  });

  it('stores the session with the call context and callback URL before dialing', async () => {
    await initiateOutboundCall(request({ context: { leadId: 'lead-9' }, callbackUrl: 'https://crm.example.com/hook' }));

    expect(mockCreateOutboundPhoneSession).toHaveBeenCalledWith(
      'tenant-1',
      'agent-1',
      '+5511999998888',
      expect.objectContaining({
        direction: 'outbound',
        to: '+5511999998888',
        context: { leadId: 'lead-9' },
        callbackUrl: 'https://crm.example.com/hook',
      }),
    );
  });

  it('persists the call id and caller ID as soon as the provider accepts the call', async () => {
    await initiateOutboundCall(request());

    expect(mockUpdateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        metadata: expect.objectContaining({ callSid: 'CA999', from: '+5511333333333' }),
      }),
    );
  });

  it('releases the session when the provider rejects the call, so the number is not blocked', async () => {
    mockPlaceCall.mockRejectedValue(new Error('provider: invalid destination'));

    await expect(initiateOutboundCall(request())).rejects.toThrow('provider: invalid destination');
    expect(mockUpdateSession).toHaveBeenCalledWith('sess-1', { status: 'failed' });
  });
});
