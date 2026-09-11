import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma.js';
import { createAuditLog } from '../src/repositories/auditLogRepository.js';
import { AuditLog } from '@prisma/client';

beforeEach(() => vi.clearAllMocks());

describe('auditLogRepository.createAuditLog', () => {
  it('creates an audit log entry with provided details and tenantId', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as AuditLog);

    const result = await createAuditLog({
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: 'LOGIN',
      details: { ip: '1.2.3.4' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'LOGIN',
        details: { ip: '1.2.3.4' },
      },
    });
    expect(result).toEqual({ id: 'log-1' });
  });

  it('defaults details to an empty object when omitted (undefined)', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-2' } as AuditLog);

    await createAuditLog({ userId: 'user-1', action: 'LOGOUT', details: undefined });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: undefined,
        userId: 'user-1',
        action: 'LOGOUT',
        details: {},
      },
    });
  });

  it('defaults details to an empty object when details is null', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-3' } as AuditLog);

    await createAuditLog({ userId: 'user-1', action: 'LOGOUT', details: null });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: undefined,
        userId: 'user-1',
        action: 'LOGOUT',
        details: {},
      },
    });
  });

  it('propagates errors if prisma.auditLog.create fails', async () => {
    const error = new Error('Database connection failed');
    vi.mocked(prisma.auditLog.create).mockRejectedValue(error);

    await expect(
      createAuditLog({
        userId: 'user-1',
        action: 'ERROR_TEST',
        details: { foo: 'bar' },
      })
    ).rejects.toThrow('Database connection failed');
  });
});
