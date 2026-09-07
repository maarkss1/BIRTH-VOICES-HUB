import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/voice.service.js', () => ({
  voiceProspectingService: { triggerOutboundCall: vi.fn() },
  BlandConfigurationError: class BlandConfigurationError extends Error {},
  ExternalAiConsentRequiredError: class ExternalAiConsentRequiredError extends Error {},
}));

vi.mock('../lib/webhookIdempotency.js', () => ({
  IdempotencyCheckFailedError: class IdempotencyCheckFailedError extends Error {},
  beginBlandCallbackProcessing: vi.fn(),
  completeBlandCallbackProcessing: vi.fn(),
  releaseBlandCallbackProcessing: vi.fn(),
}));

vi.mock('../../../repositories/atlasGRCallResultRepository.js', () => ({
  upsertAtlasGRCallResult: vi.fn(),
}));

import { voiceProspectingService } from '../services/voice.service.js';
import {
  beginBlandCallbackProcessing,
  completeBlandCallbackProcessing,
  releaseBlandCallbackProcessing,
} from '../lib/webhookIdempotency.js';
import { upsertAtlasGRCallResult } from '../../../repositories/atlasGRCallResultRepository.js';
import atlasgrRoutes from './atlasgr.routes.js';

const mockTrigger = vi.mocked(voiceProspectingService.triggerOutboundCall);
const mockBeginCallback = vi.mocked(beginBlandCallbackProcessing);
const mockCompleteCallback = vi.mocked(completeBlandCallbackProcessing);
const mockReleaseCallback = vi.mocked(releaseBlandCallbackProcessing);
const mockUpsertCallResult = vi.mocked(upsertAtlasGRCallResult);

