import { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { prisma } from '../lib/prisma.js';

export function healthHandler(_req: Request, res: Response) {
  res.status(200).json({ status: 'ok' });
}

export function liveHandler(_req: Request, res: Response) {
  res.status(200).json({ status: 'ok' });
}

export interface PlatformHealthResult {
  ready: boolean;
  checks: Record<string, 'ok' | 'error'>;
}

// Extracted so the exact same real check (Postgres + Redis, no fabricated value) backs both the
// HTTP endpoint (GET /api/ready) and the periodic SLA sampler in `src/services/slaScheduler.ts` —
// see `.agents/handoffs/onda-4/10-para-02-sla-telemetria-overview.md`. Any change to what "ready"
// means only needs to happen here once.
export async function checkPlatformHealth(redisClient: Redis): Promise<PlatformHealthResult> {
  const checks: Record<string, 'ok' | 'error'> = { database: 'error', redis: 'error' };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    const pong = await redisClient.ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'error';
  } catch {
    checks.redis = 'error';
  }

  const ready = Object.values(checks).every((v) => v === 'ok');
  return { ready, checks };
}

export function makeReadyHandler(redisClient: Redis) {
  return async (_req: Request, res: Response) => {
    const { ready, checks } = await checkPlatformHealth(redisClient);
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
  };
}
