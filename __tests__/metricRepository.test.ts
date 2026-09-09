import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    metric: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma.js';
import { listMetricsForUser, createMetric, deleteMetricsForUser } from '../src/repositories/metricRepository.js';

beforeEach(() => vi.clearAllMocks());

describe('metricRepository.listMetricsForUser', () => {
  it('queries by tenant, orders by timestamp desc, limits to 1000, and merges in tenant-wide (userId null) events alongside the caller\'s own', async () => {
    const ownMetric = { id: 'm1', userId: 'user-1', timestamp: new Date('2026-01-01T00:00:00Z') };
    const tenantWideMetric = { id: 'm2', userId: null, timestamp: new Date('2026-01-02T00:00:00Z') };
    vi.mocked(prisma.metric.findMany)
      .mockResolvedValueOnce([ownMetric] as any)
      .mockResolvedValueOnce([tenantWideMetric] as any);

    const result = await listMetricsForUser('tenant-1', 'user-1');

    expect(prisma.metric.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', userId: 'user-1' },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });
    expect(prisma.metric.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', userId: null },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });
    // Merged and re-sorted by timestamp desc across both queries, not just concatenated.
    expect(result).toEqual([tenantWideMetric, ownMetric]);
  });
});

describe('metricRepository.createMetric', () => {
  it('creates a metric with provided tags', async () => {
    vi.mocked(prisma.metric.create).mockResolvedValue({ id: 'm1' } as any);

    const result = await createMetric('tenant-1', 'user-1', {
      name: 'latency',
      value: 42,
      tags: { region: 'us' },
    });

    expect(prisma.metric.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        name: 'latency',
        value: 42,
        tags: { region: 'us' },
      },
    });
    expect(result).toEqual({ id: 'm1' });
  });

  it('defaults tags to an empty object when omitted', async () => {
    vi.mocked(prisma.metric.create).mockResolvedValue({ id: 'm2' } as any);

    await createMetric('tenant-1', 'user-1', { name: 'latency', value: 10 });

    expect(prisma.metric.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        name: 'latency',
        value: 10,
        tags: {},
      },
    });
  });

  it('accepts a null userId for tenant-wide events with no single attributable user (e.g. an AI provider call)', async () => {
    vi.mocked(prisma.metric.create).mockResolvedValue({ id: 'm3' } as any);

    await createMetric('tenant-1', null, { name: 'ai_call_cost_usd', value: 0.0021, tags: { provider: 'GoogleGemini' } });

    expect(prisma.metric.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: null,
        name: 'ai_call_cost_usd',
        value: 0.0021,
        tags: { provider: 'GoogleGemini' },
      },
    });
  });
});

describe('metricRepository.deleteMetricsForUser', () => {
  it('deletes all metrics scoped to tenant and user', async () => {
    vi.mocked(prisma.metric.deleteMany).mockResolvedValue({ count: 3 } as any);

    const result = await deleteMetricsForUser('tenant-1', 'user-1');

    expect(prisma.metric.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', userId: 'user-1' } });
    expect(result).toEqual({ count: 3 });
  });
});
