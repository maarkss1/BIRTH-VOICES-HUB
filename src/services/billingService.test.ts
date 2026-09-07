import { Prisma } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/billingRepository.js', () => ({
  findWalletByTenant: vi.fn(),
  findTransactionsForTenant: vi.fn(),
  findActivePlans: vi.fn(),
  findPlanById: vi.fn(),
  upsertWalletPlan: vi.fn(),
  findTransactionByIdempotencyKey: vi.fn(),
  createTransactionAtomic: vi.fn(),
  isUniqueConstraintViolation: (err: unknown): err is Prisma.PrismaClientKnownRequestError =>
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
}));

import {
  createTransactionAtomic,
  findActivePlans,
  findPlanById,
  findTransactionByIdempotencyKey,
  findTransactionsForTenant,
  findWalletByTenant,
  upsertWalletPlan,
} from '../repositories/billingRepository.js';
import {
  canStartNewSession,
  changePlan,
  getWalletSummary,
  listAvailablePlans,
  listTransactions,
  PlanNotFoundError,
  ProrationNotSupportedError,
  recordTransaction,
  WalletNotFoundError,
} from './billingService.js';

beforeEach(() => vi.clearAllMocks());

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`idempotencyKey`)', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: ['idempotencyKey'] },
  });
}

describe('billingService.getWalletSummary', () => {
  it('returns null (explicit empty state) when the tenant has no Wallet row — never a fabricated balance', async () => {
    vi.mocked(findWalletByTenant).mockResolvedValue(null);

    const result = await getWalletSummary('tenant-1');

    expect(result).toBeNull();
    expect(findWalletByTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('maps the wallet + joined plan to WalletSummary', async () => {
    vi.mocked(findWalletByTenant).mockResolvedValue({
      id: 'wallet-1',
      tenantId: 'tenant-1',
      balanceCents: 5000,
      currency: 'BRL',
      planId: 'plan-1',
      planStatus: 'active',
      currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: { id: 'plan-1', slug: 'pro', name: 'Pro', priceCents: 9900, currency: 'BRL', billingInterval: 'monthly', active: true, createdAt: new Date(), updatedAt: new Date() },
    } as any);

    const result = await getWalletSummary('tenant-1');

    expect(result).toEqual({
      tenantId: 'tenant-1',
      balanceCents: 5000,
      currency: 'BRL',
      planId: 'plan-1',
      planName: 'Pro',
      planStatus: 'active',
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    });
  });
});

describe('billingService.listTransactions', () => {
  it('maps repository rows and returns total', async () => {
    vi.mocked(findTransactionsForTenant).mockResolvedValue([
      [
        {
          id: 'tx-1',
          walletId: 'wallet-1',
          tenantId: 'tenant-1',
          type: 'credit',
          amountCents: 1000,
          balanceAfterCents: 1000,
          status: 'completed',
          description: 'Recarga',
          externalReference: null,
          idempotencyKey: 'key-1',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ],
      1,
    ] as any);

    const result = await listTransactions('tenant-1', { page: 1, pageSize: 20 });

    expect(findTransactionsForTenant).toHaveBeenCalledWith('tenant-1', { page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.items).toEqual([
      {
        id: 'tx-1',
        type: 'credit',
        amountCents: 1000,
        balanceAfterCents: 1000,
        status: 'completed',
        description: 'Recarga',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('billingService.listAvailablePlans', () => {
  it('maps active plans to PlanOption', async () => {
    vi.mocked(findActivePlans).mockResolvedValue([
      { id: 'plan-1', slug: 'pro', name: 'Pro', priceCents: 9900, currency: 'BRL', billingInterval: 'monthly', active: true, createdAt: new Date(), updatedAt: new Date() },
    ] as any);

    const result = await listAvailablePlans();

    expect(result).toEqual([
      { id: 'plan-1', slug: 'pro', name: 'Pro', priceCents: 9900, currency: 'BRL', billingInterval: 'monthly' },
    ]);
  });
});

describe('billingService.changePlan', () => {
  it('rejects next_cycle as an explicit, documented limitation instead of silently applying immediate', async () => {
    await expect(changePlan('tenant-1', 'plan-1', 'user-1', 'next_cycle')).rejects.toBeInstanceOf(
      ProrationNotSupportedError
    );
    expect(findPlanById).not.toHaveBeenCalled();
  });

  it('throws PlanNotFoundError when the plan does not exist', async () => {
    vi.mocked(findPlanById).mockResolvedValue(null);

    await expect(changePlan('tenant-1', 'missing-plan', 'user-1')).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it('throws PlanNotFoundError when the plan exists but is inactive', async () => {
    vi.mocked(findPlanById).mockResolvedValue({
      id: 'plan-1', slug: 'legacy', name: 'Legacy', priceCents: 1000, currency: 'BRL', billingInterval: 'monthly', active: false, createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await expect(changePlan('tenant-1', 'plan-1', 'user-1')).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it('upserts the wallet with the new plan and an immediate-cycle currentPeriodEnd', async () => {
    vi.mocked(findPlanById).mockResolvedValue({
      id: 'plan-1', slug: 'pro', name: 'Pro', priceCents: 9900, currency: 'BRL', billingInterval: 'monthly', active: true, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    vi.mocked(upsertWalletPlan).mockResolvedValue({
      id: 'wallet-1', tenantId: 'tenant-1', balanceCents: 0, currency: 'BRL', planId: 'plan-1', planStatus: 'active', currentPeriodEnd: new Date('2026-10-07T00:00:00.000Z'), createdAt: new Date(), updatedAt: new Date(),
      plan: { id: 'plan-1', slug: 'pro', name: 'Pro', priceCents: 9900, currency: 'BRL', billingInterval: 'monthly', active: true, createdAt: new Date(), updatedAt: new Date() },
    } as any);

    const result = await changePlan('tenant-1', 'plan-1', 'user-1', 'immediate');

    expect(upsertWalletPlan).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ planId: 'plan-1', planStatus: 'active', currency: 'BRL' }));
    expect(result.planId).toBe('plan-1');
    expect(result.planName).toBe('Pro');
  });
});

describe('billingService.recordTransaction — idempotency (AGENTS.md §9 item 16)', () => {
  const input = {
    tenantId: 'tenant-1',
    type: 'debit',
    amountCents: -500,
    idempotencyKey: 'idem-key-1',
    description: 'Uso de sessão',
  };

  it('creates and returns the transaction on the first call', async () => {
    vi.mocked(createTransactionAtomic).mockResolvedValue({
      id: 'tx-1', walletId: 'wallet-1', tenantId: 'tenant-1', type: 'debit', amountCents: -500, balanceAfterCents: 500, status: 'completed', description: 'Uso de sessão', externalReference: null, idempotencyKey: 'idem-key-1', createdAt: new Date('2026-09-01T00:00:00.000Z'),
    } as any);

    const result = await recordTransaction(input);

    expect(result.id).toBe('tx-1');
    expect(result.balanceAfterCents).toBe(500);
    expect(createTransactionAtomic).toHaveBeenCalledTimes(1);
  });

  it('throws WalletNotFoundError when the tenant has no wallet yet, without creating anything', async () => {
    vi.mocked(createTransactionAtomic).mockResolvedValue(null);

    await expect(recordTransaction(input)).rejects.toBeInstanceOf(WalletNotFoundError);
  });

  it('is idempotent: a repeated call with the same idempotencyKey returns the existing transaction instead of throwing or double-crediting', async () => {
    const existing = {
      id: 'tx-1', walletId: 'wallet-1', tenantId: 'tenant-1', type: 'debit', amountCents: -500, balanceAfterCents: 500, status: 'completed', description: 'Uso de sessão', externalReference: null, idempotencyKey: 'idem-key-1', createdAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    // Simulates the second, redelivered call: the Prisma unique constraint on idempotencyKey
    // rejects the second insert (P2002) — exactly what protects against duplicate charging.
    vi.mocked(createTransactionAtomic).mockRejectedValue(uniqueConstraintError());
    vi.mocked(findTransactionByIdempotencyKey).mockResolvedValue(existing as any);

    const result = await recordTransaction(input);

    expect(result.id).toBe('tx-1');
    expect(result.balanceAfterCents).toBe(500);
    expect(findTransactionByIdempotencyKey).toHaveBeenCalledWith('idem-key-1');
  });

  it('re-throws the P2002 error when no existing transaction is found for the key (unexpected state, must not be swallowed)', async () => {
    vi.mocked(createTransactionAtomic).mockRejectedValue(uniqueConstraintError());
    vi.mocked(findTransactionByIdempotencyKey).mockResolvedValue(null);

    await expect(recordTransaction(input)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('re-throws any other (non-P2002) error unchanged', async () => {
    vi.mocked(createTransactionAtomic).mockRejectedValue(new Error('connection lost'));

    await expect(recordTransaction(input)).rejects.toThrow('connection lost');
    expect(findTransactionByIdempotencyKey).not.toHaveBeenCalled();
  });
});

describe('billingService.canStartNewSession', () => {
  it('returns false when the tenant has no wallet', async () => {
    vi.mocked(findWalletByTenant).mockResolvedValue(null);
    expect(await canStartNewSession('tenant-1')).toBe(false);
  });

  it('returns false when the plan is not active/trialing (e.g. past_due)', async () => {
    vi.mocked(findWalletByTenant).mockResolvedValue({
      id: 'wallet-1', tenantId: 'tenant-1', balanceCents: 1000, currency: 'BRL', planId: 'plan-1', planStatus: 'past_due', currentPeriodEnd: null, createdAt: new Date(), updatedAt: new Date(), plan: null,
    } as any);
    expect(await canStartNewSession('tenant-1')).toBe(false);
  });

  it('returns false when the balance is zero or negative even with an active plan', async () => {
    vi.mocked(findWalletByTenant).mockResolvedValue({
      id: 'wallet-1', tenantId: 'tenant-1', balanceCents: 0, currency: 'BRL', planId: 'plan-1', planStatus: 'active', currentPeriodEnd: null, createdAt: new Date(), updatedAt: new Date(), plan: null,
    } as any);
    expect(await canStartNewSession('tenant-1')).toBe(false);
  });

  it('returns true for an active plan with a positive balance', async () => {
    vi.mocked(findWalletByTenant).mockResolvedValue({
      id: 'wallet-1', tenantId: 'tenant-1', balanceCents: 100, currency: 'BRL', planId: 'plan-1', planStatus: 'trialing', currentPeriodEnd: null, createdAt: new Date(), updatedAt: new Date(), plan: null,
    } as any);
    expect(await canStartNewSession('tenant-1')).toBe(true);
  });
});
