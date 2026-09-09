import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/auditLogRepository.js', () => ({
  listAuditLogsForTenant: vi.fn(),
}));

import { listAuditLogsForTenant } from '../repositories/auditLogRepository.js';
import { listAuditLog, parsePagination } from './auditLogService.js';

beforeEach(() => vi.clearAllMocks());

// Resolves .agents/handoffs/onda-2/02-para-01-audit-log-listagem.md: a real, tenant-scoped,
// paginated GET for the audit trail that pages/Dashboard/Organization.tsx (Agente 02) can consume
// instead of the honest-but-empty EmptyState it shows today.
describe('auditLogService.parsePagination', () => {
  it('defaults to page 1 / pageSize 20 when nothing is provided', () => {
    expect(parsePagination(undefined, undefined)).toEqual({ page: 1, pageSize: 20 });
  });

  it('parses valid numeric strings (as query params arrive)', () => {
    expect(parsePagination('3', '50')).toEqual({ page: 3, pageSize: 50 });
  });

  it('clamps pageSize to the maximum instead of trusting client input', () => {
    expect(parsePagination('1', '99999')).toEqual({ page: 1, pageSize: 100 });
  });

  it('floors page and pageSize at 1 for zero/negative/garbage input', () => {
    expect(parsePagination('0', '-5')).toEqual({ page: 1, pageSize: 1 });
    expect(parsePagination('not-a-number', 'also-not-a-number')).toEqual({ page: 1, pageSize: 20 });
  });
});

describe('auditLogService.listAuditLog', () => {
  it('maps repository rows to the API shape and computes totalPages', async () => {
    vi.mocked(listAuditLogsForTenant).mockResolvedValue({
      items: [
        {
          id: 'log-1',
          userId: 'user-1',
          action: 'USER_LOGIN',
          details: {},
          timestamp: new Date('2026-01-01T00:00:00.000Z'),
          user: { email: 'admin@example.com' },
        },
        {
          id: 'log-2',
          userId: null,
          action: 'SYSTEM_EVENT',
          details: { note: 'x' },
          timestamp: new Date('2026-01-02T00:00:00.000Z'),
          user: null,
        },
      ],
      total: 42,
    } as any);

    const result = await listAuditLog('tenant-1', 1, 20);

    expect(listAuditLogsForTenant).toHaveBeenCalledWith('tenant-1', { page: 1, pageSize: 20 });
    expect(result.total).toBe(42);
    expect(result.totalPages).toBe(3);
    expect(result.items).toEqual([
      {
        id: 'log-1',
        userId: 'user-1',
        actorEmail: 'admin@example.com',
        action: 'USER_LOGIN',
        details: {},
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'log-2',
        userId: null,
        actorEmail: null,
        action: 'SYSTEM_EVENT',
        details: { note: 'x' },
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
  });

  it('reports at least 1 total page even when there are zero entries', async () => {
    vi.mocked(listAuditLogsForTenant).mockResolvedValue({ items: [], total: 0 } as any);

    const result = await listAuditLog('tenant-1', 1, 20);

    expect(result.totalPages).toBe(1);
    expect(result.items).toEqual([]);
  });
});
