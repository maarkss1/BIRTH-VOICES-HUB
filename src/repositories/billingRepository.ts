// Prisma access for the billing domain (Agente 12 — Growth, Billing e Monetização de Uso).
//
// Kept intentionally thin: every function here is a direct Prisma query/mutation with no
// business rules (idempotency handling, plan validation, DTO mapping) — that logic lives in
// `src/services/billingService.ts`, which is the only caller of this file (Clean Architecture,
// AGENTS.md §2: Controller → Service → Repository, no Prisma access outside `src/repositories/**`).
import { Plan, Prisma, Transaction, Wallet } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type WalletWithPlan = Wallet & { plan: Plan | null };

export function findWalletByTenant(tenantId: string): Promise<WalletWithPlan | null> {
  return prisma.wallet.findUnique({ where: { tenantId }, include: { plan: true } });
}

export function findTransactionsForTenant(
  tenantId: string,
  { page, pageSize }: { page: number; pageSize: number }
): Promise<[Transaction[], number]> {
  const skip = (page - 1) * pageSize;
  return Promise.all([
    prisma.transaction.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.transaction.count({ where: { tenantId } }),
  ]);
}

export function findActivePlans(): Promise<Plan[]> {
  return prisma.plan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' } });
}

export function findPlanById(planId: string): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { id: planId } });
}

// One row per tenant (Wallet.tenantId is @unique) — creates the wallet on first plan change if
// the tenant never had one (see .agents/handoffs/onda-4/01-para-12-schema-billing-pronto.md:
// "isso é decisão de produto sua" — this file's decision is "first plan change is the creation
// trigger"), otherwise updates the existing row in place.
export function upsertWalletPlan(
  tenantId: string,
  data: { planId: string; planStatus: string; currentPeriodEnd: Date | null; currency: string }
): Promise<WalletWithPlan> {
  return prisma.wallet.upsert({
    where: { tenantId },
    create: {
      tenantId,
      planId: data.planId,
      planStatus: data.planStatus,
      currentPeriodEnd: data.currentPeriodEnd,
      currency: data.currency,
      balanceCents: 0,
    },
    update: {
      planId: data.planId,
      planStatus: data.planStatus,
      currentPeriodEnd: data.currentPeriodEnd,
    },
    include: { plan: true },
  });
}

export function findTransactionByIdempotencyKey(idempotencyKey: string): Promise<Transaction | null> {
  return prisma.transaction.findUnique({ where: { idempotencyKey } });
}

// Atomically applies the balance delta and creates the matching transaction row inside one Prisma
// interactive transaction, so a mid-way failure never leaves a `Transaction` row without the
// matching `Wallet.balanceCents` update (or vice versa). Returns `null` when the tenant has no
// wallet yet (caller decides how to surface that — never fabricate a wallet here). Lets the raw
// Prisma error propagate on a duplicate `idempotencyKey` (P2002); the idempotency guard/retry is
// `billingService.recordTransaction`'s responsibility, not this repository's.
//
// The balance update uses Prisma's `increment` (compiles to `SET balanceCents = balanceCents +
// $amount` in a single UPDATE), not a read-then-write of a separately fetched `wallet.balanceCents`
// — two concurrent transactions each computing the new balance from their own read would race, and
// the later UPDATE would silently overwrite the earlier one's change (a lost update), even though
// each has a distinct `idempotencyKey` and neither is a retry of the other. `UPDATE ... SET x = x +
// n` is safe under Postgres's default Read Committed isolation because the row lock is held for
// the statement itself; a second concurrent UPDATE on the same row blocks until the first commits,
// then re-reads the now-current value — no lost update, no SERIALIZABLE/retry loop needed.
export function createTransactionAtomic(input: {
  tenantId: string;
  type: string;
  amountCents: number;
  description: string | null;
  externalReference: string | null;
  idempotencyKey: string;
}): Promise<Transaction | null> {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { tenantId: input.tenantId } });
    if (!wallet) return null;

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceCents: { increment: input.amountCents } },
    });

    return tx.transaction.create({
      data: {
        walletId: wallet.id,
        tenantId: input.tenantId,
        type: input.type,
        amountCents: input.amountCents,
        balanceAfterCents: updatedWallet.balanceCents,
        status: 'completed',
        description: input.description,
        externalReference: input.externalReference,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
}

export function isUniqueConstraintViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
