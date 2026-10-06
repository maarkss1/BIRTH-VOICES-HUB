import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TOOL_TIMEOUT_MS,
  executeHttpTool,
  isSafeToolUrl,
  MAX_TOOL_RETRY_LIMIT,
  MAX_TOOL_TIMEOUT_MS,
} from './HttpToolExecutor.js';

const originalFetch = global.fetch;
const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.NODE_ENV = originalEnv;
  vi.restoreAllMocks();
});

describe('isSafeToolUrl (SSRF defense reused from src/validators/index.ts)', () => {
  it('rejects loopback/private/link-local/cloud-metadata literal hosts', () => {
    expect(isSafeToolUrl('https://127.0.0.1/internal')).toBe(false);
    expect(isSafeToolUrl('https://localhost/internal')).toBe(false);
    expect(isSafeToolUrl('https://10.0.0.5/internal')).toBe(false);
    expect(isSafeToolUrl('https://192.168.1.1/internal')).toBe(false);
    expect(isSafeToolUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('rejects plain HTTP in production but allows it outside production', () => {
    expect(isSafeToolUrl('http://api.example.com/data')).toBe(false);
    process.env.NODE_ENV = 'test';
    expect(isSafeToolUrl('http://api.example.com/data')).toBe(true);
  });

  it('rejects a malformed URL instead of throwing', () => {
    expect(isSafeToolUrl('not a url')).toBe(false);
  });

  it('allows a public HTTPS host', () => {
    expect(isSafeToolUrl('https://api.example.com/crm/lookup')).toBe(true);
  });
});

describe('executeHttpTool', () => {
  it('refuses a private/reserved target before ever calling fetch', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeHttpTool({ method: 'GET', endpoint: 'https://169.254.169.254/latest/meta-data' });

    expect(result).toEqual({ ok: false, error: 'blocked_url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an unsupported HTTP method before calling fetch', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeHttpTool({ method: 'TRACE', endpoint: 'https://api.example.com/data' });

    expect(result).toEqual({ ok: false, error: 'unsupported_method' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the response body on a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"status":"ok"}', { status: 200, statusText: 'OK' }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeHttpTool({ method: 'GET', endpoint: 'https://api.example.com/data' });

    expect(result).toEqual({ ok: true, status: 200, body: '{"status":"ok"}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('never waits indefinitely: a hung request is aborted by the timeout', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal;
      signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'TimeoutError';
        reject(err);
      });
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeHttpTool({ method: 'GET', endpoint: 'https://api.example.com/slow', timeoutMs: 50 });

    expect(result).toEqual({ ok: false, error: 'timeout' });
  }, 10_000);

  it('retries on failure up to retryLimit and succeeds on the last attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeHttpTool({ method: 'GET', endpoint: 'https://api.example.com/data', retryLimit: 1 });

    expect(result).toEqual({ ok: true, status: 200, body: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries and reports the failure without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeHttpTool({ method: 'GET', endpoint: 'https://api.example.com/data', retryLimit: 1 });

    expect(result).toEqual({ ok: false, error: 'network_error' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a non-2xx response as an http_<status> failure instead of throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 503, statusText: 'Unavailable' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeHttpTool({ method: 'GET', endpoint: 'https://api.example.com/data' });

    expect(result).toEqual({ ok: false, error: 'http_503' });
  });

  it('clamps an absurd tenant-configured timeout/retryLimit instead of trusting it verbatim', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'TimeoutError';
        reject(err);
      });
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const start = Date.now();
    const result = await executeHttpTool({
      method: 'GET',
      endpoint: 'https://api.example.com/data',
      timeoutMs: 10 * 60 * 1000,
      retryLimit: 999,
    });
    const elapsed = Date.now() - start;

    expect(result.error).toBe('timeout');
    // Worst case is MAX_TOOL_TIMEOUT_MS * (MAX_TOOL_RETRY_LIMIT + 1); give generous slack for CI jitter.
    expect(elapsed).toBeLessThan(MAX_TOOL_TIMEOUT_MS * (MAX_TOOL_RETRY_LIMIT + 1) + 2000);
  }, 20_000);

  it('exposes sane, bounded defaults', () => {
    expect(DEFAULT_TOOL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DEFAULT_TOOL_TIMEOUT_MS).toBeLessThanOrEqual(MAX_TOOL_TIMEOUT_MS);
  });
});
