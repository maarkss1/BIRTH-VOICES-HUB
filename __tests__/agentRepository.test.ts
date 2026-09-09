import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    agent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma.js';
import {
  listAgentsForTenant,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgentForTenant,
  findAgentByPhoneNumber,
  findAgentById,
} from '../src/repositories/agentRepository.js';

beforeEach(() => vi.clearAllMocks());

describe('agentRepository.listAgentsForTenant', () => {
  it('queries by tenant, excludes soft-deleted rows, orders by createdAt desc', async () => {
    vi.mocked(prisma.agent.findMany).mockResolvedValue([{ id: 'a1' }] as unknown as import("@prisma/client").Agent[]);

    const result = await listAgentsForTenant('tenant-1');

    expect(prisma.agent.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([{ id: 'a1' }]);
  });
});

describe('agentRepository.getAgent', () => {
  it('scopes lookup by id and tenant, excludes soft-deleted rows', async () => {
    vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'a1' } as unknown as import("@prisma/client").Agent);

    const result = await getAgent('a1', 'tenant-1');

    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 'tenant-1', deletedAt: null },
    });
    expect(result).toEqual({ id: 'a1' });
  });
});

describe('agentRepository.createAgent', () => {
  it('creates an agent with provided configuration', async () => {
    vi.mocked(prisma.agent.create).mockResolvedValue({ id: 'a1' } as unknown as import("@prisma/client").Agent);

    const result = await createAgent('tenant-1', 'user-1', {
      name: 'Bot',
      model: 'gpt-4',
      configuration: { foo: 'bar' },
    });

    expect(prisma.agent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        name: 'Bot',
        model: 'gpt-4',
        configuration: { foo: 'bar' },
      },
    });
    expect(result).toEqual({ id: 'a1' });
  });

  it('defaults configuration to an empty object when omitted', async () => {
    vi.mocked(prisma.agent.create).mockResolvedValue({ id: 'a2' } as unknown as import("@prisma/client").Agent);

    await createAgent('tenant-1', 'user-1', { name: 'Bot', model: 'gpt-4' });

    expect(prisma.agent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        name: 'Bot',
        model: 'gpt-4',
        configuration: {},
      },
    });
  });
});

describe('agentRepository.updateAgent', () => {
  it('includes only the fields provided in the update payload', async () => {
    vi.mocked(prisma.agent.updateMany).mockResolvedValue({ count: 1 } as unknown as { count: number });

    const result = await updateAgent('a1', 'tenant-1', { name: 'New Name' });

    expect(prisma.agent.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 'tenant-1', deletedAt: null },
      data: { name: 'New Name' },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('builds an empty update payload when no fields are provided', async () => {
    vi.mocked(prisma.agent.updateMany).mockResolvedValue({ count: 0 } as unknown as { count: number });

    await updateAgent('a1', 'tenant-1', {});

    expect(prisma.agent.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 'tenant-1', deletedAt: null },
      data: {},
    });
  });

  it('includes all fields when all are provided', async () => {
    vi.mocked(prisma.agent.updateMany).mockResolvedValue({ count: 1 } as unknown as { count: number });

    await updateAgent('a1', 'tenant-1', { name: 'N', model: 'M', configuration: { a: 1 } });

    expect(prisma.agent.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 'tenant-1', deletedAt: null },
      data: { name: 'N', model: 'M', configuration: { a: 1 } },
    });
  });
});

describe('agentRepository.deleteAgentForTenant', () => {
  it('soft-deletes by setting deletedAt, scoped to id and tenant', async () => {
    vi.mocked(prisma.agent.updateMany).mockResolvedValue({ count: 1 } as unknown as { count: number });
    const before = Date.now();

    const result = await deleteAgentForTenant('a1', 'tenant-1');

    expect(prisma.agent.updateMany).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.agent.updateMany).mock.calls[0][0] as unknown as import("@prisma/client").Prisma.AgentUpdateManyArgs;
    expect(call.where).toEqual({ id: 'a1', tenantId: 'tenant-1' });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
        const deletedAt = call.data.deletedAt as Date;
    expect(deletedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result).toEqual({ count: 1 });
  });
});

describe('agentRepository.findAgentByPhoneNumber', () => {
  it('queries by phone number, excludes soft-deleted rows', async () => {
    vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'a1' } as unknown as import("@prisma/client").Agent);

    const result = await findAgentByPhoneNumber('+15551234567');

    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { phoneNumber: '+15551234567', deletedAt: null },
    });
    expect(result).toEqual({ id: 'a1' });
  });
});

describe('agentRepository.findAgentById', () => {
  it('queries by id only, excludes soft-deleted rows', async () => {
    vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'a1' } as unknown as import("@prisma/client").Agent);

    const result = await findAgentById('a1');

    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', deletedAt: null },
    });
    expect(result).toEqual({ id: 'a1' });
  });
});
