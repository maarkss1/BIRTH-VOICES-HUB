import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Same mocking shape as `__tests__/telephony.controller.test.ts` (Agente 08) — see
// `.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md`.
vi.mock('../services/telephonyService.js', () => ({
  startCall: vi.fn(),
  startOutboundCall: vi.fn(),
  handleTurn: vi.fn(),
  endCall: vi.fn(),
  messages: { reprompt: 'Pode repetir?', goodbye: 'Até logo.' },
}));

import { handleTurn } from '../services/telephonyService.js';
import { gatherHandler } from './telephony.controller.js';

const mockHandleTurn = vi.mocked(handleTurn);

function fakeRes() {
  const res = {
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & { type: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('telephony.controller gatherHandler — human_handoff transfer (Onda 6 rodada 2)', () => {
  it('renders <Say> then a real <Dial> to transferDetails.to with the configured timeout', async () => {
    mockHandleTurn.mockResolvedValue({
      found: true,
      reply: 'Aguarde um momento enquanto encaminho sua ligação.',
      shouldEnd: false,
      transferDetails: { to: '+5511999999999', timeoutSec: 25, record: false, message: 'Aguarde um momento enquanto encaminho sua ligação.' },
    });
    const req = { query: { sessionId: 'sess-1' }, body: { SpeechResult: 'Quero falar com alguém' } } as unknown as Request;
    const res = fakeRes();

    await gatherHandler(req, res);

    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).toContain('Aguarde um momento enquanto encaminho sua ligação.');
    expect(xml).toContain('<Dial');
    expect(xml).toContain('timeout="25"');
    expect(xml).toContain('+5511999999999');
    expect(xml).not.toContain('<Gather');
  });

  it('sets record="record-from-answer" when transferDetails.record is true', async () => {
    mockHandleTurn.mockResolvedValue({
      found: true,
      reply: 'Transferindo, aguarde.',
      shouldEnd: false,
      transferDetails: { to: '+5511988887777', timeoutSec: 30, record: true, message: 'Transferindo, aguarde.' },
    });
    const req = { query: { sessionId: 'sess-1' }, body: { SpeechResult: 'ok' } } as unknown as Request;
    const res = fakeRes();

    await gatherHandler(req, res);

    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).toContain('record="record-from-answer"');
  });

  it('omits the record attribute when transferDetails.record is false', async () => {
    mockHandleTurn.mockResolvedValue({
      found: true,
      reply: 'Transferindo, aguarde.',
      shouldEnd: false,
      transferDetails: { to: '+5511988887777', timeoutSec: 30, record: false, message: 'Transferindo, aguarde.' },
    });
    const req = { query: { sessionId: 'sess-1' }, body: { SpeechResult: 'ok' } } as unknown as Request;
    const res = fakeRes();

    await gatherHandler(req, res);

    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).not.toContain('record=');
  });

  it('honors voiceOverride on the transfer <Say> too', async () => {
    mockHandleTurn.mockResolvedValue({
      found: true,
      reply: 'Aguarde, por favor.',
      shouldEnd: false,
      voiceOverride: { voice: 'Polly.Camila', language: 'pt-BR' },
      transferDetails: { to: '+5511977776666', timeoutSec: 30, record: false, message: 'Aguarde, por favor.' },
    });
    const req = { query: { sessionId: 'sess-1' }, body: { SpeechResult: 'ok' } } as unknown as Request;
    const res = fakeRes();

    await gatherHandler(req, res);

    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).toContain('voice="Polly.Camila"');
  });

  it('keeps the normal <Gather> flow (no <Dial>) when handleTurn returns no transferDetails', async () => {
    mockHandleTurn.mockResolvedValue({ found: true, reply: 'Vou te ajudar com isso.', shouldEnd: false });
    const req = { query: { sessionId: 'sess-1' }, body: { SpeechResult: 'Tenho uma dúvida' } } as unknown as Request;
    const res = fakeRes();

    await gatherHandler(req, res);

    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).not.toContain('<Dial');
    expect(xml).toContain('<Gather');
  });
});
