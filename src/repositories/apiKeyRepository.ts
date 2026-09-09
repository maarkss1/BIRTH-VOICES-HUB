// Prisma access for the API Key domain (Agente 01 — Plataforma, Segurança, Tenancy e Dados).
//
// Resolves .agents/handoffs/onda-2/02-para-09-api-key-backend.md (via
// .agents/handoffs/onda-4/09-para-00-api-key-backend-fora-de-escopo.md). Kept intentionally thin:
// every function here is a direct Prisma query/mutation with no business rules (key generation,
// hashing, DTO mapping, authorization) — that logic lives in `src/services/apiKeyService.ts`
// (Clean Architecture, AGENTS.md §2: Controller → Service → Repository, no Prisma access outside
// `src/repositories/**`).
//
// `keyHash` is NEVER selected by the listing/lookup-by-id queries below — only
// `findApiKeyByHash` (used exclusively by the authentication path, which already holds the
// plaintext key to hash-and-compare) touches it. This makes an accidental hash leak through the
// listing endpoint structurally impossible rather than something the service layer has to
// remember to strip.
import { prisma } from '../lib/prisma.js';

// Shape returned by listing/lookup-by-id — deliberately excludes `keyHash`.
export const API_KEY_SAFE_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  scopes: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

export type SafeApiKey = {
  id: string;
  tenantId: string;
  name: string;
  scopes: unknown;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export function createApiKey(data: {
  tenantId: string;
  name: string;
  keyHash: string;
  createdByUserId: string;
  expiresAt: Date | null;
}): Promise<SafeApiKey> {
  return prisma.aPIKey.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      keyHash: data.keyHash,
      createdByUserId: data.createdByUserId,
      expiresAt: data.expiresAt,
    },
    select: API_KEY_SAFE_SELECT,
  });
}

export function listApiKeysForTenant(tenantId: string): Promise<SafeApiKey[]> {
  return prisma.aPIKey.findMany({
    where: { tenantId },
    select: API_KEY_SAFE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

export function findApiKeyForTenant(id: string, tenantId: string): Promise<SafeApiKey | null> {
  return prisma.aPIKey.findFirst({
    where: { id, tenantId },
    select: API_KEY_SAFE_SELECT,
  });
}

// Authentication lookup only — the one place allowed to read `keyHash`, because the caller
// already holds the plaintext key and needs to compare it against the stored hash.
export function findApiKeyByHash(keyHash: string) {
  return prisma.aPIKey.findUnique({ where: { keyHash } });
}

export function revokeApiKey(id: string): Promise<SafeApiKey> {
  return prisma.aPIKey.update({
    where: { id },
    data: { revokedAt: new Date() },
    select: API_KEY_SAFE_SELECT,
  });
}

// "Last used" bookkeeping, called on every successful API-key-authenticated request. This
// function itself can reject like any other Prisma call — the caller (apiKeyService.authenticateApiKey)
// is the one that treats it as fire-and-forget (`.catch(() => undefined)`), since a failure to
// record last-used-at must never fail the actual authenticated request it is piggybacking on.
export async function touchLastUsed(id: string): Promise<void> {
  await prisma.aPIKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
}
