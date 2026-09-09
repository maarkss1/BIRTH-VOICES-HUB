import * as userRepository from '../repositories/userRepository.js';
import { getOrCreateSystemRole, SystemRoleName } from '../repositories/roleRepository.js';
import { hashPassword } from '../lib/auth-tokens.js';

export class UserServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function toSafeUser(user: { id: string; email: string; companyName: string; createdAt: Date; memberships: { role: { name: string } }[] }) {
  return {
    id: user.id,
    email: user.email,
    companyName: user.companyName,
    role: user.memberships[0]?.role.name || 'user',
    createdAt: user.createdAt,
  };
}

export async function listUsers(tenantId: string) {
  const users = await userRepository.listUsersForTenant(tenantId);
  return users.map(toSafeUser);
}

export async function createUserInTenant(tenantId: string, data: { email: string; password: string; companyName?: string; role?: SystemRoleName }) {
  const existing = await userRepository.findUserByEmail(data.email);
  if (existing) {
    throw new UserServiceError('Este email já está cadastrado.');
  }

  const user = await userRepository.createUser({
    email: data.email,
    passwordHash: hashPassword(data.password),
    companyName: data.companyName || 'Organização Associada',
    tenantId,
  });

  const role = await getOrCreateSystemRole(data.role ?? 'user');
  await userRepository.createMembership(user.id, tenantId, role.id);

  return { id: user.id, email: user.email, role: role.name };
}

export async function updateUserProfile(
  targetId: string,
  tenantId: string,
  requester: { id: string; role: string },
  data: { companyName?: string; role?: SystemRoleName; password?: string }
) {
  if (requester.role !== 'admin' && requester.id !== targetId) {
    throw new UserServiceError('Você não tem permissão para alterar este perfil.', 403);
  }

  const target = await userRepository.findUserById(targetId);
  if (!target || target.tenantId !== tenantId) {
    throw new UserServiceError('Usuário não encontrado.', 404);
  }

  await userRepository.updateUser(targetId, {
    companyName: data.companyName,
    passwordHash: data.password ? hashPassword(data.password) : undefined,
  });

  if (data.role && requester.role === 'admin') {
    const role = await getOrCreateSystemRole(data.role);
    await userRepository.updateMembershipRole(targetId, tenantId, role.id);
  }
}

export async function deleteUser(targetId: string, tenantId: string, requesterId: string) {
  if (requesterId === targetId) {
    throw new UserServiceError('Você não pode excluir o seu próprio usuário admin.');
  }

  const target = await userRepository.findUserById(targetId);
  if (!target || target.tenantId !== tenantId) {
    throw new UserServiceError('Usuário não encontrado.', 404);
  }

  await userRepository.softDeleteUser(targetId);
}

// LGPD data-subject erasure/anonymization request. Self-service (a titular exercising their own
// right to erasure) or admin-initiated on their behalf — same authorization shape as
// updateUserProfile, since both are actions a user is allowed to take on their own account.
export async function anonymizeUserData(
  targetId: string,
  tenantId: string,
  requester: { id: string; role: string }
) {
  if (requester.role !== 'admin' && requester.id !== targetId) {
    throw new UserServiceError('Você não tem permissão para solicitar a exclusão dos dados deste titular.', 403);
  }

  const target = await userRepository.findUserById(targetId);
  if (!target || target.tenantId !== tenantId) {
    throw new UserServiceError('Usuário não encontrado.', 404);
  }

  await userRepository.anonymizeUser(targetId);
}
