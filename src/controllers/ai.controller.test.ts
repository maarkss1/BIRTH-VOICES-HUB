import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock dependencies
vi.mock('../../lib/voice-runtime/providers/LLMGateway.js', () => ({
  llmProviderGateway: {
    processRequest: vi.fn(),
  },
}));

vi.mock('../services/settingService.js', () => ({
  getAiConsent: vi.fn(),
  grantAiConsent: vi.fn(),
  revokeAiConsent: vi.fn(),
}));

const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
const mockGenerateVideos = vi.fn();
const mockGetVideosOperation = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(function () {
      return {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: mockGenerateContentStream,
          generateVideos: mockGenerateVideos,
        },
        operations: {
          getVideosOperation: mockGetVideosOperation,
        },
      };
    }),
    GenerateVideosOperation: vi.fn().mockImplementation(function (this: { name?: string }) {
      this.name = '';
    }),
  };
});

import { llmProviderGateway } from '../../lib/voice-runtime/providers/LLMGateway.js';
import { getAiConsent, grantAiConsent, revokeAiConsent } from '../services/settingService.js';
import {
  chatHandler,
  getAiConsentHandler,
  setAiConsentHandler,
  ttsHandler,
  generateMusicHandler,
  generateVideoHandler,
  videoStatusHandler,
  refactorWorkflowHandler,
  generateWorkflowHandler,
} from './ai.controller.js';

function fakeResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
  };
}

