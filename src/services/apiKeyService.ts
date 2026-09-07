// Business logic for tenant-issued API Keys (Agente 01 — Plataforma, Segurança, Tenancy e Dados).
//
// Resolves .agents/handoffs/onda-2/02-para-09-api-key-backend.md (routed here via
// .agents/handoffs/onda-4/09-para-00-api-key-backend-fora-de-escopo.md).
//
// Secret handling (AGENTS.md §13):
// - The plaintext key is generated here and returned to the caller (controller) EXACTLY ONCE, at
//   creation time. It is never persisted anywhere — only its SHA-256 hash (`keyHash`) is stored.
// - SHA-256 (not bcrypt) is the right primitive here: bcrypt is for low-entropy human passwords
//   that must resist offline brute-force from a stolen hash; `generateApiKeySecret` below produces
//   a 256-bit random value, so a fast cryptographic hash with no discoverable "password" behind it
//   is already infeasible to invert or brute-force. This mirrors how GitHub/Stripe-style API
//   tokens are stored. `findUserById`'s bcrypt password hashing is unrelated and unaffected.
// - Every list/read path goes through apiKeyRepository's `API_KEY_SAFE_SELECT`, which never
//   fetches `keyHash` in the first place — so there is no code path in this service that could leak
//   it even by accident.
import crypto from 'crypto';
import * as apiKeyRepository from '../repositories/apiKeyRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import type { TokenPayload } from '../lib/auth-tokens.js';

export class ApiKeyServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Distinguishable at a glance from a Twilio/Bland/other secret if it ever leaked into a log, and
// lets the auth middleware route a Bearer token to API-key authentication vs. JWT verification
// without needing to attempt (and fail) JWT parsing first.
export const API_KEY_PREFIX = 'bvhk_live_';

export function isApiKeyFormat(bearerToken: string): boolean {
  return bearerToken.startsWith(API_KEY_PREFIX);
}

function generateApiKeySecret(): string {
  // 256 bits of randomness, base64url-encoded (URL/header-safe, no padding characters).
  return `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

export interface CreatedApiKey {
  id: string;
  name: string;
  key: string; // plaintext — present only in the create response, never again
  createdAt: Date;
  expiresAt: Date | null;
}

export interface ApiKeyMetadata {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revoked: boolean;
  revokedAt: Date | null;
}

function toMetadata(row: apiKeyRepository.SafeApiKey): ApiKeyMetadata {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revoked: row.revokedAt !== null,
    revokedAt: row.revokedAt,
  };
}

// POST /api/developers/keys. `expiresAt: null` means "no expiration" — a deliberate, explicit
// choice (not a fabricated default) since not every tenant wants rotation-by-expiry.
export async function createApiKeyForTenant(
  tenantId: string,
  createdByUserId: string,
  data: { name: string; expiresAt?: Date | null }
): Promise<CreatedApiKey> {
  const plaintextKey = generateApiKeySecret();
  const keyHash = hashApiKey(plaintextKey);

  const created = await apiKeyRepository.createApiKey({
    tenantId,
    name: data.name,
    keyHash,
    createdByUserId,
    expiresAt: data.expiresAt ?? null,
  });

  return {
    id: created.id,
    name: created.name,
    key: plaintextKey,
    createdAt: created.createdAt,
    expiresAt: created.expiresAt,
  };
}

export async function listApiKeysForTenant(tenantId: string): Promise<ApiKeyMetadata[]> {
  const rows = await apiKeyRepository.listApiKeysForTenant(tenantId);
  return rows.map(toMetadata);
}

// DELETE /api/developers/keys/:id or POST /api/developers/keys/:id/revoke. Tenant-scoped lookup
// (never trusts the id alone) so an admin from tenant A can never revoke — or even discover the
// existence of — a key belonging to tenant B (AGENTS.md §15). Idempotent: revoking an
// already-revoked key succeeds without error rather than surfacing a confusing double-revoke
// failure to the caller.
export async function revokeApiKeyForTenant(tenantId: string, id: string): Promise<ApiKeyMetadata> {
  const existing = await apiKeyRepository.findApiKeyForTenant(id, tenantId);
  if (!existing) {
    throw new ApiKeyServiceError('Chave de API não encontrada.', 404);
  }
  if (existing.revokedAt) {
    return toMetadata(existing);
  }
  const revoked = await apiKeyRepository.revokeApiKey(id);
  return toMetadata(revoked);
}

// Result of a successful API-key authentication: the same TokenPayload shape the rest of the
// codebase already expects from JWT auth (req.user), plus the key's own id so the caller
// (middleware) can attribute rate limiting and can distinguish "authenticated via API key" from
// "authenticated via JWT" without re-parsing the Authorization header.
export interface ApiKeyAuthResult {
  session: TokenPayload;
  apiKeyId: string;
}

// Alternative authentication path to the existing cookie/JWT flow (never replaces it — see
// src/middlewares/index.ts#getAuthUser). A revoked key (`revokedAt` set) or an expired key
// (`expiresAt` in the past) is rejected immediately: this is a live database read on every
// request, not a cached/JWT-embedded claim, so revocation takes effect on the very next request —
// no propagation delay, no stale cache to invalidate.
//
// The resulting session acts on behalf of the admin who created the key (same tenant, same live
// role/permissions as that user today) rather than inventing a synthetic identity — this is what
// lets every existing tenant-scoped, role-scoped route keep working unchanged for an API-key
// caller. If that user has since been deleted or removed from the tenant, the key fails closed
// (returns null) rather than fabricating a fallback identity.
export async function authenticateApiKey(plaintextKey: string): Promise<ApiKeyAuthResult | null> {
  const keyHash = hashApiKey(plaintextKey);
  const apiKey = await apiKeyRepository.findApiKeyByHash(keyHash);
  if (!apiKey) return null;
  if (apiKey.revokedAt) return null;
  if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) return null;
  if (!apiKey.createdByUserId) return null;

  const user = await userRepository.findUserById(apiKey.createdByUserId);
  if (!user || user.tenantId !== apiKey.tenantId) return null;

  const membership = await userRepository.findMembershipWithRole(user.id, apiKey.tenantId);
  if (!membership) return null;

  // Best-effort — never let bookkeeping failure block an otherwise-valid authenticated request.
  apiKeyRepository.touchLastUsed(apiKey.id).catch(() => undefined);

  return {
    apiKeyId: apiKey.id,
    session: {
      id: user.id,
      email: user.email,
      role: membership.role.name,
      tenantId: apiKey.tenantId,
    },
  };
}
