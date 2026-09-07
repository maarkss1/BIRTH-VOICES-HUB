import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions, getRedisUrl } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { checkPlatformHealth } from '../controllers/health.controller.js';
import { listActiveTenantIds } from '../repositories/tenantRepository.js';
import { createMetric } from './metricService.js';

/**
 * Real, honest platform-wide SLA sampling — see
 * `.agents/handoffs/onda-2/02-para-04-10-telemetria-overview.md` (the "Disponibilidade (SLA):
 * 99.98%" that used to sit in `Overview.tsx` was fabricated, never backed by real data) and
 * `.agents/handoffs/onda-4/10-para-02-sla-telemetria-overview.md` (how to consume what this
 * module produces).
 *
 * SLA/uptime here is a property of the PLATFORM, not of any individual tenant — every tenant runs
 * on the same Postgres/Redis/app infrastructure (`GET /api/ready`, `src/controllers/
 * health.controller.ts#checkPlatformHealth`), so "is the platform up right now" is the same real
 * answer for everyone. This module samples that exact check on a fixed cadence (same code path as
 * the HTTP endpoint, never a separate/looser check) and persists each sample as a `Metric` row
 * (`name: 'platform_ready_check'`, `value: 1 | 0`), so a time window of real samples — not a
 * single point-in-time snapshot — becomes available to compute an uptime ratio from.
 *
 * Why fan-out per tenant instead of one platform-wide row: `Metric.tenantId` (prisma/schema.prisma,
 * owned exclusively by Agente 01) is a required FK to `Tenant`, with no "system"/platform tenant
 * row in the `Tenant` table (the same reason `lib/voice-runtime/providers/LLMGateway.ts` skips
 * writing AI-cost metrics for `SYSTEM_TENANT_ID`). Rather than requesting a schema change for a
 * single pointed mission, each sample is written once per active tenant with `userId: null`
 * (tenant-wide event, same convention the Agente 04 AI-cost metrics already use) — every tenant
 * ends up with the identical real value, honestly reflecting that it is the same shared
 * infrastructure, and `GET /api/metrics` (already tenant-scoped, no new endpoint needed) naturally
 * returns it for whoever asks. Documented limitation: this multiplies one row per tenant per tick
 * instead of a single platform-wide row; acceptable at today's tenant count and sampling cadence,
 * but a dedicated platform-wide table would be the better long-term shape if the tenant count grows
 * large enough for this to matter (would require a schema change owned by Agente 01).
 */

const QUEUE_NAME = 'platformSlaCheck';
const JOB_NAME = 'check';
export const PLATFORM_READY_METRIC_NAME = 'platform_ready_check';
// Every 5 minutes: frequent enough for a meaningful uptime ratio over a day/week window, not so
// frequent that the per-tenant fan-out write volume becomes a concern at today's scale.
const REPEAT_CRON = '*/5 * * * *';

let queue: Queue | null = null;
let worker: Worker | null = null;
let redisClient: Redis | null = null;

async function sampleAndRecordPlatformReadiness(): Promise<{ ready: boolean; tenantCount: number }> {
  if (!redisClient) {
    throw new Error('[SlaScheduler] Redis client not initialized');
  }

  const { ready, checks } = await checkPlatformHealth(redisClient);
  const tenantIds = await listActiveTenantIds();
  const checkedAt = new Date().toISOString();

  const results = await Promise.allSettled(
    tenantIds.map((tenantId) =>
      createMetric(tenantId, null, {
        name: PLATFORM_READY_METRIC_NAME,
        value: ready ? 1 : 0,
        tags: { database: checks.database, redis: checks.redis, checkedAt },
      })
    )
  );

  const failedCount = results.filter((r) => r.status === 'rejected').length;
  if (failedCount > 0) {
    logger.error(
      `[SlaScheduler] Failed to persist ${PLATFORM_READY_METRIC_NAME} for ${failedCount}/${tenantIds.length} tenants`
    );
  }

  logger.info('[SlaScheduler] Platform readiness sample recorded', {
    ready,
    checks,
    tenantCount: tenantIds.length,
  });

  return { ready, tenantCount: tenantIds.length };
}

/**
 * Registers the repeatable job and starts the worker that processes it. Safe to call once during
 * process startup, next to `startWebhookWorker()`/`startRetentionScheduler()`. Never throws: a
 * Redis outage at startup should degrade to "SLA sampling temporarily unscheduled", not crash the
 * web process.
 */
export function startSlaScheduler(): { queue: Queue; worker: Worker } | undefined {
  try {
    const connection = { ...getRedisConnectionOptions(), maxRetriesPerRequest: null };

    queue = new Queue(QUEUE_NAME, { connection });

    // Dedicated live ioredis client for the actual readiness ping — separate from the plain
    // connection options object BullMQ builds its own client from (see `getRedisConnectionOptions`
    // doc comment in src/lib/env.ts), same technique `server.ts` uses for the `/api/ready` route.
    redisClient = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2000,
    });
    redisClient.on('error', (err) => logger.error('[SlaScheduler] Redis client error', err.message));

    worker = new Worker(QUEUE_NAME, () => sampleAndRecordPlatformReadiness(), { connection });

    worker.on('failed', (job, err) => {
      // Logged, not rethrown/crashed: a failed sample should not take down the web process — the
      // next scheduled tick tries again.
      logger.error(`[SlaScheduler] Job ${job?.id} failed. Reason: ${err.message}`);
    });

    queue
      .add(
        JOB_NAME,
        {},
        {
          repeat: { pattern: REPEAT_CRON },
          removeOnComplete: true,
          removeOnFail: 100,
        }
      )
      .then(() => {
        logger.info('[SlaScheduler] Registered platform readiness sampling job', { cron: REPEAT_CRON });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[SlaScheduler] Failed to register repeatable job: ${msg}`);
      });

    return { queue, worker };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[SlaScheduler] Failed to start: ${msg}`);
    return undefined;
  }
}

/** Test/shutdown helper: stops the worker, closes the queue connection and the redis client. */
export async function stopSlaScheduler(): Promise<void> {
  await worker?.close();
  await queue?.close();
  redisClient?.disconnect();
  worker = null;
  queue = null;
  redisClient = null;
}