describe('ai.controller', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-gemini-key' };
  });

  describe('chatHandler', () => {
    it('returns 400 when currentMessages has no user message', async () => {
      const req = {
        tenantId: 'tenant-1',
        body: { currentMessages: [{ role: 'agent', text: 'Olá!' }] },
      } as unknown as Request;
      const res = fakeResponse();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'currentMessages deve conter ao menos uma mensagem do usuário.',
      }));
    });

    it('delegates to llmProviderGateway with GoogleGemini and tenantId', async () => {
      const mockResult: import('../../lib/voice-runtime/providers/LLMGateway.js').GatewayResponse = {
        text: 'Resposta do modelo',
        providerUsed: 'GoogleGemini',
        latencyMs: 120,
        tokensUsed: 30,
        costUSD: 0.0001,
        fromFallback: false,
      };
      vi.mocked(llmProviderGateway.processRequest).mockResolvedValue(mockResult);

      const req = {
        tenantId: 'tenant-abc',
        body: {
          prompt: 'Você é um assistente prestativo',
          currentMessages: [
            { role: 'user', text: 'Qual o horário de funcionamento?' },
          ],
        },
      } as unknown as Request;
      const res = fakeResponse();

      await chatHandler(req, res);

      expect(llmProviderGateway.processRequest).toHaveBeenCalledWith(
        'Qual o horário de funcionamento?',
        'GoogleGemini',
        'Você é um assistente prestativo',
        'tenant-abc'
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('returns 500 when gateway throws', async () => {
      vi.mocked(llmProviderGateway.processRequest).mockRejectedValue(new Error('Gateway failure'));

      const req = {
        tenantId: 'tenant-1',
        body: {
          currentMessages: [{ role: 'user', text: 'Oi' }],
        },
      } as unknown as Request;
      const res = fakeResponse();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Gateway failure' });
    });
  });

  describe('getAiConsentHandler and setAiConsentHandler', () => {
    it('returns the current consent record', async () => {
      const mockRecord = {
        granted: true,
        grantedAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
        grantedByUserId: 'user-admin',
      };
      vi.mocked(getAiConsent).mockResolvedValue(mockRecord);

      const req = { tenantId: 'tenant-1' } as unknown as Request;
      const res = fakeResponse();

      await getAiConsentHandler(req, res);

      expect(getAiConsent).toHaveBeenCalledWith('tenant-1');
      expect(res.json).toHaveBeenCalledWith({ consent: mockRecord });
    });

    it('rejects non-boolean granted with 400', async () => {
      const req = {
        tenantId: 'tenant-1',
        body: { granted: 'yes' },
      } as unknown as Request;
      const res = fakeResponse();

      await setAiConsentHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '"granted" deve ser um booleano.' });
    });

    it('calls grantAiConsent when granted is true', async () => {
      const mockRecord = {
        granted: true,
        grantedAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
        grantedByUserId: 'user-admin',
      };
      vi.mocked(grantAiConsent).mockResolvedValue(mockRecord);

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-admin' },
        body: { granted: true },
      } as unknown as Request;
      const res = fakeResponse();

      await setAiConsentHandler(req, res);

      expect(grantAiConsent).toHaveBeenCalledWith('tenant-1', 'user-admin');
      expect(res.json).toHaveBeenCalledWith({ success: true, consent: mockRecord });
    });

    it('calls revokeAiConsent when granted is false', async () => {
      const mockRecord = {
        granted: false,
        grantedAt: null,
        revokedAt: '2026-01-01T00:00:00.000Z',
        grantedByUserId: 'user-admin',
      };
      vi.mocked(revokeAiConsent).mockResolvedValue(mockRecord);

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-admin' },
        body: { granted: false },
      } as unknown as Request;
      const res = fakeResponse();

      await setAiConsentHandler(req, res);

      expect(revokeAiConsent).toHaveBeenCalledWith('tenant-1', 'user-admin');
      expect(res.json).toHaveBeenCalledWith({ success: true, consent: mockRecord });
    });
  });

  describe('ttsHandler', () => {
    it('returns empty audioBase64', async () => {
      const req = {} as Request;
      const res = fakeResponse();

      await ttsHandler(req, res);

      expect(res.json).toHaveBeenCalledWith({ audioBase64: '' });
    });
  });

  describe('generateMusicHandler', () => {
    it('returns 500 when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;
      const req = { body: { prompt: 'Ambient music' } } as Request;
      const res = fakeResponse();

      await generateMusicHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Chave da API Gemini não configurada.' });
    });

    it('streams audio chunks from Lyria model and returns base64 and mimeType', async () => {
      mockGenerateContentStream.mockResolvedValue([
        {
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { data: 'CHUNK1', mimeType: 'audio/mp3' } },
                ],
              },
            },
          ],
        },
        {
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { data: 'CHUNK2' } },
                ],
              },
            },
          ],
        },
      ]);

      const req = { body: { prompt: 'Jazz piano' } } as Request;
      const res = fakeResponse();

      await generateMusicHandler(req, res);

      expect(mockGenerateContentStream).toHaveBeenCalledWith({
        model: 'lyria-3-clip-preview',
        contents: 'Jazz piano',
      });
      expect(res.json).toHaveBeenCalledWith({
        audioBase64: 'CHUNK1CHUNK2',
        mimeType: 'audio/mp3',
      });
    });
  });

  describe('generateVideoHandler and videoStatusHandler', () => {
    it('calls generateVideos and returns operationName', async () => {
      mockGenerateVideos.mockResolvedValue({ name: 'operations/video-123' });

      const req = {
        body: { prompt: 'A sunset over the mountains', imageBytes: 'abc', mimeType: 'image/jpeg' },
      } as Request;
      const res = fakeResponse();

      await generateVideoHandler(req, res);

      expect(res.json).toHaveBeenCalledWith({ operationName: 'operations/video-123' });
    });

    it('checks video status via getVideosOperation', async () => {
      mockGetVideosOperation.mockResolvedValue({ done: true, error: null });

      const req = { body: { operationName: 'operations/video-123' } } as Request;
      const res = fakeResponse();

      await videoStatusHandler(req, res);

      expect(res.json).toHaveBeenCalledWith({ done: true, error: null });
    });
  });

  describe('refactorWorkflowHandler', () => {
    it('returns 500 when GEMINI_API_KEY is missing', async () => {
      delete process.env.GEMINI_API_KEY;
      const req = { body: { mode: 'simplify', nodes: [] } } as Request;
      const res = fakeResponse();

      await refactorWorkflowHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Chave da API Gemini não configurada.' });
    });

    it('returns refactored nodes parsed from Gemini model JSON output', async () => {
      const mockResult = {
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            position: { x: 50, y: 300 },
            data: { label: 'Início Otimizado', category: 'Start', config: {} },
          },
        ],
      };
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResult),
      });

      const req = {
        body: {
          mode: 'simplify',
          nodes: [{ id: 'start-1', type: 'start', position: { x: 50, y: 300 }, data: { label: 'Start', category: 'Start', config: {} } }],
        },
      } as Request;
      const res = fakeResponse();

      await refactorWorkflowHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('generateWorkflowHandler', () => {
    it('returns generated workflow with nodes and edges', async () => {
      const mockWorkflow = {
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            position: { x: 50, y: 300 },
            data: { label: 'Trigger', category: 'Start', config: {} },
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'start-1',
            target: 'prompt-1',
            type: 'studioEdge',
          },
        ],
      };
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockWorkflow),
      });

      const req = {
        body: { prompt: 'Crie um fluxo de agendamento de consultas médicas' },
      } as Request;
      const res = fakeResponse();

      await generateWorkflowHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(mockWorkflow);
    });
  });
});
