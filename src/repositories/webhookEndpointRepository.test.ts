import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tenantWebhookEndpoint: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma.js';
import {
  countActiveEndpointsForTenant,
  createEndpoint,
  listEndpointsForTenant,
  listActiveEndpointsForTenant,
  findEndpointForTenant,
  findActiveEndpointById,
  deleteEndpoint,
  regenerateSecret,
  recordDeliveryResult,
} from './webhookEndpointRepository.js';

beforeEach(() => vi.clearAllMocks());

const baseRow = {
  id: 'endpoint-1',
  tenantId: 'tenant-1',
  url: 'https://example.com/hooks',
  secretHash: 'hash-value',
  events: ['call.completed', 'lead.qualified'],
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  lastDeliveryAt: null,
  lastDeliveryStatus: null,
};

describe('webhookEndpointRepository', () => {
  describe('countActiveEndpointsForTenant', () => {
    it('scopes the count by tenantId AND active:true (never counts inactive or another tenant)', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.count).mockResolvedValue(3);

      const result = await countActiveEndpointsForTenant('tenant-1');

      expect(prisma.tenantWebhookEndpoint.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', active: true },
      });
      expect(result).toBe(3);
    });
  });

  describe('createEndpoint', () => {
    it('persists tenantId/url/secretHash/events and never leaks secretHash back as anything but the field itself', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.create).mockResolvedValue(baseRow as any);

      const result = await createEndpoint({
        tenantId: 'tenant-1',
        url: 'https://example.com/hooks',
        secretHash: 'hash-value',
        events: ['call.completed', 'lead.qualified'],
      });

      expect(prisma.tenantWebhookEndpoint.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          url: 'https://example.com/hooks',
          secretHash: 'hash-value',
          events: ['call.completed', 'lead.qualified'],
        },
      });
      expect(result.events).toEqual(['call.completed', 'lead.qualified']);
    });
  });

  describe('listEndpointsForTenant', () => {
    it('scopes the query by tenantId in the WHERE clause and orders by createdAt desc', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.findMany).mockResolvedValue([baseRow] as any);

      const result = await listEndpointsForTenant('tenant-1');

      expect(prisma.tenantWebhookEndpoint.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('endpoint-1');
    });

    it('never returns a row belonging to another tenant (cross-tenant isolation at the query boundary)', async () => {
      // Even if a caller mistakenly passed a query that matched every tenant, this test locks the
      // WHERE shape that prevents it — the mock only returns what is explicitly stubbed for the
      // exact `tenantId` requested.
      vi.mocked(prisma.tenantWebhookEndpoint.findMany).mockImplementation(((args: any) => {
        return Promise.resolve(args.where.tenantId === 'tenant-1' ? [baseRow] : []);
      }) as any);

      const resultA = await listEndpointsForTenant('tenant-1');
      const resultB = await listEndpointsForTenant('tenant-2');

      expect(resultA).toHaveLength(1);
      expect(resultB).toHaveLength(0);
    });

    it('normalizes an unexpected events JSON shape defensively (never throws, never fabricates)', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.findMany).mockResolvedValue([
        { ...baseRow, events: 'not-an-array' },
        { ...baseRow, id: 'endpoint-2', events: ['call.completed', 42, null, 'lead.qualified'] },
        { ...baseRow, id: 'endpoint-3', events: null },
      ] as any);

      const result = await listEndpointsForTenant('tenant-1');

      expect(result[0].events).toEqual([]);
      expect(result[1].events).toEqual(['call.completed', 'lead.qualified']);
      expect(result[2].events).toEqual([]);
    });
  });

  describe('listActiveEndpointsForTenant', () => {
    it('scopes by tenantId AND active:true in the WHERE clause (active-only filtering happens in the query, not after fetch)', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.findMany).mockResolvedValue([baseRow] as any);

      await listActiveEndpointsForTenant('tenant-1');

      expect(prisma.tenantWebhookEndpoint.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', active: true },
      });
    });
  });

  describe('findEndpointForTenant', () => {
    it('scopes lookup by id AND tenantId (cross-tenant lookup returns null instead of leaking existence)', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.findFirst).mockResolvedValue(null);

      const result = await findEndpointForTenant('endpoint-1', 'tenant-2');

      expect(prisma.tenantWebhookEndpoint.findFirst).toHaveBeenCalledWith({
        where: { id: 'endpoint-1', tenantId: 'tenant-2' },
      });
      expect(result).toBeNull();
    });

    it('returns the mapped record when id and tenantId both match', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.findFirst).mockResolvedValue(baseRow as any);

      const result = await findEndpointForTenant('endpoint-1', 'tenant-1');

      expect(result?.id).toBe('endpoint-1');
      expect(result?.tenantId).toBe('tenant-1');
    });
  });

  describe('findActiveEndpointById', () => {
    it('is intentionally global (no tenantId in the WHERE clause) but still active-only', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.findFirst).mockResolvedValue(baseRow as any);

      await findActiveEndpointById('endpoint-1');

      expect(prisma.tenantWebhookEndpoint.findFirst).toHaveBeenCalledWith({
        where: { id: 'endpoint-1', active: true },
      });
    });

    it('returns null for a deactivated/deleted endpoint rather than throwing', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.findFirst).mockResolvedValue(null);

      const result = await findActiveEndpointById('endpoint-1');

      expect(result).toBeNull();
    });
  });

  describe('deleteEndpoint', () => {
    it('deletes by id', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.delete).mockResolvedValue(baseRow as any);

      await deleteEndpoint('endpoint-1');

      expect(prisma.tenantWebhookEndpoint.delete).toHaveBeenCalledWith({ where: { id: 'endpoint-1' } });
    });
  });

  describe('regenerateSecret', () => {
    it('updates only secretHash by id and returns the mapped record', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.update).mockResolvedValue({
        ...baseRow,
        secretHash: 'new-hash',
      } as any);

      const result = await regenerateSecret('endpoint-1', 'new-hash');

      expect(prisma.tenantWebhookEndpoint.update).toHaveBeenCalledWith({
        where: { id: 'endpoint-1' },
        data: { secretHash: 'new-hash' },
      });
      expect(result.secretHash).toBe('new-hash');
    });
  });

  describe('recordDeliveryResult', () => {
    it('writes lastDeliveryAt (a fresh Date) and lastDeliveryStatus by id', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.update).mockResolvedValue(baseRow as any);

      await recordDeliveryResult('endpoint-1', 'delivered');

      expect(prisma.tenantWebhookEndpoint.update).toHaveBeenCalledWith({
        where: { id: 'endpoint-1' },
        data: { lastDeliveryAt: expect.any(Date), lastDeliveryStatus: 'delivered' },
      });
    });

    it('propagates a Prisma failure to the caller (fire-and-forget is the caller webhook.worker.ts\'s responsibility, not this function\'s)', async () => {
      vi.mocked(prisma.tenantWebhookEndpoint.update).mockRejectedValue(new Error('endpoint was deleted'));

      await expect(recordDeliveryResult('endpoint-1', 'delivered')).rejects.toThrow('endpoint was deleted');
    });
  });
});
