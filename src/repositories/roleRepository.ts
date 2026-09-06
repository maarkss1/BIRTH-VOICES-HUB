import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type SystemRoleName = 'admin' | 'user' | 'supervisor';

// Permission catalog. A Permission is a first-class Prisma model attachable to ANY Role (system or
// tenant-custom) — this is the mechanism to grant a capability like "intervene in a live call"
// without inventing another hardcoded role-name string in the client/server (see handoff
// .agents/handoffs/onda-4/11-para-01-supervisor-role-rbac.md, Agente 11 -> Agente 01). Add new
// capabilities here instead of introducing another magic string checked ad-hoc in a controller or
// socket handler.
export const PERMISSIONS: Record<string, string> = {
  'supervision:intervene': 'Permite intervir em uma chamada ao vivo monitorada pelo LiveSupervisor.',
};

// Default permissions granted to a system role the first time it is created (see
// getOrCreateSystemRole below) and backfilled onto already-existing rows by prisma/seed.ts.
// `admin` keeps every capability it had before Permission existed as a first-class concept — no
// regression versus the previous hardcoded `ROLES_ALLOWED_TO_INTERVENE = ['admin']` checks.
// `supervisor` is the new, narrower role a tenant can hand to someone who should be able to
// watch/intervene on live calls without granting full admin rights. `user` stays empty.
export const SYSTEM_ROLE_DEFAULT_PERMISSIONS: Record<SystemRoleName, string[]> = {
  admin: ['supervision:intervene'],
  supervisor: ['supervision:intervene'],
  user: [],
};

export async function getOrCreateSystemRole(name: SystemRoleName) {
  const existing = await prisma.role.findFirst({ where: { name, tenantId: null } });
  if (existing) return existing;

  const defaultPermissionNames = SYSTEM_ROLE_DEFAULT_PERMISSIONS[name] ?? [];
  const data: Prisma.RoleUncheckedCreateInput = { name, tenantId: null, description: `System role: ${name}` };
  if (defaultPermissionNames.length > 0) {
    data.permissions = {
      connectOrCreate: defaultPermissionNames.map((permissionName) => ({
        where: { name: permissionName },
        create: { name: permissionName, description: PERMISSIONS[permissionName] },
      })),
    };
  }
  return prisma.role.create({ data });
}

// Defensive extraction: never trust `.permissions` to be a clean array just because a caller
// claims to have included the relation (a partial mock in a test, a Role fetched without
// `include`, etc.). Fails closed — an unexpected shape yields no permissions rather than throwing.
export function permissionNamesOf(role: { permissions?: unknown } | null | undefined): string[] {
  if (!role || !Array.isArray(role.permissions)) return [];
  return role.permissions
    .filter((p): p is { name: unknown } => !!p && typeof p === 'object' && 'name' in p)
    .map((p) => String(p.name));
}

// Resolves the effective permission set for a role name within a tenant: a tenant-scoped custom
// role of that name wins if one exists, otherwise falls back to the system role of the same name
// (tenantId null). This is queried live (not embedded in the JWT) so that granting/revoking a
// permission on a Role takes effect immediately, without waiting for token refresh.
export async function getPermissionsForRoleName(name: string, tenantId: string): Promise<string[]> {
  const tenantRole = await prisma.role.findFirst({
    where: { name, tenantId },
    include: { permissions: true },
  });
  if (tenantRole) return permissionNamesOf(tenantRole);

  const systemRole = await prisma.role.findFirst({
    where: { name, tenantId: null },
    include: { permissions: true },
  });
  return permissionNamesOf(systemRole);
}
