import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  getAiConsent: vi.fn(),
  startLocalSpan: vi.fn(() => 'span-1'),
  endLocalSpan: vi.fn(),
  recordLocalMetric: vi.fn(),
  createMetric: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class FakeGoogleGenAI {
    models = { generateContent: mocks.generateContent };
  },
}));

vi.mock('../src/services/settingService.js', () => ({
  getAiConsent: mocks.getAiConsent,
}));

vi.mock('../src/services/metricService.js', () => ({
  createMetric: mocks.createMetric,
}));

vi.mock('../lib/voice-runtime/otel', () => ({
  SYSTEM_TENANT_ID: 'system',
  otelCollector: {
    startLocalSpan: mocks.startLocalSpan,
    endLocalSpan: mocks.endLocalSpan,
    recordLocalMetric: mocks.recordLocalMetric,
  },
}));

import { llmProviderGateway } from '../lib/voice-runtime/providers/LLMGateway';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startLocalSpan.mockReturnValue('span-1');
  mocks.createMetric.mockResolvedValue({ id: 'metric-1' });
  mocks.getAiConsent.mockResolvedValue({
    granted: true,
    grantedAt: '2026-08-14T12:00:00.000Z',
    revokedAt: null,
    grantedByUserId: 'user-1',
  });
  process.env.OPENAI_API_KEY = 'test-openai';
  process.env.GEMINI_API_KEY = 'test-gemini';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe('LLMProviderGateway failover honesty', () => {
  it('really falls back to Gemini when the preferred provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
    }));
    mocks.generateContent.mockResolvedValue({
      text: 'Resposta do fallback Gemini',
      usageMetadata: { totalTokenCount: 12 },
    });

    const result = await llmProviderGateway.processRequest(
      'Preciso de ajuda',
      'OpenAI',
      'Seja breve.',
      'tenant-failover',
    );

    expect(result.text).toBe('Resposta do fallback Gemini');
    expect(result.providerUsed).toBe('GoogleGemini');
    expect(result.fromFallback).toBe(true);
    expect(mocks.generateContent).toHaveBeenCalledOnce();

    // Real cost/tokens/latency for the successful call get persisted tenant-scoped, with no
    // single-user attribution (an AI provider call isn't a per-user action).
    expect(mocks.createMetric).toHaveBeenCalledWith(
      'tenant-failover',
      null,
      expect.objectContaining({ name: 'ai_call_cost_usd', tags: expect.objectContaining({ provider: 'GoogleGemini', fromFallback: true }) }),
    );
    expect(mocks.createMetric).toHaveBeenCalledWith(
      'tenant-failover',
      null,
      expect.objectContaining({ name: 'ai_call_tokens', value: 12 }),
    );
    expect(mocks.createMetric).toHaveBeenCalledWith(
      'tenant-failover',
      null,
      expect.objectContaining({ name: 'ai_call_latency_ms', value: result.latencyMs }),
    );
  });

  it('reports NONE instead of pretending Gemini succeeded when every provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
    }));
    mocks.generateContent.mockRejectedValue(new Error('Gemini unavailable'));

    const result = await llmProviderGateway.processRequest(
      'Preciso de ajuda',
      'OpenAI',
      'Seja breve.',
      'tenant-total-failure',
    );

    expect(result.providerUsed).toBe('NONE');
    expect(result.costUSD).toBe(0);
    expect(result.fromFallback).toBe(true);
    expect(result.text).toContain('instabilidade técnica');

    // No real provider call succeeded, so there is no real usage/cost to report — never persist a
    // fabricated metric for a call that never actually reached a provider successfully.
    expect(mocks.createMetric).not.toHaveBeenCalled();
  });

  it('never persists AI metrics for the reserved system tenant sentinel (no Tenant row to satisfy the FK)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' }));
    mocks.generateContent.mockResolvedValue({
      text: 'Resposta do sistema',
      usageMetadata: { totalTokenCount: 8 },
    });

    const result = await llmProviderGateway.processRequest('Ping interno', 'OpenAI', 'Seja breve.', 'system');

    expect(result.providerUsed).toBe('GoogleGemini');
    expect(mocks.createMetric).not.toHaveBeenCalled();
  });
});