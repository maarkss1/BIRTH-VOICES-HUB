import { Request, Response, NextFunction } from 'express';
import { attachAuthIfPresent } from './index.js';
import { getPermissionsForRoleName } from '../repositories/roleRepository.js';

export const requireTenant = async (req: Request, res: Response, next: NextFunction) => {
  await attachAuthIfPresent(req, res, () => {
    if (!req.user || !req.tenantId) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
  });
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = req.user;
    if (!session) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    if (!allowedRoles.includes(session.role)) {
      return res.status(403).json({ error: `Acesso proibido. Requer nível: ${allowedRoles.join(' ou ')}.` });
    }

    next();
  };
};

// Permission-based gate: checks whether the caller's role (resolved live against Role/Permission,
// never trusted from a client-supplied claim) grants a named capability, instead of hardcoding a
// list of role names at every call site. See roleRepository.getPermissionsForRoleName for the
// tenant-scoped-role-wins-over-system-role resolution rule, and
// .agents/handoffs/onda-4/11-para-01-supervisor-role-rbac.md for why this replaces
// role-name allowlists such as the old `ROLES_ALLOWED_TO_INTERVENE`.
export async function hasPermission(
  user: { role: string; tenantId: string } | null | undefined,
  permission: string
): Promise<boolean> {
  if (!user?.role || !user.tenantId) return false;
  const permissions = await getPermissionsForRoleName(user.role, user.tenantId);
  return permissions.includes(permission);
}

export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    // Returning the promise is harmless for Express (the return value is ignored) and lets
    // callers/tests await this middleware deterministically instead of racing the async check.
    return hasPermission(req.user, permission)
      .then((allowed) => {
        if (!allowed) {
          return res.status(403).json({ error: `Acesso proibido. Requer a permissão: ${permission}.` });
        }
        next();
      })
      .catch(next);
  };
};
