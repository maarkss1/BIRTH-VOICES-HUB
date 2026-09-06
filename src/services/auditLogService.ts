import { listAuditLogsForTenant } from '../repositories/auditLogRepository.js';

export const AUDIT_LOG_DEFAULT_PAGE_SIZE = 20;
export const AUDIT_LOG_MAX_PAGE_SIZE = 100;

export function parsePagination(rawPage: unknown, rawPageSize: unknown): { page: number; pageSize: number } {
  const page = Math.max(1, Number.parseInt(String(rawPage ?? '1'), 10) || 1);
  const pageSize = Math.min(
    AUDIT_LOG_MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(String(rawPageSize ?? AUDIT_LOG_DEFAULT_PAGE_SIZE), 10) || AUDIT_LOG_DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize };
}

export async function listAuditLog(tenantId: string, page: number, pageSize: number) {
  const { items, total } = await listAuditLogsForTenant(tenantId, { page, pageSize });

  return {
    items: items.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      actorEmail: entry.user?.email ?? null,
      action: entry.action,
      details: entry.details,
      timestamp: entry.timestamp,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
