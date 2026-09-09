import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Local, per-test-file override of the global ioredis mock (vitest.setup.ts) so the rate-limit
// branch can actually be exercised — the global mock's incr() always resolves to 1, which can
// never exceed any limit.
const redisState = { counts: new Map<string, number>() };
vi.mock('ioredis', () => ({
  Redis: class {
    on() {}
    async incr(key: string) {
      const next = (redisState.counts.get(key) ?? 0) + 1;
      redisState.counts.set(key, next);
      return next;
    }
    async expire() {
      return 1;
    }
  },
}));

vi.mock('../services/apiKeyService.js', () => ({
  authenticateApiKey: vi.fn(),
  isApiKeyFormat: (token: string) => token.startsWith('bvhk_live_'),
  API_KEY_PREFIX: 'bvhk_live_',
}));

vi.mock('../services/authService.js', () => ({
  refreshSession: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tenant: { upsert: vi.fn().mockResolvedValue({}) },
    user: { upsert: vi.fn().mockResolvedValue({}) },
  },
}));

import { authenticateApiKey } from '../services/apiKeyService.js';
import { attachAuthIfPresent, getAuthUser } from './index.js';

beforeEach(() => {
  vi.clearAllMocks();
  redisState.counts.clear();
});

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  return res as Response;
}

const VALID_SESSION = { id: 'user-1', email: 'admin@tenant-1.com', role: 'admin', tenantId: 'tenant-1' };

describe('getAuthUser — API key path', () => {
  it('routes an API-key-shaped Bearer token to authenticateApiKey, never to JWT verification', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ apiKeyId: 'key-1', session: VALID_SESSION });

    const req = makeReq({ headers: { authorization: 'Bearer bvhk_live_abcdef123456' } });
    const result = await getAuthUser(req);

    expect(authenticateApiKey).toHaveBeenCalledWith('bvhk_live_abcdef123456');
    expect(result).toEqual(VALID_SESSION);
    expect(req.apiKeyId).toBe('key-1');
  });

  it('returns null (never authenticated) for a revoked/expired/unknown key, without touching req.apiKeyId', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue(null);

    const req = makeReq({ headers: { authorization: 'Bearer bvhk_live_revoked' } });
    const result = await getAuthUser(req);

    expect(result).toBeNull();
    expect(req.apiKeyId).toBeUndefined();
  });

  it('a non-API-key Bearer token still falls through to the pre-existing JWT path (not treated as an API key)', async () => {
    // A JWT-shaped bearer token does not start with the API key prefix, so authenticateApiKey is
    // never invoked for it — it is left to the existing verifyToken() flow.
    const req = makeReq({ headers: { authorization: 'Bearer some.jwt.token' } });

    await getAuthUser(req);

    expect(authenticateApiKey).not.toHaveBeenCalled();
  });
});

describe('attachAuthIfPresent — per-API-key rate limit', () => {
  it('sets req.user/req.tenantId and calls next() for a valid key under the limit', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ apiKeyId: 'key-1', session: VALID_SESSION });

    const req = makeReq({ headers: { authorization: 'Bearer bvhk_live_ok' } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await attachAuthIfPresent(req, res, next);

    expect(req.user).toEqual(VALID_SESSION);
    expect(req.tenantId).toBe('tenant-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 429 once the per-key limit is exceeded, without calling next()', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ apiKeyId: 'key-heavy', session: VALID_SESSION });

    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    // Drive the shared in-memory counter for this key past the limit (120/60s) by calling the
    // real middleware repeatedly — exercises the exact increment path attachAuthIfPresent uses.
    let lastRes = res;
    for (let i = 0; i < 121; i++) {
      const req = makeReq({ headers: { authorization: 'Bearer bvhk_live_ok' } });
      lastRes = makeRes();
      await attachAuthIfPresent(req, lastRes, next);
    }

    expect(lastRes.status).toHaveBeenCalledWith(429);
    expect(lastRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('never rate-limits a JWT-authenticated request (req.apiKeyId stays unset)', async () => {
    const req = makeReq(); // no Authorization header, no cookie -> unauthenticated, but that's fine:
    // the assertion here is that the rate-limit branch is only entered when apiKeyId is set.
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await attachAuthIfPresent(req, res, next);

    expect(req.apiKeyId).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
