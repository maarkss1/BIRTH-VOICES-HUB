import { prisma } from '../lib/prisma.js';

export function createTenant(name: string) {
  return prisma.tenant.create({ data: { name } });
}

export function findTenantById(id: string) {
  return prisma.tenant.findFirst({ where: { id, deletedAt: null } });
}

// Used by `src/services/slaScheduler.ts` to fan out one `platform_ready_check` Metric row per
// active tenant on every periodic readiness sample — `Metric.tenantId` is a required FK to
// `Tenant` (see prisma/schema.prisma), so a platform-wide event with no tenant cannot be persisted
// there directly; this returns only the ids of tenants that still have a real row to attach to.
export async function listActiveTenantIds(): Promise<string[]> {
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null }, select: { id: true } });
  return tenants.map((t) => t.id);
}
