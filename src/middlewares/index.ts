import express from 'express';
import { Redis } from 'ioredis';
import { verifyToken, TokenPayload } from '../lib/auth-tokens.js';
import { refreshSession } from '../services/authService.js';
import { setCookie, ACCESS_TOKEN_MAX_AGE_MS } from '../lib/cookies.js';
import { authenticateApiKey, isApiKeyFormat } from '../services/apiKeyService.js';
import { getRedisUrl, getRedisRetryStrategy } from '../lib/env.js';
import { logger } from '../lib/logger.js';

export const csrfProtection = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    // Requests authenticated via a Bearer token in the Authorization header — rather than the
    // ambient session cookie — are not exploitable via CSRF: a malicious page cannot attach an
    // arbitrary Authorization header to a cross-site request, and cors() already restricts which
    // origins may read the response of a JS-initiated cross-origin request. This unblocks
    // legitimate server-to-server callers authenticated this way (e.g. the AtlasGR CRM calling
    // POST /api/voice/outbound with its own bearer token, which never sends an Origin header)
    // without weakening protection for the cookie-authenticated browser path below.
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return next();
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const origin = req.headers.origin;
    const host = req.headers.host;

    if (!origin) {
      // Same-site requests without credentials (e.g. plain HTML form posts) legitimately omit
      // Origin in some browsers, but in production we require it for mutation requests since
      // this is our only CSRF signal — outside production, tooling (tests, curl, etc.) may not send it.
      if (isProduction) {
        res.status(403).json({ error: 'Validação de origem de segurança (CSRF) falhou.' });
        return;
      }
      return next();
    }

    if (host) {
      try {
        const parsedOrigin = new URL(origin).host;
        const isLocalBypass = !isProduction && (host.includes('localhost') || host.includes('127.0.0.1'));
        if (parsedOrigin !== host && !isLocalBypass) {
          res.status(403).json({ error: 'Validação de origem de segurança (CSRF) falhou.' });
          return;
        }
      } catch {
        res.status(403).json({ error: 'Validação de origem de segurança (CSRF) falhou.' });
        return;
      }
    }
  }
  next();
};

function setAccessTokenCookie(res: express.Response, token: string) {
  setCookie(res, 'access_token', token, ACCESS_TOKEN_MAX_AGE_MS);
  // Non-httpOnly UI flag (no sensitive data) so the frontend can tell it has a live session
  // without parsing the httpOnly access_token cookie.
  res.cookie('logged_in', 'true', {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400 * 30 * 1000,
  });
}

// Redis-backed per-API-key rate limiter, applied to every request authenticated via an API key
// (see the `req.apiKeyId` check in attachAuthIfPresent below). Reuses the same increment+expire
// sliding-window pattern already used for the IP-based limiters in server.ts (Agente 00's file,
// not importable here — its limiter factory is a local closure, not exported), rather than
// inventing a different rate-limiting mechanism for this one call site. A Redis outage fails open
// (never blocks an otherwise-valid authenticated request) — same tradeoff server.ts's limiters make.
const API_KEY_RATE_LIMIT = 120;
const API_KEY_RATE_WINDOW_SECONDS = 60;
const rateLimitRedis = new Redis(getRedisUrl(), { maxRetriesPerRequest: 1, connectTimeout: 2000, commandTimeout: 2000, retryStrategy: getRedisRetryStrategy() });
rateLimitRedis.on('error', (err) => logger.error('API key rate limiter Redis error', err));

async function isApiKeyRateLimited(apiKeyId: string): Promise<boolean> {
  const key = `ratelimit:apikey:${apiKeyId}`;
  try {
    const current = await rateLimitRedis.incr(key);
    if (current === 1) {
      await rateLimitRedis.expire(key, API_KEY_RATE_WINDOW_SECONDS);
    }
    return current > API_KEY_RATE_LIMIT;
  } catch {
    return false;
  }
}

export async function getAuthUser(req: express.Request, res?: express.Response): Promise<TokenPayload | null> {
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.substring(7)
    : undefined;

  // Alternative authentication path: a Bearer token shaped like a tenant API key is resolved
  // against APIKey.keyHash instead of verified as a JWT. This never replaces the JWT flow below —
  // a request with a JWT cookie or a JWT Bearer token is unaffected and keeps working exactly as
  // before. A revoked/expired/unknown key authenticates as nobody (401 downstream via
  // requireTenant), never falls through to try JWT verification on the same string.
  if (bearerToken && isApiKeyFormat(bearerToken)) {
    const result = await authenticateApiKey(bearerToken);
    if (!result) return null;
    req.apiKeyId = result.apiKeyId;
    return result.session;
  }

  let token = req.cookies?.access_token;
  if (!token && bearerToken) {
    token = bearerToken;
  }

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) return decoded;
  }

  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    const refreshed = await refreshSession(refreshToken);
    if (refreshed) {
      if (res) setAccessTokenCookie(res, refreshed.token);
      return refreshed.session;
    }
  }

  return null;
}

export const attachAuthIfPresent = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const session = await getAuthUser(req, res);
  if (session) {
    req.user = session;
    req.tenantId = session.tenantId;

    // Auto-upsert User and Tenant in Dev environment so old JWT cookies don't break fresh databases
    if (process.env.NODE_ENV !== 'production' && session.tenantId) {
      try {
        const { prisma } = await import('../lib/prisma.js');
        await prisma.tenant.upsert({
          where: { id: session.tenantId },
          update: {},
          create: { id: session.tenantId, name: 'Local Dev Tenant' }
        });
        await prisma.user.upsert({
          where: { id: session.id },
          update: {},
          create: {
            id: session.id,
            tenantId: session.tenantId,
            email: session.email || 'dev@local.com',
            companyName: 'Local Dev Corp',
            passwordHash: 'dummy'
          }
        });
      } catch (err) {
        console.error('Failed to auto-upsert dev tenant/user:', err);
      }
    }
  }

  // Basic per-key rate limit, applied only to requests that actually authenticated via an API
  // key (req.apiKeyId set inside getAuthUser above) — JWT-authenticated requests are unaffected
  // and continue to rely solely on the IP-based limiters in server.ts.
  if (req.apiKeyId) {
    const limited = await isApiKeyRateLimited(req.apiKeyId);
    if (limited) {
      res.status(429).json({ error: 'Limite de requisições excedido para esta chave de API. Tente novamente em breve.' });
      return;
    }
  }

  next();
};
