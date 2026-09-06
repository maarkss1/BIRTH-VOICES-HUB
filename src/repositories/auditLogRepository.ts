import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export function createAuditLog(data: { tenantId?: string; userId: string; action: string; details: unknown }) {
  return prisma.auditLog.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId,
      action: data.action,
      details: (data.details ?? {}) as Prisma.InputJsonValue,
    },
  });
}

// Tenant-scoped, paginated read of the audit trail. Resolves
// .agents/handoffs/onda-2/02-para-01-audit-log-listagem.md — writeAuditLog() already persists
// real events (USER_CREATE_BY_ADMIN, USER_LOGIN, CALL_LOG_CREATE, ...); this is the first read
// path for them. `tenantId` must come from the authenticated session (requireTenant), never from
// client input, same rule as every other tenant-scoped query in this codebase.
export async function listAuditLogsForTenant(
  tenantId: string,
  { page, pageSize }: { page: number; pageSize: number }
) {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      skip,
      take: pageSize,
      include: { user: { select: { email: true } } },
    }),
    prisma.auditLog.count({ where: { tenantId } }),
  ]);
  return { items, total };
}
