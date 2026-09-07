import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal fake of the one ioredis surface this module touches: `set(...)` with NX semantics, and
// `on('error', ...)` for the error listener wired up at client construction time.
class FakeRedis {
  store = new Map<string, string>();
  onError = vi.fn();

  on(event: string, handler: (...args: unknown[]) => void) {
    if (event === 'error') this.onError = handler as never;
    return this;
  }

  async set(key: string, value: string, ..._rest: unknown[]) {
    // Only the NX ("set if not exists") path matters for this module's behavior.
    if (this.store.has(key)) return null;
    this.store.set(key, value);
    return 'OK';
  }
}

let fakeInstance: FakeRedis;

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function Redis() {
    fakeInstance = new FakeRedis();
    return fakeInstance;
  }),
}));

vi.mock('../../../lib/env.js', () => ({
  getRedisUrl: () => 'redis://localhost:6379',
  getRedisRetryStrategy: () => (times: number) => Math.min(times * 500, 10_000),
}));

import {
  __setIdempotencyClientForTests,
  buildAtlasGROutboundIdempotencyKey,
  claimIdempotencyKey,
  IdempotencyCheckFailedError,
} from './webhookIdempotency.js';

beforeEach(() => {
  __setIdempotencyClientForTests(null);
});

describe('buildAtlasGROutboundIdempotencyKey', () => {
  it('uses the lead id when provided', () => {
    const key = buildAtlasGROutboundIdempotencyKey({
      leadId: 'lead-123',
      phoneNumber: '+5511999998888',
      name: 'Fulano',
      company: 'Acme',
    });
    expect(key).toBe('idempotency:atlasgr-outbound-call:lead:lead-123');
  });

  it('falls back to a stable hash of phone/name/company when there is no lead id', () => {
    const keyA = buildAtlasGROutboundIdempotencyKey({
      phoneNumber: '+55 (11) 99999-8888',
      name: 'Fulano',
      company: 'Acme',
    });
    const keyB = buildAtlasGROutboundIdempotencyKey({
      phoneNumber: '5511999998888',
      name: 'FULANO',
      company: 'acme',
    });
    // Different formatting/casing of the same underlying data must still dedup to the same key.
    expect(keyA).toBe(keyB);
    expect(keyA.startsWith('idempotency:atlasgr-outbound-call:hash:')).toBe(true);
  });

  it('produces different hash keys for genuinely different leads', () => {
    const keyA = buildAtlasGROutboundIdempotencyKey({ phoneNumber: '+5511999998888', name: 'A', company: 'X' });
    const keyB = buildAtlasGROutboundIdempotencyKey({ phoneNumber: '+5511999997777', name: 'B', company: 'Y' });
    expect(keyA).not.toBe(keyB);
  });
});

describe('claimIdempotencyKey', () => {
  it('claims a fresh key and returns true', async () => {
    const claimed = await claimIdempotencyKey('some-key', 60);
    expect(claimed).toBe(true);
  });

  it('returns false for a key that was already claimed', async () => {
    const first = await claimIdempotencyKey('dup-key', 60);
    const second = await claimIdempotencyKey('dup-key', 60);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('wraps a Redis failure in IdempotencyCheckFailedError (fail closed)', async () => {
    const failingClient = {
      on: vi.fn(),
      set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    __setIdempotencyClientForTests(failingClient as never);

    await expect(claimIdempotencyKey('any-key', 60)).rejects.toBeInstanceOf(IdempotencyCheckFailedError);
  });
});
