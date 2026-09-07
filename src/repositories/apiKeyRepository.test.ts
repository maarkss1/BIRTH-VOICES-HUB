import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    aPIKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma.js';
import {
  API_KEY_SAFE_SELECT,
  createApiKey,
  findApiKeyByHash,
  findApiKeyForTenant,
  listApiKeysForTenant,
  revokeApiKey,
  touchLastUsed,
} from './apiKeyRepository.js';

beforeEach(() => vi.clearAllMocks());

describe('apiKeyRepository', () => {
  it('createApiKey never selects keyHash back out (safe select shape)', async () => {
    expect(API_KEY_SAFE_SELECT).not.toHaveProperty('keyHash');

    vi.mocked(prisma.aPIKey.create).mockResolvedValue({ id: 'key-1' } as any);

    await createApiKey({
      tenantId: 'tenant-1',
      name: 'CI key',
      keyHash: 'hash-value',
      createdByUserId: 'user-1',
      expiresAt: null,
    });

    expect(prisma.aPIKey.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        name: 'CI key',
        keyHash: 'hash-value',
        createdByUserId: 'user-1',
        expiresAt: null,
      },
      select: API_KEY_SAFE_SELECT,
    });
  });

  it('listApiKeysForTenant scopes by tenantId and uses the safe select', async () => {
    vi.mocked(prisma.aPIKey.findMany).mockResolvedValue([]);

    await listApiKeysForTenant('tenant-1');

    expect(prisma.aPIKey.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      select: API_KEY_SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findApiKeyForTenant scopes lookup by id AND tenantId (cross-tenant lookup returns null)', async () => {
    vi.mocked(prisma.aPIKey.findFirst).mockResolvedValue(null);

    const result = await findApiKeyForTenant('key-1', 'tenant-1');

    expect(prisma.aPIKey.findFirst).toHaveBeenCalledWith({
      where: { id: 'key-1', tenantId: 'tenant-1' },
      select: API_KEY_SAFE_SELECT,
    });
    expect(result).toBeNull();
  });

  it('findApiKeyByHash is the only function that reads the raw model (no select filter, needed for hash comparison)', async () => {
    vi.mocked(prisma.aPIKey.findUnique).mockResolvedValue({ id: 'key-1', keyHash: 'hash-value' } as any);

    const result = await findApiKeyByHash('hash-value');

    expect(prisma.aPIKey.findUnique).toHaveBeenCalledWith({ where: { keyHash: 'hash-value' } });
    expect(result).toEqual({ id: 'key-1', keyHash: 'hash-value' });
  });

  it('revokeApiKey sets revokedAt to a Date via update', async () => {
    vi.mocked(prisma.aPIKey.update).mockResolvedValue({ id: 'key-1', revokedAt: new Date() } as any);

    await revokeApiKey('key-1');

    expect(prisma.aPIKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { revokedAt: expect.any(Date) },
      select: API_KEY_SAFE_SELECT,
    });
  });

  it('touchLastUsed updates lastUsedAt and never throws to the caller on failure', async () => {
    vi.mocked(prisma.aPIKey.update).mockResolvedValue({ id: 'key-1' } as any);

    await expect(touchLastUsed('key-1')).resolves.toBeUndefined();
    expect(prisma.aPIKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });
});
