// Shared Redis-backed rate limiter factory (Agente 00 — Coordenador).
//
// Extracted from server.ts's local closure so route files can apply their own, tighter,
// route-specific limit directly in the router chain — on top of (never instead of) the general
// 200 req/min-per-IP limiter server.ts already applies to the whole `/api` surface before any
// route is reached. Same sliding-window pattern (INCR + EXPIRE on first hit), same fail-open
// behavior on a Redis error (a rate-limiter outage must never turn into a full outage of the
// route it guards).
import express from 'express';
import { Redis } from 'ioredis';
import { getRedisUrl, getRedisRetryStrategy } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const redisClient = new Redis(getRedisUrl(), { maxRetriesPerRequest: 1, connectTimeout: 2000, commandTimeout: 2000, retryStrategy: getRedisRetryStrategy() });
redisClient.on('error', (err) => logger.error('Rate limiter Redis error', err));

export const createRateLimiter = (keyPrefix: string, limit: number, windowSeconds: number) =>
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';
    const key = `ratelimit:${keyPrefix}:${ip}`;

    try {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }
      if (current > limit) {
        res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente em um minuto.' });
        return;
      }
      next();
    } catch {
      next();
    }
  };
