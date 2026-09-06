import { logger } from "../lib/logger.js";
import { Request, Response } from 'express';
import { loginSchema, registerSchema } from '../validators/index.js';
import { z } from 'zod';

const tokenSchema = z.object({
  token: z.string().optional()
});
import { register, login, refreshSession, AuthError } from '../services/authService.js';
import { writeAuditLog } from '../services/audit.js';
import { createMetric } from '../repositories/metricRepository.js';
import { getPermissionsForRoleName } from '../repositories/roleRepository.js';
import { setCookie, setLoggedInCookie, ACCESS_TOKEN_MAX_AGE_MS, REFRESH_TOKEN_MAX_AGE_MS } from '../lib/cookies.js';

export async function registerHandler(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { email, password, companyName } = parsed.data;

  try {
    const result = await register(email, password, companyName);
    writeAuditLog(result.tenantId, result.user.id, 'USER_REGISTER', {});
    setCookie(res, 'access_token', result.token, ACCESS_TOKEN_MAX_AGE_MS);
    setLoggedInCookie(res);
    setCookie(res, 'refresh_token', result.refreshToken, REFRESH_TOKEN_MAX_AGE_MS);
    res.json(result);
  } catch (err: unknown) {
    logger.error('Register Error', err);
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
}

export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { email, password } = parsed.data;

  try {
    const result = await login(email, password);
    writeAuditLog(result.tenantId, result.user.id, 'USER_LOGIN', {});
    createMetric(result.tenantId, result.user.id, { name: 'user_login', value: 1, tags: { userId: result.user.id } });
    setCookie(res, 'access_token', result.token, ACCESS_TOKEN_MAX_AGE_MS);
    setLoggedInCookie(res);
    setCookie(res, 'refresh_token', result.refreshToken, REFRESH_TOKEN_MAX_AGE_MS);
    res.json(result);
  } catch (err: unknown) {
    logger.error('Login Error', err);
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
}

export async function refreshHandler(req: Request, res: Response) {
  const parsed = tokenSchema.safeParse(req.body);
  const refreshToken = parsed.success ? parsed.data.token : req.cookies?.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token não fornecido.' });
  }

  try {
    const result = await refreshSession(refreshToken);
    if (!result) {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      return res.status(401).json({ error: 'Refresh token inválido.' });
    }
    setCookie(res, 'access_token', result.token, ACCESS_TOKEN_MAX_AGE_MS);
    setLoggedInCookie(res);
    res.json(result);
  } catch (err) {
    logger.error('Refresh Token Error', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

export async function logoutHandler(req: Request, res: Response) {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.clearCookie('logged_in');
  res.json({ success: true, message: 'Logout realizado com sucesso' });
}

// Also resolves the caller's effective Permission set live (never trusted from the JWT claim) so
// the frontend can decide what to show (e.g. the LiveSupervisor "intervene" control) without a
// hardcoded role-name allowlist. This is UX-only information for the client — every
// permission-gated action must still be enforced authoritatively server-side (requirePermission /
// hasPermission in src/middlewares/rbac.ts), never trusted from this response alone.
export async function meHandler(req: Request, res: Response) {
  if (!req.user) return res.json({ user: null });
  const permissions = await getPermissionsForRoleName(req.user.role, req.user.tenantId);
  res.json({ user: { ...req.user, permissions } });
}
