import { v4 as uuidv4 } from 'uuid';
import { hashPassword, verifyPassword, generateToken, generateRefreshToken, verifyRefreshToken, TokenPayload } from '../lib/auth-tokens.js';
import { findUserByEmail, findUserById, createUser, createMembership, findMembershipWithRole } from '../repositories/userRepository.js';
import { createTenant } from '../repositories/tenantRepository.js';
import { getOrCreateSystemRole } from '../repositories/roleRepository.js';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function toPublicUser(user: { id: string; email: string; companyName: string }, role: string) {
  return {
    id: user.id,
    name: user.email.split('@')[0],
    company: user.companyName,
    email: user.email,
    role,
  };
}

export async function register(email: string, password: string, companyName: string) {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AuthError('Este email já está cadastrado.');
  }

  const tenant = await createTenant(companyName);
  const adminRole = await getOrCreateSystemRole('admin');
  const user = await createUser({ email, passwordHash: hashPassword(password), companyName, tenantId: tenant.id });
  await createMembership(user.id, tenant.id, adminRole.id);

  const payload: TokenPayload = { id: user.id, email: user.email, role: 'admin', tenantId: tenant.id };
  const token = generateToken(payload);
  const refreshToken = generateRefreshToken({ id: user.id });

  return { token, refreshToken, user: toPublicUser(user, 'admin'), tenantId: tenant.id };
}

export async function login(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash) || !user.tenantId) {
    throw new AuthError('Credenciais inválidas.', 401);
  }

  const membership = await findMembershipWithRole(user.id, user.tenantId);
  const role = membership?.role.name || 'user';

  const payload: TokenPayload = { id: user.id, email: user.email, role, tenantId: user.tenantId };
  const token = generateToken(payload);
  const refreshToken = generateRefreshToken({ id: user.id });

  return { token, refreshToken, user: toPublicUser(user, role), tenantId: user.tenantId };
}

export async function refreshSession(refreshToken: string) {
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) return null;

  const user = await findUserById(decoded.id);
  if (!user || !user.tenantId) return null;

  const membership = await findMembershipWithRole(user.id, user.tenantId);
  const role = membership?.role.name || 'user';

  const payload: TokenPayload = { id: user.id, email: user.email, role, tenantId: user.tenantId };
  return { token: generateToken(payload), session: payload };
}

export function newId(): string {
  return uuidv4();
}
