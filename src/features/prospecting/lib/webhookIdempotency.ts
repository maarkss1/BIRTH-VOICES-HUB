import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { getRedisUrl, getRedisRetryStrategy } from '../../../lib/env.js';
import { logger } from '../../../lib/logger.js';

/**
 * Thrown when we cannot determine whether a webhook delivery is a duplicate (e.g. Redis is
 * unreachable). Callers MUST treat this as "fail closed" — reject the request — rather than
 * proceeding as if the delivery were new. This mirrors the antivirus "fail closed" policy: a
 * real outbound call or a CRM result update must never be replayed just because our dedup store
 * happened to be down for one request.
 */
export class IdempotencyCheckFailedError extends Error {
  constructor(cause: unknown) {
    super('Não foi possível verificar idempotência do webhook (armazenamento indisponível).');
    this.name = 'IdempotencyCheckFailedError';
    this.cause = cause;
  }
}

// Lazily constructed, shared across calls within this process. Cloud Run can run multiple
// instances of this service, so this Redis-backed store — not an in-memory Map — is what makes
// the dedup check work across instances, not just within one.
let redisClient: Redis | null = null;

function getClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2000,
      retryStrategy: getRedisRetryStrategy(),
    });
    redisClient.on('error', (err: Error) => {
      logger.error('Webhook idempotency Redis client error', err.message);
    });
  }
  return redisClient;
}

/** Test-only hook to swap in a fake client and reset state between test cases. */
export function __setIdempotencyClientForTests(client: Redis | null): void {
  redisClient = client;
}

export const ATLASGR_OUTBOUND_IDEMPOTENCY_PREFIX = 'idempotency:atlasgr-outbound-call:';
export const BLAND_CALLBACK_IDEMPOTENCY_PREFIX = 'idempotency:bland-call-result:';

/** Default dedup window: long enough to absorb realistic webhook-retry storms (most providers give
 * up retrying well within a day), short enough that a genuinely new call to the same lead/number
 * later isn't silently dropped forever. Configurable because "realistic" depends on AtlasGR's own
 * retry policy, which this repo doesn't control. */
export const DEFAULT_IDEMPOTENCY_TTL_SECONDS = Number(
  process.env.ATLASGR_WEBHOOK_IDEMPOTENCY_TTL_SECONDS ?? 24 * 60 * 60,
);

const CALLBACK_PROCESSING_TTL_SECONDS = 60;

/**
 * Derives a stable dedup key for an AtlasGR outbound-call webhook delivery.
 *
 * Prefers `leadId` when AtlasGR supplies one (stable across redeliveries of the same event).
 * Falls back to a hash of the normalized business payload so that even today's contract — which
 * has no lead identifier at all — still gets real protection against duplicate redelivery of the
 * exact same request.
 */
export function buildAtlasGROutboundIdempotencyKey(payload: {
  leadId?: string;
  phoneNumber: string;
  name: string;
  company: string;
}): string {
  if (payload.leadId) {
    return `${ATLASGR_OUTBOUND_IDEMPOTENCY_PREFIX}lead:${payload.leadId}`;
  }
  const normalized = [payload.phoneNumber.replace(/\D/g, ''), payload.name.trim().toLowerCase(), payload.company.trim().toLowerCase()].join('|');
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `${ATLASGR_OUTBOUND_IDEMPOTENCY_PREFIX}hash:${hash}`;
}

/** Bland callbacks carry a provider-generated immutable call id, which is the ideal dedup key. */
export function buildBlandCallbackIdempotencyKey(callId: string): string {
  return `${BLAND_CALLBACK_IDEMPOTENCY_PREFIX}${callId.trim()}`;
}

/**
 * Atomically claims a dedup key. Returns `true` the first time a given key is claimed (caller
 * should proceed), `false` if the key was already claimed within the TTL window (caller must treat
 * this as a duplicate delivery and must NOT repeat the side effect).
 *
 * Throws `IdempotencyCheckFailedError` if the check itself could not be performed — always treat
 * that as "duplicate/unsafe", never as "safe to proceed".
 */
export async function claimIdempotencyKey(
  key: string,
  ttlSeconds: number = DEFAULT_IDEMPOTENCY_TTL_SECONDS,
): Promise<boolean> {
  try {
    const client = getClient();
    const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (error) {
    throw new IdempotencyCheckFailedError(error);
  }
}

export type CallbackProcessingState = 'acquired' | 'duplicate' | 'in_progress';

/**
 * Callback forwarding needs a two-phase dedup state instead of the one-shot outbound claim.
 * `processing` is deliberately short-lived: if the worker dies after claiming but before AtlasGR
 * acknowledges the result, a provider retry can take over after one minute. `done` is kept for the
 * normal 24h dedup window and makes repeated successful callbacks cheap no-ops.
 */
export async function beginBlandCallbackProcessing(callId: string): Promise<CallbackProcessingState> {
  const key = buildBlandCallbackIdempotencyKey(callId);
  try {
    const client = getClient();
    const claimed = await client.set(key, 'processing', 'EX', CALLBACK_PROCESSING_TTL_SECONDS, 'NX');
    if (claimed === 'OK') return 'acquired';

    const current = await client.get(key);
    return current === 'done' ? 'duplicate' : 'in_progress';
  } catch (error) {
    throw new IdempotencyCheckFailedError(error);
  }
}

/** Marks a forwarded callback as durably completed for the regular dedup window. */
export async function completeBlandCallbackProcessing(
  callId: string,
  ttlSeconds: number = DEFAULT_IDEMPOTENCY_TTL_SECONDS,
): Promise<void> {
  try {
    await getClient().set(buildBlandCallbackIdempotencyKey(callId), 'done', 'EX', ttlSeconds);
  } catch (error) {
    throw new IdempotencyCheckFailedError(error);
  }
}

/**
 * Releases a callback processing lock when AtlasGR definitely did not acknowledge the delivery.
 * That lets a provider retry attempt the forwarding again instead of silently losing the result.
 */
export async function releaseBlandCallbackProcessing(callId: string): Promise<void> {
  try {
    await getClient().del(buildBlandCallbackIdempotencyKey(callId));
  } catch (error) {
    throw new IdempotencyCheckFailedError(error);
  }
}
