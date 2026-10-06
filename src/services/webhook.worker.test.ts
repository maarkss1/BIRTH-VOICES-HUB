import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// vi.mock(...) factories are hoisted above every other top-level statement in this file, so
// anything they reference (the class included — a plain `class Foo {}` declaration is not
// automatically hoisted along with them the way a `const mockXxx = ...` binding is) must itself be
// produced inside vi.hoisted(), which runs before the hoisted mocks. See
// https://vitest.dev/api/vi.html#vi-hoisted.
const { MockUnrecoverableError } = vi.hoisted(() => ({
  MockUnrecoverableError: class MockUnrecoverableError extends Error {},
}));

const mockOn = vi.fn();
let lastProcessor: ((job: { data: unknown; id?: string }) => unknown) | undefined;

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function Worker(_name: string, processor: (job: unknown) => unknown) {
    lastProcessor = processor as (job: { data: unknown; id?: string }) => unknown;
    return { on: mockOn };
  }),
  UnrecoverableError: MockUnrecoverableError,
}));

vi.mock('../lib/env.js', () => ({
  getRedisConnectionOptions: () => ({ host: 'localhost', port: 6379 }),
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockFindActiveSigningSecretHash = vi.fn();
vi.mock('./webhookEndpointService.js', () => ({
  findActiveSigningSecretHash: (...args: unknown[]) => mockFindActiveSigningSecretHash(...args),
}));

const mockRecordDeliveryResult = vi.fn().mockResolvedValue(undefined);
vi.mock('../repositories/webhookEndpointRepository.js', () => ({
  recordDeliveryResult: (...args: unknown[]) => mockRecordDeliveryResult(...args),
}));

import { startWebhookWorker } from './webhook.worker.js';
import type { WebhookPayload } from './webhook.service.js';

const ORIGINAL_ENV = { ...process.env };
const mockFetch = vi.fn();

function makePayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    id: 'evt_1',
    type: 'call.completed',
    timestamp: '2026-01-01T00:00:00Z',
    tenantId: 'tenant-a',
    data: { sessionId: 's1' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lastProcessor = undefined;
  mockRecordDeliveryResult.mockResolvedValue(undefined);
  mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
  vi.stubGlobal('fetch', mockFetch);
  process.env.NODE_ENV = 'production';
  delete process.env.WEBHOOK_SIGNING_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('webhook.worker SSRF defense', () => {
  it('refuses delivery to a private/reserved host without ever calling fetch', async () => {
    startWebhookWorker();
    expect(lastProcessor).toBeDefined();

    await expect(
      lastProcessor!({ id: 'job-1', data: { url: 'https://169.254.169.254/latest/meta-data', payload: makePayload() } }),
    ).rejects.toThrow(MockUnrecoverableError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses a plain-http target in production', async () => {
    process.env.NODE_ENV = 'production';
    startWebhookWorker();

    await expect(
      lastProcessor!({ id: 'job-2', data: { url: 'http://example.com/hook', payload: makePayload() } }),
    ).rejects.toThrow(MockUnrecoverableError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('webhook.worker HMAC signing — legacy global secret (no endpointId)', () => {
  it('signs with WEBHOOK_SIGNING_SECRET and the header verifies against the exact raw body sent', async () => {
    process.env.WEBHOOK_SIGNING_SECRET = 'deployment-secret';
    startWebhookWorker();

    const payload = makePayload();
    await lastProcessor!({ id: 'job-3', data: { url: 'https://example.com/hook', payload } });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const sentBody = init.body as string;
    const sentSignature = init.headers['x-birthvoices-signature'];

    const expected = createHmac('sha256', 'deployment-secret').update(sentBody).digest('hex');
    expect(sentSignature).toBe(expected);
    expect(mockFindActiveSigningSecretHash).not.toHaveBeenCalled();
  });

  it('sends unsigned (no header) when WEBHOOK_SIGNING_SECRET is unset', async () => {
    startWebhookWorker();
    await lastProcessor!({ id: 'job-4', data: { url: 'https://example.com/hook', payload: makePayload() } });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['x-birthvoices-signature']).toBeUndefined();
  });
});

describe('webhook.worker HMAC signing — per-tenant endpoint (endpointId present)', () => {
  it('resolves the secret by endpointId and signs with THAT endpoint\'s secretHash, not the global one', async () => {
    process.env.WEBHOOK_SIGNING_SECRET = 'deployment-secret-must-not-be-used-here';
    mockFindActiveSigningSecretHash.mockImplementation(async (endpointId: string) =>
      endpointId === 'ep-1' ? 'secret-hash-for-ep-1' : null,
    );

    startWebhookWorker();
    const payload = makePayload();
    await lastProcessor!({ id: 'job-5', data: { url: 'https://a.example.com/hook', payload, endpointId: 'ep-1' } });

    expect(mockFindActiveSigningSecretHash).toHaveBeenCalledWith('ep-1');
    const [, init] = mockFetch.mock.calls[0];
    const expected = createHmac('sha256', 'secret-hash-for-ep-1').update(init.body as string).digest('hex');
    expect(init.headers['x-birthvoices-signature']).toBe(expected);
    expect(init.headers['x-birthvoices-signature']).not.toBe(
      createHmac('sha256', 'deployment-secret-must-not-be-used-here').update(init.body as string).digest('hex'),
    );
  });

  it('a different endpoint gets a different signature over the same body (secrets never cross endpoints)', async () => {
    mockFindActiveSigningSecretHash.mockImplementation(async (endpointId: string) =>
      endpointId === 'ep-1' ? 'hash-for-ep-1' : 'hash-for-ep-2',
    );
    startWebhookWorker();

    const payload = makePayload();
    await lastProcessor!({ id: 'job-6', data: { url: 'https://a.example.com/hook', payload, endpointId: 'ep-1' } });
    const sigForEp1 = mockFetch.mock.calls[0][1].headers['x-birthvoices-signature'];

    mockFetch.mockClear();
    await lastProcessor!({ id: 'job-7', data: { url: 'https://b.example.com/hook', payload, endpointId: 'ep-2' } });
    const sigForEp2 = mockFetch.mock.calls[0][1].headers['x-birthvoices-signature'];

    expect(sigForEp1).not.toBe(sigForEp2);
  });

  it('fails the job immediately (no fetch, no retry) when the endpoint was deleted/deactivated since enqueue', async () => {
    mockFindActiveSigningSecretHash.mockResolvedValue(null);
    startWebhookWorker();

    await expect(
      lastProcessor!({ id: 'job-8', data: { url: 'https://a.example.com/hook', payload: makePayload(), endpointId: 'gone' } }),
    ).rejects.toThrow(MockUnrecoverableError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('records a best-effort "delivered" delivery result after a successful per-endpoint delivery', async () => {
    mockFindActiveSigningSecretHash.mockResolvedValue('some-hash');
    startWebhookWorker();

    await lastProcessor!({ id: 'job-9', data: { url: 'https://a.example.com/hook', payload: makePayload(), endpointId: 'ep-1' } });
    // recordDeliveryResult is fire-and-forget (.catch(() => undefined)) — flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRecordDeliveryResult).toHaveBeenCalledWith('ep-1', 'delivered');
  });

  it('never calls recordDeliveryResult for a legacy delivery with no endpointId', async () => {
    startWebhookWorker();
    await lastProcessor!({ id: 'job-10', data: { url: 'https://example.com/hook', payload: makePayload() } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRecordDeliveryResult).not.toHaveBeenCalled();
  });
});

describe('webhook.worker delivery failure bookkeeping', () => {
  it('records "failed" on the final attempt only, via the worker "failed" handler', async () => {
    startWebhookWorker();
    expect(mockOn).toHaveBeenCalledWith('failed', expect.any(Function));
    const failedHandler = mockOn.mock.calls.find(([event]) => event === 'failed')![1] as (
      job: unknown,
      err: Error,
    ) => void;

    const job = { id: 'job-11', data: { url: 'https://a.example.com/hook', endpointId: 'ep-1' }, attemptsMade: 5, opts: { attempts: 5 } };
    failedHandler(job, new Error('HTTP 500'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRecordDeliveryResult).toHaveBeenCalledWith('ep-1', 'failed');
  });

  it('does not record "failed" while retry attempts remain', async () => {
    startWebhookWorker();
    const failedHandler = mockOn.mock.calls.find(([event]) => event === 'failed')![1] as (
      job: unknown,
      err: Error,
    ) => void;

    const job = { id: 'job-12', data: { url: 'https://a.example.com/hook', endpointId: 'ep-1' }, attemptsMade: 2, opts: { attempts: 5 } };
    failedHandler(job, new Error('HTTP 500'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRecordDeliveryResult).not.toHaveBeenCalled();
  });
});

describe('webhook.worker delivery failure propagation (retry, not swallowed)', () => {
  it('lets a non-2xx response rejection propagate so BullMQ retries under its own backoff', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
    startWebhookWorker();

    await expect(
      lastProcessor!({ id: 'job-13', data: { url: 'https://example.com/hook', payload: makePayload() } }),
    ).rejects.toThrow('HTTP 500');
  });
});
