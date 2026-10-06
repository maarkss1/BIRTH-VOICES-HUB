import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { dialStatusHandler, gatherHandler } from './telephony.controller.js';

vi.mock('../services/telephonyService.js', () => ({
  startCall: vi.fn(),
  startOutboundCall: vi.fn(),
  handleTurn: vi.fn(),
  endCall: vi.fn(),
  messages: { reprompt: 'Pode repetir?', goodbye: 'Até logo.' },
}));

import { handleTurn } from '../services/telephonyService.js';
const mockHandleTurn = vi.mocked(handleTurn);

function fakeRes() {
  const res = {
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & { type: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };
}

describe('telephony.controller — Dial status callback & action configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('gatherHandler transfer action attribute', () => {
    it('configures the action URL pointing to /telephony/twilio/dial-status with encoded sessionId', async () => {
      mockHandleTurn.mockResolvedValue({
        found: true,
        reply: 'Transferindo para a fila de atendimento.',
        shouldEnd: false,
        transferDetails: {
          to: '+5511999991234',
          timeoutSec: 20,
          record: true,
          message: 'Transferindo para a fila de atendimento.',
        },
      });

      const req = {
        query: { sessionId: 'sess-abc-123' },
        body: { SpeechResult: 'humano' },
      } as unknown as Request;
      const res = fakeRes();

      await gatherHandler(req, res);

      const xml = res.send.mock.calls[0][0] as string;
      expect(xml).toContain('<Dial');
      expect(xml).toContain('action="/api/telephony/twilio/dial-status?sessionId=sess-abc-123"');
      expect(xml).toContain('method="POST"');
      expect(xml).toContain('record="record-from-answer"');
      expect(xml).toContain('+5511999991234');
    });
  });

  describe('dialStatusHandler', () => {
    it('returns a clean hangup when DialCallStatus is "completed"', async () => {
      const req = {
        query: { sessionId: 'sess-abc-123' },
        body: {
          DialCallStatus: 'completed',
          DialCallDuration: '45',
          DialCallSid: 'CA123456789',
        },
      } as unknown as Request;
      const res = fakeRes();

      await dialStatusHandler(req, res);

      expect(res.type).toHaveBeenCalledWith('text/xml');
      const xml = res.send.mock.calls[0][0] as string;
      expect(xml).toContain('<Hangup/>');
      expect(xml).not.toContain('<Say');
    });

    it('speaks a fallback apology and hangs up when DialCallStatus is "busy"', async () => {
      const req = {
        query: { sessionId: 'sess-abc-123' },
        body: {
          DialCallStatus: 'busy',
          DialCallDuration: '0',
        },
      } as unknown as Request;
      const res = fakeRes();

      await dialStatusHandler(req, res);

      expect(res.type).toHaveBeenCalledWith('text/xml');
      const xml = res.send.mock.calls[0][0] as string;
      expect(xml).toContain('Não foi possível conectar com um atendente no momento.');
      expect(xml).toContain('<Hangup/>');
    });

    it('speaks a fallback apology and hangs up when DialCallStatus is "no-answer"', async () => {
      const req = {
        query: { sessionId: 'sess-abc-123' },
        body: {
          DialCallStatus: 'no-answer',
          DialCallDuration: '0',
        },
      } as unknown as Request;
      const res = fakeRes();

      await dialStatusHandler(req, res);

      const xml = res.send.mock.calls[0][0] as string;
      expect(xml).toContain('Não foi possível conectar com um atendente no momento.');
      expect(xml).toContain('<Hangup/>');
    });

    it('speaks a fallback apology and hangs up when DialCallStatus is "failed"', async () => {
      const req = {
        query: { sessionId: 'sess-abc-123' },
        body: {
          DialCallStatus: 'failed',
          DialCallDuration: '0',
        },
      } as unknown as Request;
      const res = fakeRes();

      await dialStatusHandler(req, res);

      const xml = res.send.mock.calls[0][0] as string;
      expect(xml).toContain('Não foi possível conectar com um atendente no momento.');
      expect(xml).toContain('<Hangup/>');
    });
  });
});
