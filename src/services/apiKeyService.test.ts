import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/apiKeyRepository.js', () => ({
  createApiKey: vi.fn(),
  listApiKeysForTenant: vi.fn(),
  findApiKeyForTenant: vi.fn(),
  findApiKeyByHash: vi.fn(),
  revokeApiKey: vi.fn(),
  touchLastUsed: vi.fn(),
}));

vi.mock('../repositories/userRepository.js', () => ({
  findUserById: vi.fn(),
  findMembershipWithRole: vi.fn(),
}));

import * as apiKeyRepository from '../repositories/apiKeyRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import {
  ApiKeyServiceError,
  API_KEY_PREFIX,
  authenticateApiKey,
  createApiKeyForTenant,
  isApiKeyFormat,
  listApiKeysForTenant,
  revokeApiKeyForTenant,
} from './apiKeyService.js';

beforeEach(() => {
  vi.clearAllMocks();
  // touchLastUsed is called fire-and-forget (`.catch(...)`) by authenticateApiKey — it must
  // resolve to a real Promise by default, or that `.catch` call throws synchronously.
  vi.mocked(apiKeyRepository.touchLastUsed).mockResolvedValue(undefined);
});

describe('apiKeyService.createApiKeyForTenant', () => {
  it('returns the plaintext key exactly once and never persists it (only a hash goes to the repository)', async () => {
    vi.mocked(apiKeyRepository.createApiKey).mockImplementation(async (data) => ({
      id: 'key-1',
      tenantId: data.tenantId,
      name: data.name,
      scopes: [],
      createdByUserId: data.createdByUserId,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: data.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
    }));

    const result = await createApiKeyForTenant('tenant-1', 'user-1', { name: 'CI key' });

    expect(result.key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(isApiKeyFormat(result.key)).toBe(true);

    const call = vi.mocked(apiKeyRepository.createApiKey).mock.calls[0][0];
    expect(call.tenantId).toBe('tenant-1');
    expect(call.createdByUserId).toBe('user-1');
    // keyHash must never equal (or contain) the plaintext key.
    expect(call.keyHash).not.toBe(result.key);
    expect(call.keyHash.includes(result.key)).toBe(false);
    // Response never carries a `keyHash` field.
    expect(result).not.toHaveProperty('keyHash');
  });

  it('two keys created back to back never collide in plaintext or hash', async () => {
    vi.mocked(apiKeyRepository.createApiKey).mockImplementation(async (data) => ({
      id: `key-${Math.random()}`,
      tenantId: data.tenantId,
      name: data.name,
      scopes: [],
      createdByUserId: data.createdByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: data.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
    }));

    const a = await createApiKeyForTenant('tenant-1', 'user-1', { name: 'Key A' });
    const b = await createApiKeyForTenant('tenant-1', 'user-1', { name: 'Key B' });

    expect(a.key).not.toBe(b.key);
  });
});

describe('apiKeyService.listApiKeysForTenant', () => {
  it('maps repository rows to metadata, never exposing keyHash', async () => {
    vi.mocked(apiKeyRepository.listApiKeysForTenant).mockResolvedValue([
      {
        id: 'key-1',
        tenantId: 'tenant-1',
        name: 'CI key',
        scopes: [],
        createdByUserId: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);

    const result = await listApiKeysForTenant('tenant-1');

    expect(apiKeyRepository.listApiKeysForTenant).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual([
      {
        id: 'key-1',
        name: 'CI key',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastUsedAt: null,
        expiresAt: null,
        revoked: true,
        revokedAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);
    expect(result[0]).not.toHaveProperty('keyHash');
  });
});

describe('apiKeyService.revokeApiKeyForTenant', () => {
  it('throws a 404 ApiKeyServiceError when the key does not belong to this tenant', async () => {
    vi.mocked(apiKeyRepository.findApiKeyForTenant).mockResolvedValue(null);

    await expect(revokeApiKeyForTenant('tenant-A', 'key-owned-by-tenant-B')).rejects.toThrow(ApiKeyServiceError);
    await expect(revokeApiKeyForTenant('tenant-A', 'key-owned-by-tenant-B')).rejects.toMatchObject({ status: 404 });
    expect(apiKeyRepository.revokeApiKey).not.toHaveBeenCalled();
  });

  it('is idempotent: revoking an already-revoked key succeeds without a second write', async () => {
    vi.mocked(apiKeyRepository.findApiKeyForTenant).mockResolvedValue({
      id: 'key-1',
      tenantId: 'tenant-1',
      name: 'CI key',
      scopes: [],
      createdByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await revokeApiKeyForTenant('tenant-1', 'key-1');

    expect(result.revoked).toBe(true);
    expect(apiKeyRepository.revokeApiKey).not.toHaveBeenCalled();
  });

  it('revokes an active key scoped to the caller tenant', async () => {
    vi.mocked(apiKeyRepository.findApiKeyForTenant).mockResolvedValue({
      id: 'key-1',
      tenantId: 'tenant-1',
      name: 'CI key',
      scopes: [],
      createdByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    });
    vi.mocked(apiKeyRepository.revokeApiKey).mockResolvedValue({
      id: 'key-1',
      tenantId: 'tenant-1',
      name: 'CI key',
      scopes: [],
      createdByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: new Date(),
    });

    const result = await revokeApiKeyForTenant('tenant-1', 'key-1');

    expect(apiKeyRepository.revokeApiKey).toHaveBeenCalledWith('key-1');
    expect(result.revoked).toBe(true);
  });
});

describe('apiKeyService.authenticateApiKey', () => {
  it('rejects a key it cannot find (unknown/garbage token)', async () => {
    vi.mocked(apiKeyRepository.findApiKeyByHash).mockResolvedValue(null);

    const result = await authenticateApiKey(`${API_KEY_PREFIX}anything`);

    expect(result).toBeNull();
  });

  it('rejects a revoked key immediately (no cache/grace period)', async () => {
    vi.mocked(apiKeyRepository.findApiKeyByHash).mockResolvedValue({
      id: 'key-1',
      tenantId: 'tenant-1',
      createdByUserId: 'user-1',
      revokedAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: null,
    } as any);

    const result = await authenticateApiKey(`${API_KEY_PREFIX}anything`);

    expect(result).toBeNull();
    expect(userRepository.findUserById).not.toHaveBeenCalled();
  });

  it('rejects an expired key', async () => {
    vi.mocked(apiKeyRepository.findApiKeyByHash).mockResolvedValue({
      id: 'key-1',
      tenantId: 'tenant-1',
      createdByUserId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    } as any);

    const result = await authenticateApiKey(`${API_KEY_PREFIX}anything`);

    expect(result).toBeNull();
  });

  it('authenticates a valid key, resolving to the creator user role/tenant and touching lastUsedAt', async () => {
    vi.mocked(apiKeyRepository.findApiKeyByHash).mockResolvedValue({
      id: 'key-1',
      tenantId: 'tenant-1',
      createdByUserId: 'user-1',
      revokedAt: null,
      expiresAt: null,
    } as any);
    vi.mocked(userRepository.findUserById).mockResolvedValue({
      id: 'user-1',
      email: 'admin@tenant-1.com',
      tenantId: 'tenant-1',
    } as any);
    vi.mocked(userRepository.findMembershipWithRole).mockResolvedValue({
      role: { name: 'admin' },
    } as any);

    const result = await authenticateApiKey(`${API_KEY_PREFIX}anything`);

    expect(result).toEqual({
      apiKeyId: 'key-1',
      session: { id: 'user-1', email: 'admin@tenant-1.com', role: 'admin', tenantId: 'tenant-1' },
    });
    expect(apiKeyRepository.touchLastUsed).toHaveBeenCalledWith('key-1');
  });

  it('fails closed when the creating user no longer belongs to the key tenant (deleted/moved)', async () => {
    vi.mocked(apiKeyRepository.findApiKeyByHash).mockResolvedValue({
      id: 'key-1',
      tenantId: 'tenant-1',
      createdByUserId: 'user-1',
      revokedAt: null,
      expiresAt: null,
    } as any);
    vi.mocked(userRepository.findUserById).mockResolvedValue(null);

    const result = await authenticateApiKey(`${API_KEY_PREFIX}anything`);

    expect(result).toBeNull();
  });
});
