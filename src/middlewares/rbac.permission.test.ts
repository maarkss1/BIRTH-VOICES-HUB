import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../repositories/roleRepository.js', () => ({
  getPermissionsForRoleName: vi.fn(),
}));

import { getPermissionsForRoleName } from '../repositories/roleRepository.js';
import { hasPermission, requirePermission } from './rbac.js';

beforeEach(() => vi.clearAllMocks());

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

// Covers the permission-based gate introduced for
// .agents/handoffs/onda-4/11-para-01-supervisor-role-rbac.md, replacing hardcoded role-name
// allowlists (e.g. the old `ROLES_ALLOWED_TO_INTERVENE`) with a live Role -> Permission check.
describe('rbac.hasPermission', () => {
  it('fails closed for an unauthenticated (null/undefined) caller', async () => {
    expect(await hasPermission(null, 'supervision:intervene')).toBe(false);
    expect(await hasPermission(undefined, 'supervision:intervene')).toBe(false);
    expect(getPermissionsForRoleName).not.toHaveBeenCalled();
  });

  it('fails closed when the caller has no tenant', async () => {
    expect(await hasPermission({ role: 'admin', tenantId: '' }, 'supervision:intervene')).toBe(false);
  });

  it('grants when the resolved permission set includes the requested permission', async () => {
    vi.mocked(getPermissionsForRoleName).mockResolvedValue(['supervision:intervene']);

    const result = await hasPermission({ role: 'supervisor', tenantId: 'tenant-1' }, 'supervision:intervene');

    expect(getPermissionsForRoleName).toHaveBeenCalledWith('supervisor', 'tenant-1');
    expect(result).toBe(true);
  });

  it('denies when the resolved permission set does not include the requested permission', async () => {
    vi.mocked(getPermissionsForRoleName).mockResolvedValue([]);

    const result = await hasPermission({ role: 'user', tenantId: 'tenant-1' }, 'supervision:intervene');

    expect(result).toBe(false);
  });
});

describe('rbac.requirePermission (Express middleware)', () => {
  it('rejects with 401 when there is no authenticated session', async () => {
    const req = { user: undefined } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await requirePermission('supervision:intervene')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the session lacks the permission', async () => {
    vi.mocked(getPermissionsForRoleName).mockResolvedValue([]);
    const req = { user: { id: 'u1', email: 'u1@example.com', role: 'user', tenantId: 't1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await requirePermission('supervision:intervene')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the session has the permission', async () => {
    vi.mocked(getPermissionsForRoleName).mockResolvedValue(['supervision:intervene']);
    const req = { user: { id: 'u1', email: 'u1@example.com', role: 'supervisor', tenantId: 't1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await requirePermission('supervision:intervene')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('funnels a lookup failure into next(err) instead of throwing or hanging', async () => {
    const boom = new Error('db down');
    vi.mocked(getPermissionsForRoleName).mockRejectedValue(boom);
    const req = { user: { id: 'u1', email: 'u1@example.com', role: 'user', tenantId: 't1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await requirePermission('supervision:intervene')(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
  });
});
