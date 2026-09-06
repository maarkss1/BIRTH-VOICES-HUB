import { PrismaClient } from '@prisma/client';
import { logger } from '../src/lib/logger.js';
import {
  getOrCreateSystemRole,
  permissionNamesOf,
  PERMISSIONS,
  SYSTEM_ROLE_DEFAULT_PERMISSIONS,
  type SystemRoleName,
} from '../src/repositories/roleRepository.js';

const prisma = new PrismaClient();

const SYSTEM_ROLE_NAMES: SystemRoleName[] = ['admin', 'user', 'supervisor'];

async function main() {
  // Permission catalog first — the connect below assumes these rows already exist.
  for (const [name, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { name },
      update: { description },
      create: { name, description },
    });
  }

  for (const name of SYSTEM_ROLE_NAMES) {
    const role = await getOrCreateSystemRole(name);
    logger.info(`System role ready: ${name}`);

    // Backfill: getOrCreateSystemRole only wires default permissions at the moment a role is
    // first created. A database seeded before `Permission` existed as a first-class concept (or
    // before the `supervisor` role was added) would otherwise never pick up its default
    // permission set. Idempotent — safe to rerun on every deploy.
    const current = await prisma.role.findUnique({ where: { id: role.id }, include: { permissions: true } });
    const currentPermissionNames = new Set(permissionNamesOf(current));
    const missing = (SYSTEM_ROLE_DEFAULT_PERMISSIONS[name] ?? []).filter((p) => !currentPermissionNames.has(p));

    if (missing.length > 0) {
      await prisma.role.update({
        where: { id: role.id },
        data: { permissions: { connect: missing.map((permissionName) => ({ name: permissionName })) } },
      });
      logger.info(`Granted permission(s) [${missing.join(', ')}] to system role: ${name}`);
    }
  }
}

main()
  .catch((err) => {
    logger.error('Seed failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
