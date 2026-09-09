import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    atlasGRCallResult: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma.js';
import {
  upsertAtlasGRCallResult,
  findAtlasGRCallResultByCallId,
  listAtlasGRCallResultsForTenant,
} from './atlasGRCallResultRepository.js';

beforeEach(() => vi.clearAllMocks());

// Covers .agents/handoffs/onda-1/06-para-01-persistir-resultado-bland.md.
describe('atlasGRCallResultRepository.upsertAtlasGRCallResult', () => {
  it('upserts by callId (idempotent on redelivery, no fake tenant association)', async () => {
    vi.mocked(prisma.atlasGRCallResult.upsert).mockResolvedValue({ id: 'row-1' } as any);

    await upsertAtlasGRCallResult({ callId: 'call-123', status: 'completed' });

    expect(prisma.atlasGRCallResult.upsert).toHaveBeenCalledWith({
      where: { callId: 'call-123' },
      create: {
        callId: 'call-123',
        tenantId: null,
        leadId: null,
        status: 'completed',
        completed: null,
        callLength: null,
      },
      update: {
        tenantId: null,
        leadId: null,
        status: 'completed',
        completed: null,
        callLength: null,
      },
    });
  });

  it('passes tenantId through when the caller has one (e.g. ATLASGR_TENANT_ID), but never invents one', async () => {
    vi.mocked(prisma.atlasGRCallResult.upsert).mockResolvedValue({ id: 'row-2' } as any);

    await upsertAtlasGRCallResult({
      callId: 'call-456',
      tenantId: 'tenant-abc',
      leadId: 'lead-1',
      status: 'no-answer',
      completed: false,
      callLength: 12.5,
    });

    const call = vi.mocked(prisma.atlasGRCallResult.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ callId: 'call-456' });
    expect(call.create).toMatchObject({ tenantId: 'tenant-abc', leadId: 'lead-1', callLength: 12.5 });
  });
});

describe('atlasGRCallResultRepository.findAtlasGRCallResultByCallId', () => {
  it('looks up by the unique callId', async () => {
    vi.mocked(prisma.atlasGRCallResult.findUnique).mockResolvedValue({ id: 'row-1', callId: 'call-123' } as any);

    const result = await findAtlasGRCallResultByCallId('call-123');

    expect(prisma.atlasGRCallResult.findUnique).toHaveBeenCalledWith({ where: { callId: 'call-123' } });
    expect(result).toEqual({ id: 'row-1', callId: 'call-123' });
  });
});

describe('atlasGRCallResultRepository.listAtlasGRCallResultsForTenant', () => {
  it('scopes strictly to the given tenantId (never trusts client input, AGENTS.md §15)', async () => {
    vi.mocked(prisma.atlasGRCallResult.findMany).mockResolvedValue([{ id: 'row-1' }] as any);
    vi.mocked(prisma.atlasGRCallResult.count).mockResolvedValue(1);

    const result = await listAtlasGRCallResultsForTenant('tenant-abc', { page: 1, pageSize: 20 });

    expect(prisma.atlasGRCallResult.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-abc' },
      orderBy: { receivedAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(prisma.atlasGRCallResult.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-abc' } });
    expect(result).toEqual({ items: [{ id: 'row-1' }], total: 1 });
  });
});
