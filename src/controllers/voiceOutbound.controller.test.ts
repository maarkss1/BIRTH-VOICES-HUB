import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { initiateOutboundCallHandler } from './voiceOutbound.controller.js';
import {
  initiateOutboundCall,
  AgentNotFoundError,
  DuplicateCallError,
} from '../services/outboundCallService.js';
import { TwilioNotConfiguredError } from '../services/twilioClient.js';

vi.mock('../services/outboundCallService.js', () => ({
  initiateOutboundCall: vi.fn(),
  AgentNotFoundError: class AgentNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AgentNotFoundError';
    }
  },
  DuplicateCallError: class DuplicateCallError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DuplicateCallError';
    }
  },
}));

vi.mock('../services/twilioClient.js', () => ({
  TwilioNotConfiguredError: class TwilioNotConfiguredError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TwilioNotConfiguredError';
    }
  },
}));

function fakeResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('voiceOutbound.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initiateOutboundCallHandler', () => {
    it('returns 400 when agentId is missing', async () => {
      const req = {
        tenantId: 'tenant-1',
        body: { targetNumber: '+5511999998888' },
      } as unknown as Request;
      const res = fakeResponse();

      await initiateOutboundCallHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringMatching(/expected string|agentId/i) })
      );
    });

    it('returns 400 when targetNumber is not in E.164 format', async () => {
      const req = {
        tenantId: 'tenant-1',
        body: { agentId: 'agent-1', targetNumber: '11999998888' },
      } as unknown as Request;
      const res = fakeResponse();

      await initiateOutboundCallHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringMatching(/E\.164/i) })
      );
    });

    it('returns 202 and starts call on valid payload', async () => {
      vi.mocked(initiateOutboundCall).mockResolvedValue({
        sessionId: 'sess-123',
        callSid: 'CA1234567890',
        status: 'queued',
      });

      const req = {
        tenantId: 'tenant-1',
        body: {
          agentId: 'agent-1',
          targetNumber: '+5511999998888',
          context: { leadName: 'Maria Silva' },
          callbackUrl: 'https://example.com/webhook',
        },
      } as unknown as Request;
      const res = fakeResponse();

      await initiateOutboundCallHandler(req, res);

      expect(initiateOutboundCall).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        targetNumber: '+5511999998888',
        context: { leadName: 'Maria Silva' },
        callbackUrl: 'https://example.com/webhook',
      });
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        sessionId: 'sess-123',
        callSid: 'CA1234567890',
        status: 'queued',
      });
    });

    it('returns 404 when agent is not found', async () => {
      vi.mocked(initiateOutboundCall).mockRejectedValue(
        new AgentNotFoundError('Agente não encontrado no tenant.')
      );

      const req = {
        tenantId: 'tenant-1',
        body: { agentId: 'agent-missing', targetNumber: '+5511999998888' },
      } as unknown as Request;
      const res = fakeResponse();

      await initiateOutboundCallHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agente não encontrado no tenant.' });
    });

    it('returns 409 on duplicate call conflict', async () => {
      vi.mocked(initiateOutboundCall).mockRejectedValue(
        new DuplicateCallError('Chamada em andamento para este número.')
      );

      const req = {
        tenantId: 'tenant-1',
        body: { agentId: 'agent-1', targetNumber: '+5511999998888' },
      } as unknown as Request;
      const res = fakeResponse();

      await initiateOutboundCallHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Chamada em andamento para este número.' });
    });

    it('returns 503 when Twilio credentials are not configured', async () => {
      vi.mocked(initiateOutboundCall).mockRejectedValue(
        new TwilioNotConfiguredError('Twilio não configurado para o ambiente.')
      );

      const req = {
        tenantId: 'tenant-1',
        body: { agentId: 'agent-1', targetNumber: '+5511999998888' },
      } as unknown as Request;
      const res = fakeResponse();

      await initiateOutboundCallHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Twilio não configurado para o ambiente.' });
    });

    it('returns 502 on unexpected telephony provider errors', async () => {
      vi.mocked(initiateOutboundCall).mockRejectedValue(new Error('Twilio upstream 500 error'));

      const req = {
        tenantId: 'tenant-1',
        body: { agentId: 'agent-1', targetNumber: '+5511999998888' },
      } as unknown as Request;
      const res = fakeResponse();

      await initiateOutboundCallHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Não foi possível iniciar a chamada no provedor de telefonia.',
      });
    });
  });
});
