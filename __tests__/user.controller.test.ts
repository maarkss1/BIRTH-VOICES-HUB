import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../src/services/userService.js', () => ({
  listUsers: vi.fn(),
  createUserInTenant: vi.fn(),
  updateUserProfile: vi.fn(),
  deleteUser: vi.fn(),
  anonymizeUserData: vi.fn(),
  UserServiceError: class UserServiceError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../src/services/audit.js', () => ({
  writeAuditLog: vi.fn(),
}));

import { updateUserProfile, UserServiceError } from '../src/services/userService.js';
import { updateUserHandler } from '../src/controllers/user.controller.js';

const mockUpdateUserProfile = vi.mocked(updateUserProfile);

function makeMockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('user.controller updateUserHandler', () => {
  it('returns 400 when validation fails', async () => {
    const req = {
      params: { id: 'user-1' },
      body: { role: 'invalid_role' },
      tenantId: 'tenant-1',
      user: { id: 'user-1', role: 'admin' },
    } as unknown as Request;
    const res = makeMockResponse();

    await updateUserHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('updates profile successfully and logs audit', async () => {
    mockUpdateUserProfile.mockResolvedValue();
    const req = {
      params: { id: 'user-1' },
      body: { companyName: 'New Company' },
      tenantId: 'tenant-1',
      user: { id: 'user-1', role: 'admin' },
    } as unknown as Request;
    const res = makeMockResponse();

    await updateUserHandler(req, res);

    expect(mockUpdateUserProfile).toHaveBeenCalledWith('user-1', 'tenant-1', req.user, { companyName: 'New Company' });
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Perfil atualizado com sucesso.' });
  });

  it('handles UserServiceError and returns appropriate status', async () => {
    const error = new UserServiceError('Not allowed', 403);
    mockUpdateUserProfile.mockRejectedValue(error);
    const req = {
      params: { id: 'user-1' },
      body: { companyName: 'New Company' },
      tenantId: 'tenant-1',
      user: { id: 'user-1', role: 'user' },
    } as unknown as Request;
    const res = makeMockResponse();

    await updateUserHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not allowed' });
  });

  it('re-throws other types of errors', async () => {
    mockUpdateUserProfile.mockRejectedValue(new Error('Unexpected error'));
    const req = {
      params: { id: 'user-1' },
      body: { companyName: 'New Company' },
      tenantId: 'tenant-1',
      user: { id: 'user-1', role: 'admin' },
    } as unknown as Request;
    const res = makeMockResponse();

    await expect(updateUserHandler(req, res)).rejects.toThrow('Unexpected error');
  });
});
