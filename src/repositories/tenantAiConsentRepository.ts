// Data access for tenant-level AI provider consent (LGPD). Extracted out of settingService.ts
// (which was calling Prisma directly, bypassing the Controller → Service → Repository boundary —
// see the PR review finding this resolves) so `TenantAiConsent` has the same repository-layer
// isolation as every other model: no Prisma import outside src/repositories/**.
import { prisma } from '../lib/prisma.js';
import type { TenantAiConsent } from '@prisma/client';

export function findByTenantId(tenantId: string): Promise<TenantAiConsent | null> {
  return prisma.tenantAiConsent.findUnique({ where: { tenantId } });
}

export function grant(tenantId: string, grantedAt: Date, grantedByUserId: string): Promise<TenantAiConsent> {
  return prisma.tenantAiConsent.upsert({
    where: { tenantId },
    create: { tenantId, granted: true, grantedAt, grantedByUserId },
    update: { granted: true, grantedAt, revokedAt: null, grantedByUserId },
  });
}

export function revoke(tenantId: string, revokedAt: Date, grantedByUserId: string): Promise<TenantAiConsent> {
  return prisma.tenantAiConsent.upsert({
    where: { tenantId },
    create: { tenantId, granted: false, revokedAt, grantedByUserId },
    update: { granted: false, revokedAt, grantedByUserId },
  });
}
