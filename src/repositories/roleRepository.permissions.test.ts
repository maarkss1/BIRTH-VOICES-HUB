import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    role: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma.js';
import {
  getOrCreateSystemRole,
  permissionNamesOf,
  getPermissionsForRoleName,
  PERMISSIONS,
  SYSTEM_ROLE_DEFAULT_PERMISSIONS,
} from './roleRepository.js';

beforeEach(() => vi.clearAllMocks());

// Covers the Permission model wiring introduced for
// .agents/handoffs/onda-4/11-para-01-supervisor-role-rbac.md — a Permission is attachable to any
// Role instead of a hardcoded role-name allowlist like the old `ROLES_ALLOWED_TO_INTERVENE`.
describe('roleRepository: Permission catalog', () => {
  it('declares supervision:intervene', () => {
    expect(PERMISSIONS['supervision:intervene']).toBeTruthy();
  });

  it('grants supervision:intervene to admin and supervisor by default, but not to user', () => {
    expect(SYSTEM_ROLE_DEFAULT_PERMISSIONS.admin).toContain('supervision:intervene');
    expect(SYSTEM_ROLE_DEFAULT_PERMISSIONS.supervisor).toContain('supervision:intervene');
    expect(SYSTEM_ROLE_DEFAULT_PERMISSIONS.user).toEqual([]);
  });
});

describe('roleRepository.getOrCreateSystemRole (Permission wiring)', () => {
  it('does not touch the create payload shape for a role with no default permissions (user)', async () => {
    vi.mocked(prisma.role.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.role.create).mockResolvedValue({ id: 'role-user', name: 'user' } as any);

    await getOrCreateSystemRole('user');

    expect(prisma.role.create).toHaveBeenCalledWith({
      data: { name: 'user', tenantId: null, description: 'System role: user' },
    });
  });

  it('connects the default permission when creating the supervisor role for the first time', async () => {
    vi.mocked(prisma.role.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.role.create).mockResolvedValue({ id: 'role-supervisor', name: 'supervisor' } as any);

    await getOrCreateSystemRole('supervisor');

    expect(prisma.role.create).toHaveBeenCalledWith({
      data: {
        name: 'supervisor',
        tenantId: null,
        description: 'System role: supervisor',
        permissions: {
          connectOrCreate: [
            {
              where: { name: 'supervision:intervene' },
              create: { name: 'supervision:intervene', description: PERMISSIONS['supervision:intervene'] },
            },
          ],
        },
      },
    });
  });

  it('returns the existing role untouched without creating one', async () => {
    vi.mocked(prisma.role.findFirst).mockResolvedValue({ id: 'role-admin', name: 'admin' } as any);

    const result = await getOrCreateSystemRole('admin');

    expect(prisma.role.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'role-admin', name: 'admin' });
  });
});

describe('roleRepository.permissionNamesOf', () => {
  it('extracts permission names from a role with a clean permissions array', () => {
    expect(permissionNamesOf({ permissions: [{ name: 'supervision:intervene' }, { name: 'x' }] })).toEqual([
      'supervision:intervene',
      'x',
    ]);
  });

  it('fails closed (empty array) for null/undefined role', () => {
    expect(permissionNamesOf(null)).toEqual([]);
    expect(permissionNamesOf(undefined)).toEqual([]);
  });

  it('fails closed when permissions is not an array (e.g. an un-included relation, or a foreign mock shape)', () => {
    expect(permissionNamesOf({ permissions: { connectOrCreate: [] } })).toEqual([]);
    expect(permissionNamesOf({})).toEqual([]);
  });
});

describe('roleRepository.getPermissionsForRoleName', () => {
  it('prefers a tenant-scoped role of the same name over the system role', async () => {
    vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
      id: 'tenant-role',
      permissions: [{ name: 'custom:thing' }],
    } as any);

    const result = await getPermissionsForRoleName('supervisor', 'tenant-1');

    expect(prisma.role.findFirst).toHaveBeenNthCalledWith(1, {
      where: { name: 'supervisor', tenantId: 'tenant-1' },
      include: { permissions: true },
    });
    expect(result).toEqual(['custom:thing']);
  });

  it('falls back to the system role (tenantId null) when no tenant-scoped role exists', async () => {
    vi.mocked(prisma.role.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'system-role', permissions: [{ name: 'supervision:intervene' }] } as any);

    const result = await getPermissionsForRoleName('supervisor', 'tenant-1');

    expect(prisma.role.findFirst).toHaveBeenNthCalledWith(2, {
      where: { name: 'supervisor', tenantId: null },
      include: { permissions: true },
    });
    expect(result).toEqual(['supervision:intervene']);
  });

  it('returns an empty list (fail closed) when neither a tenant nor a system role matches', async () => {
    vi.mocked(prisma.role.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await getPermissionsForRoleName('nonexistent-role', 'tenant-1');

    expect(result).toEqual([]);
  });
});