const ORIGINAL_ENV = { ...process.env };
const SECRET = 'shared-secret-for-tests';
const validPayload = { phone_number: '+5511999998888', name: 'Fulano', company: 'Acme' };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', atlasgrRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ATLASGR_WEBHOOK_SECRET = SECRET;
  process.env.ATLASGR_BASE_URL = 'https://atlasgr.example.com';
  process.env.BLAND_WEBHOOK_TOKEN = 'callback-token';
  mockBeginCallback.mockResolvedValue('acquired');
  mockCompleteCallback.mockResolvedValue(undefined);
  mockReleaseCallback.mockResolvedValue(undefined);
  mockUpsertCallResult.mockResolvedValue(undefined as never);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('POST /api/webhook/atlasgr/outbound — authentication', () => {
  it('rejects a request with no shared-secret header', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/webhook/atlasgr/outbound').send(validPayload);
    expect(res.status).toBe(401);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong shared secret', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhook/atlasgr/outbound')
      .set('x-atlasgr-webhook-secret', 'wrong-secret')
      .send(validPayload);
    expect(res.status).toBe(401);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('fails closed (503) when ATLASGR_WEBHOOK_SECRET is not configured server-side', async () => {
    delete process.env.ATLASGR_WEBHOOK_SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhook/atlasgr/outbound')
      .set('x-atlasgr-webhook-secret', 'anything')
      .send(validPayload);
    expect(res.status).toBe(503);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('accepts a request with the correct shared secret and a valid payload', async () => {
    mockTrigger.mockResolvedValue({ success: true, duplicate: false, message: 'ok', callId: 'c1', status: 'queued' });
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhook/atlasgr/outbound')
      .set('x-atlasgr-webhook-secret', SECRET)
      .send(validPayload);
    expect(res.status).toBe(200);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/webhook/atlasgr/outbound — payload validation', () => {
  it('rejects a payload missing required fields', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhook/atlasgr/outbound')
      .set('x-atlasgr-webhook-secret', SECRET)
      .send({ phone_number: '+5511999998888' });
    expect(res.status).toBe(400);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('rejects an unexpected extra field (schema is strict)', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhook/atlasgr/outbound')
      .set('x-atlasgr-webhook-secret', SECRET)
      .send({ ...validPayload, unexpected_field: 'x' });
    expect(res.status).toBe(400);
  });

  it('accepts an optional lead_id for stronger idempotency', async () => {
    mockTrigger.mockResolvedValue({ success: true, duplicate: false, message: 'ok' });
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhook/atlasgr/outbound')
      .set('x-atlasgr-webhook-secret', SECRET)
      .send({ ...validPayload, lead_id: 'lead-42' });
    expect(res.status).toBe(200);
    expect(mockTrigger).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 'lead-42' }));
  });
});

describe('POST /api/webhook/atlasgr/outbound — error handling', () => {
  it('reports a downstream failure as 502 without leaking internal error details', async () => {
    mockTrigger.mockRejectedValue(new Error('Bland AI internal failure with sensitive stack info'));
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhook/atlasgr/outbound')
      .set('x-atlasgr-webhook-secret', SECRET)
      .send(validPayload);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('sensitive stack info');
  });
});

describe('POST /api/webhooks/bland/:token', () => {
  it('rejects an invalid token', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/bland/wrong-token').send({ call_id: 'c1' });
    expect(res.status).toBe(403);
  });

  it('fails closed (503) when BLAND_WEBHOOK_TOKEN is not configured server-side', async () => {
    delete process.env.BLAND_WEBHOOK_TOKEN;
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/bland/anything').send({ call_id: 'c1' });
    expect(res.status).toBe(503);
  });

  it('fails closed when the AtlasGR forwarding destination is missing', async () => {
    delete process.env.ATLASGR_BASE_URL;
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/bland/callback-token').send({ call_id: 'c1', status: 'completed' });
    expect(res.status).toBe(503);
    expect(mockBeginCallback).not.toHaveBeenCalled();
  });

  it('accepts a valid token/payload, forwards once and marks the callback completed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const app = buildApp();

    const res = await request(app).post('/api/webhooks/bland/callback-token').send({
      call_id: 'c1',
      status: 'completed',
      summary: 'Lead qualificado',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: false });
    expect(mockBeginCallback).toHaveBeenCalledWith('c1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://atlasgr.example.com/api/webhooks/voice-result',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-atlasgr-webhook-secret': SECRET,
          'x-idempotency-key': 'bland-call-result:c1',
        }),
      }),
    );
    expect(mockCompleteCallback).toHaveBeenCalledWith('c1');
    expect(mockReleaseCallback).not.toHaveBeenCalled();
    expect(mockUpsertCallResult).toHaveBeenCalledWith({
      callId: 'c1',
      status: 'completed',
      completed: true,
      callLength: null,
      leadId: null,
      tenantId: null,
    });
  });

  it('persists the call result with the configured tenant id as best effort', async () => {
    process.env.ATLASGR_TENANT_ID = 'tenant-123';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const app = buildApp();

    const res = await request(app).post('/api/webhooks/bland/callback-token').send({
      call_id: 'c1',
      status: 'completed',
      call_length: 42,
      variables: { lead_id: 'lead-1' },
    });

    expect(res.status).toBe(200);
    expect(mockUpsertCallResult).toHaveBeenCalledWith({
      callId: 'c1',
      status: 'completed',
      completed: true,
      callLength: 42,
      leadId: 'lead-1',
      tenantId: 'tenant-123',
    });
  });

  it('does not fail the callback response when persisting the call result fails', async () => {
    mockUpsertCallResult.mockRejectedValue(new Error('db unavailable'));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const app = buildApp();

    const res = await request(app).post('/api/webhooks/bland/callback-token').send({
      call_id: 'c1',
      status: 'completed',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: false });
    // Let the fire-and-forget persistence rejection settle before the test ends.
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('does not persist a call result for a duplicate/already-processed callback', async () => {
    mockBeginCallback.mockResolvedValue('duplicate');
    const app = buildApp();

    await request(app).post('/api/webhooks/bland/callback-token').send({ call_id: 'c1', status: 'completed' });

    expect(mockUpsertCallResult).not.toHaveBeenCalled();
  });

  it('returns a successful no-op for an already completed callback', async () => {
    mockBeginCallback.mockResolvedValue('duplicate');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const app = buildApp();

    const res = await request(app).post('/api/webhooks/bland/callback-token').send({ call_id: 'c1', status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('releases the processing lock when AtlasGR does not acknowledge the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const app = buildApp();

    const res = await request(app).post('/api/webhooks/bland/callback-token').send({ call_id: 'c1', status: 'completed' });

    expect(res.status).toBe(502);
    expect(mockReleaseCallback).toHaveBeenCalledWith('c1');
    expect(mockCompleteCallback).not.toHaveBeenCalled();
  });

  it('rejects a payload without call_id', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/bland/callback-token').send({ status: 'completed' });
    expect(res.status).toBe(400);
  });
});