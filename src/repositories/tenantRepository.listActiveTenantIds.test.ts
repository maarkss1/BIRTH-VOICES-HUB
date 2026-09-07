import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma.js';
import { listActiveTenantIds } from './tenantRepository.js';

beforeEach(() => vi.clearAllMocks());

// Covers `.agents/handoffs/onda-4/10-para-02-sla-telemetria-overview.md` — the SLA sampler in
// `src/services/slaScheduler.ts` fans a `Metric` row out to every active tenant on each tick since
// `Metric.tenantId` is a required FK with no platform-wide sentinel row.
describe('tenantRepository.listActiveTenantIds', () => {
  it('excludes soft-deleted tenants and returns only ids', async () => {
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([{ id: 't1' }, { id: 't2' }] as any);

    const result = await listActiveTenantIds();

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({ where: { deletedAt: null }, select: { id: true } });
    expect(result).toEqual(['t1', 't2']);
  });

  it('returns an empty array when there are no active tenants (never fabricates one)', async () => {
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([] as any);

    const result = await listActiveTenantIds();

    expect(result).toEqual([]);
  });
});
