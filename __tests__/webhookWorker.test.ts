import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';

// `startWebhookWorker()` builds its job processor as an inline callback passed to
// `new Worker('webhooks', processor, { connection })` — the function under test
// (`isSafeWebhookUrl`) is not exported. To exercise it for real we mock `bullmq`'s `Worker` so the
// constructor never opens a real Redis connection, but capture the exact processor function it
// was given so the test can invoke it directly with a fake `Job`, just like BullMQ would.
// `UnrecoverableError` is re-exported from the *real* `bullmq` module (via `importActual`) so
// `instanceof` checks below are against the same class the worker code throws.
type FakeJob = { id: string; data: { url: string; payload: unknown } };
type Processor = (job: FakeJob) => Promise<void>;

const capturedProcessors: Processor[] = [];

vi.mock('bullmq', async () => {
  const actual = await vi.importActual<typeof import('bullmq')>('bullmq');
  return {
    ...actual,
    Worker: vi.fn().mockImplementation(function (this: unknown, _queueName: string, processor: Processor) {
      capturedProcessors.push(processor);
      return {
        on: vi.fn(),
      };
    }),
  };
});

vi.mock('../src/lib/env.js', () => ({
  getRedisConnectionOptions: () => ({ host: 'localhost', port: 6379 }),
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { startWebhookWorker } from '../src/services/webhook.worker.js';
import { WebhookPayload } from '../src/services/webhook.service.js';

function makePayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    id: 'evt_test',
    type: 'call.completed',
    timestamp: new Date().toISOString(),
    tenantId: 'tenant-1',
    data: {},
    ...overrides,
  };
}

function makeJob(url: string, payload: WebhookPayload = makePayload()) {
  return { id: 'job-1', data: { url, payload } };
}

describe('webhook.worker — isSafeWebhookUrl (SSRF guard)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedProcessors.length = 0;
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  function getProcessor() {
    startWebhookWorker();
    expect(capturedProcessors).toHaveLength(1);
    return capturedProcessors[0];
  }

  describe('private / reserved / cloud-metadata hosts are rejected', () => {
    const maliciousUrls = [
      // Classic cloud metadata SSRF target (AWS/GCP instance metadata endpoint).
      'http://169.254.169.254/latest/meta-data/',
      'https://169.254.169.254/computeMetadata/v1/',
      // Loopback.
      'http://127.0.0.1:8080/webhook',
      'https://127.0.0.1/webhook',
      'http://localhost:3000/webhook',
      // RFC1918 private ranges.
      'http://10.0.0.5/webhook',
      'https://172.16.0.1/webhook',
      'http://192.168.1.1/webhook',
      // IPv6 loopback.
      'https://[::1]/webhook',
    ];

    for (const url of maliciousUrls) {
      it(`rejects ${url} with UnrecoverableError and never calls fetch`, async () => {
        const processor = getProcessor();
        const job = makeJob(url);

        await expect(processor(job)).rejects.toBeInstanceOf(UnrecoverableError);
        await expect(processor(job)).rejects.toThrow(/not allowed/i);
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }
  });

  describe('non-HTTPS URLs are rejected in production', () => {
    it('rejects a plain-HTTP public URL with UnrecoverableError when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      const processor = getProcessor();
      const job = makeJob('http://example.com/webhook');

      await expect(processor(job)).rejects.toBeInstanceOf(UnrecoverableError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not reject a plain-HTTP public URL outside of production (dev/test convenience)', async () => {
      process.env.NODE_ENV = 'test';
      const processor = getProcessor();
      const job = makeJob('http://example.com/webhook');

      await processor(job);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('http://example.com/webhook', expect.any(Object));
    });

    it('rejects a non-http(s) scheme (e.g. file://) regardless of environment', async () => {
      const processor = getProcessor();
      const job = makeJob('file:///etc/passwd');

      await expect(processor(job)).rejects.toBeInstanceOf(UnrecoverableError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a malformed URL (fails URL parsing) with UnrecoverableError', async () => {
      const processor = getProcessor();
      const job = makeJob('not-a-valid-url');

      await expect(processor(job)).rejects.toBeInstanceOf(UnrecoverableError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('public HTTPS URLs pass the guard unmodified', () => {
    it('calls fetch for a normal public HTTPS URL and resolves on a 2xx response', async () => {
      const processor = getProcessor();
      const job = makeJob('https://example.com/webhook');

      await expect(processor(job)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, options] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://example.com/webhook');
      expect(options).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      });
    });

    it('propagates a real delivery failure (non-2xx) as a plain Error, not UnrecoverableError', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });
      const processor = getProcessor();
      const job = makeJob('https://example.com/webhook');

      let caught: unknown;
      try {
        await processor(job);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(UnrecoverableError);
      expect((caught as Error).message).toMatch(/HTTP 500/);
    });
  });
});
