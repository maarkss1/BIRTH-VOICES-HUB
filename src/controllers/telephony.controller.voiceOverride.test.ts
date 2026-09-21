import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Same mocking shape as `__tests__/telephony.controller.test.ts` (Agente 08) — kept minimal to
// only what this file exercises (`handleTurn`'s `voiceOverride` propagation, Onda 6 —
// `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`).
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

describe('telephony.controller gatherHandler — voiceOverride (Onda 6)', () => {
  it('renders a <Say voice="Polly.Camila"> when handleTurn resolves a recognized Twilio voice', async () => {
    mockHandleTurn.mockResolvedValue({
      found: true,
      reply: 'Claro, posso te ajudar.',
      shouldEnd: false,
      voiceOverride: { voice: 'Polly.Camila', language: 'pt-BR' },
    });
    const req = { query: { sessionId: 'sess-1' }, body: { SpeechResult: 'Oi' } } as unknown as Request;
    const res = fakeRes();

    await gatherHandler(req, res);

    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).toContain('voice="Polly.Camila"');
    expect(xml).toContain('language="pt-BR"');
    expect(xml).toContain('Claro, posso te ajudar.');
  });

  it('applies the voice override on the final <Say> too when the turn ends the call', async () => {
    mockHandleTurn.mockResolvedValue({
      found: true,
      reply: 'Até mais!',
      shouldEnd: true,
      voiceOverride: { voice: 'Polly.Vitoria' },
    });
    const req = { query: { sessionId: 'sess-1' }, body: { SpeechResult: 'Tchau' } } as unknown as Request;
    const res = fakeRes();

    await gatherHandler(req, res);

    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).toContain('voice="Polly.Vitoria"');
    expect(xml).toContain('<Hangup');
  });

  it('keeps the default Twilio voice (no voice attribute) when handleTurn has no override', async () => {
    mockHandleTurn.mockResolvedValue({ found: true, reply: 'Sem voz customizada.', shouldEnd: false });
    const req = { query: { sessionId: 'sess-1' }, body: { SpeechResult: 'Oi' } } as unknown as Request;
    const res = fakeRes();

    await gatherHandler(req, res);

    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).not.toContain('voice=');
    expect(xml).toContain('language="pt-BR"');
  });
});
