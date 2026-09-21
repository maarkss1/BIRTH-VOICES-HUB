export function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL não está configurado. Defina esta variável de ambiente antes de iniciar o servidor em produção.');
  }
  return 'redis://localhost:6379';
}

// Slower, capped backoff shared by every ioredis client in this process — both the direct
// `new Redis(url, {...})` clients (server.ts, rateLimit.ts, middlewares/index.ts, audit.ts,
// slaScheduler.ts's readiness client, webhookIdempotency.ts) and the connection options object
// BullMQ builds its own internal client(s) from (webhook.worker.ts, retentionScheduler.ts,
// slaScheduler.ts's queue/worker). ioredis's default retryStrategy starts at ~50ms and ramps
// quickly, so when Redis is down every one of this codebase's 6+ independent clients reconnects
// dozens of times per second, each failed attempt logging a full error object via its own
// `.on('error', ...)` handler — a real log/I-O volume spike during an outage (confirmed while
// diagnosing an unrelated Docker smoke-test failure on PR #44; the Docker smoke test itself has no
// Redis service, so every client above hit this immediately). Never crashed the process — each
// client's existing fail-open behavior on a failed command is unchanged — but the reconnect
// cadence itself was needlessly aggressive. Capping at 10s keeps the volume sane.
export function getRedisRetryStrategy(): (times: number) => number {
  return (times: number) => Math.min(times * 500, 10_000);
}

// Plain-object connection options (host/port/password/...) rather than a live ioredis
// instance, so BullMQ can construct its own connection internally using its bundled
// ioredis version instead of ours — the two versions' Redis classes are structurally
// incompatible for TypeScript despite being wire-compatible.
export function getRedisConnectionOptions(): { host: string; port: number; username?: string; password?: string; tls?: Record<string, never>; retryStrategy: (times: number) => number } {
  const parsed = new URL(getRedisUrl());
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    retryStrategy: getRedisRetryStrategy(),
  };
}
