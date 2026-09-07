// Growth/Billing domain service (Agente 12 — Growth, Billing e Monetização de Uso).
//
// Real, Prisma-backed implementation. `prisma/schema.prisma`'s `Plan`/`Wallet`/`Transaction`
// models landed in .agents/handoffs/onda-4/01-para-12-schema-billing-pronto.md — this file no
// longer throws BillingBackendNotReadyError anywhere. All Prisma access lives in
// `../repositories/billingRepository.ts` (Clean Architecture, AGENTS.md §2); this file owns
// mapping to the API-facing DTOs below and the business rules (idempotency guard, plan
// validation, session gating).
import { Plan, Transaction } from '@prisma/client';
import {
  createTransactionAtomic,
  findActivePlans,
  findPlanById,
  findTransactionByIdempotencyKey,
  findTransactionsForTenant,
  findWalletByTenant,
  isUniqueConstraintViolation,
  upsertWalletPlan,
  WalletWithPlan,
} from '../repositories/billingRepository.js';

export type PlanStatus = 'inactive' | 'active' | 'past_due' | 'canceled' | 'trialing';

const ACTIVE_PLAN_STATUSES: ReadonlySet<PlanStatus> = new Set(['active', 'trialing']);

export class WalletNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`billingService: tenant ${tenantId} não possui carteira (Wallet) ainda.`);
    this.name = 'WalletNotFoundError';
  }
}

export class PlanNotFoundError extends Error {
  constructor(planId: string) {
    super(`billingService: plano ${planId} não existe ou está inativo.`);
    this.name = 'PlanNotFoundError';
  }
}

// KNOWN LIMITATION (documented, not silently dropped — AGENTS.md §18/§20): full proration
// (charging/crediting the difference for a mid-cycle upgrade/downgrade, or deferring a change to
// the next billing cycle) is NOT implemented. `Wallet` has no `currentPeriodStart`, so there is no
// way to compute a prorated amount or to know when "next cycle" begins. `changePlan` below only
// supports `effectiveAt: 'immediate'`, which switches `planId`/`planStatus` and resets
// `currentPeriodEnd` from today — no proration credit/charge is recorded. See
// .agents/handoffs/onda-4/01-para-12-schema-billing-pronto.md item 5: a schema change for real
// proration needs a new handoff to Agente 01, not a field added here.
export class ProrationNotSupportedError extends Error {
  constructor() {
    super(
      "billingService.changePlan: effectiveAt='next_cycle' (troca agendada/com proração) ainda " +
        'não é suportado — requer Wallet.currentPeriodStart no schema (fora do escopo desta ' +
        'execução, ver limitação documentada em billingService.ts). Use effectiveAt=\'immediate\'.'
    );
    this.name = 'ProrationNotSupportedError';
  }
}

export interface WalletSummary {
  tenantId: string;
  balanceCents: number;
  currency: string;
  planId: string | null;
  planName: string | null;
  planStatus: PlanStatus;
  currentPeriodEnd: string | null; // ISO 8601
}

export interface TransactionSummary {
  id: string;
  type: string;
  amountCents: number; // signed: positive = credit, negative = debit
  balanceAfterCents: number;
  status: string;
  description: string | null;
  createdAt: string; // ISO 8601
}

export interface PlanOption {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  billingInterval: string;
}

export interface RecordTransactionInput {
  tenantId: string;
  type: string;
  amountCents: number;
  // REQUIRED, not optional: AGENTS.md §9 item 16 names duplicate charging as the same severity
  // class as webhook replay (item 11). Making this mandatory in the type signature means a future
  // caller cannot accidentally omit it and reopen that hole on retry/redelivery.
  idempotencyKey: string;
  description?: string;
  externalReference?: string;
}

function toPlanStatus(raw: string): PlanStatus {
  return (['inactive', 'active', 'past_due', 'canceled', 'trialing'] as const).includes(raw as PlanStatus)
    ? (raw as PlanStatus)
    : 'inactive';
}

function mapWallet(wallet: WalletWithPlan): WalletSummary {
  return {
    tenantId: wallet.tenantId,
    balanceCents: wallet.balanceCents,
    currency: wallet.currency,
    planId: wallet.planId,
    planName: wallet.plan?.name ?? null,
    planStatus: toPlanStatus(wallet.planStatus),
    currentPeriodEnd: wallet.currentPeriodEnd ? wallet.currentPeriodEnd.toISOString() : null,
  };
}

function mapTransaction(transaction: Transaction): TransactionSummary {
  return {
    id: transaction.id,
    type: transaction.type,
    amountCents: transaction.amountCents,
    balanceAfterCents: transaction.balanceAfterCents,
    status: transaction.status,
    description: transaction.description,
    createdAt: transaction.createdAt.toISOString(),
  };
}

function mapPlan(plan: Plan): PlanOption {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    priceCents: plan.priceCents,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
  };
}

// One period out from `from`, based on the plan's billing interval. Returns null for an
// unrecognized interval rather than guessing — an explicit null "no renewal date known" beats a
// fabricated one (AGENTS.md §14).
function computePeriodEnd(billingInterval: string, from: Date = new Date()): Date | null {
  const end = new Date(from);
  if (billingInterval === 'monthly') {
    end.setMonth(end.getMonth() + 1);
    return end;
  }
  if (billingInterval === 'yearly') {
    end.setFullYear(end.getFullYear() + 1);
    return end;
  }
  return null;
}

// Reads the tenant's current wallet balance + active plan for the "Saldo em Carteira"/"Plano
// Atual" cards in Billing.tsx. Returns `null` — not a fabricated zero-balance wallet — when the
// tenant has no Wallet row yet, per .agents/handoffs/onda-4/01-para-12-schema-billing-pronto.md
// and AGENTS.md §14 (never fabricate a balance/plan that doesn't exist). Callers must render an
// explicit empty/error state, exactly the loading/empty/error convention Billing.tsx already uses.
export async function getWalletSummary(tenantId: string): Promise<WalletSummary | null> {
  const wallet = await findWalletByTenant(tenantId);
  return wallet ? mapWallet(wallet) : null;
}

// Paginated transaction history for the "Histórico de Uso" table in Billing.tsx.
export async function listTransactions(
  tenantId: string,
  pagination: { page: number; pageSize: number }
): Promise<{ items: TransactionSummary[]; total: number }> {
  const [items, total] = await findTransactionsForTenant(tenantId, pagination);
  return { items: items.map(mapTransaction), total };
}

// Catalog of purchasable plans for the "Gerenciar Assinatura" flow. Global, not tenant-scoped —
// every tenant sees the same catalog (per-tenant custom pricing is out of scope for this pass).
export async function listAvailablePlans(): Promise<PlanOption[]> {
  const plans = await findActivePlans();
  return plans.map(mapPlan);
}

// Upgrade/downgrade. See ProrationNotSupportedError above for the documented limitation: only
// `effectiveAt: 'immediate'` is implemented in this pass. Creates the tenant's Wallet row on
// first plan change if none exists yet (see billingRepository.upsertWalletPlan) — that is this
// service's deliberate choice of "wallet creation trigger" per the open question in the schema
// handoff.
export async function changePlan(
  tenantId: string,
  newPlanId: string,
  _actorUserId: string,
  effectiveAt: 'immediate' | 'next_cycle' = 'immediate'
): Promise<WalletSummary> {
  if (effectiveAt === 'next_cycle') {
    throw new ProrationNotSupportedError();
  }

  const plan = await findPlanById(newPlanId);
  if (!plan || !plan.active) {
    throw new PlanNotFoundError(newPlanId);
  }

  const wallet = await upsertWalletPlan(tenantId, {
    planId: plan.id,
    planStatus: 'active',
    currentPeriodEnd: computePeriodEnd(plan.billingInterval),
    currency: plan.currency,
  });

  return mapWallet(wallet);
}

// Credits or debits the wallet and returns the resulting transaction. Idempotent by
// `idempotencyKey` (AGENTS.md §9 item 16 — same severity class as webhook replay, item 11, now
// applied to real customer money): `createTransactionAtomic` relies on the unique constraint on
// `Transaction.idempotencyKey` to reject a second concurrent insert; when that happens (Prisma
// P2002) this function fetches and returns the transaction that already exists instead of
// throwing or crediting/debiting the wallet a second time. Redelivering the same
// (tenantId, idempotencyKey) request — a payment webhook retry, a client double-submit — is
// therefore always safe.
export async function recordTransaction(input: RecordTransactionInput): Promise<TransactionSummary> {
  try {
    const created = await createTransactionAtomic({
      tenantId: input.tenantId,
      type: input.type,
      amountCents: input.amountCents,
      description: input.description ?? null,
      externalReference: input.externalReference ?? null,
      idempotencyKey: input.idempotencyKey,
    });

    if (!created) {
      throw new WalletNotFoundError(input.tenantId);
    }

    return mapTransaction(created);
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      const existing = await findTransactionByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return mapTransaction(existing);
      }
    }
    throw err;
  }
}

// Inadimplência com degradação gradual (ROADMAP "Fase 6" item 1 / this agent's mission prompt):
// this must only ever gate the START of a *new* voice session — never terminate a call already in
// progress. NOT called from anywhere else in the codebase yet — the call site belongs to whichever
// service currently authorizes starting a new session (Agente 05's
// outboundCallService.ts/telephonyService.ts); wiring this in is a future handoff FROM this
// function TO Agente 05, not something implemented in this file.
//
// A tenant with no Wallet row at all (never onboarded to billing) is treated as "cannot start a
// new session" — the same fail-closed default as an explicitly inactive/past_due/canceled plan or
// a zero/negative balance. This is a deliberate product decision, not an oversight: until Agente
// 05 wires the call site, this function has no caller and no user-visible effect either way.
export async function canStartNewSession(tenantId: string): Promise<boolean> {
  const wallet = await findWalletByTenant(tenantId);
  if (!wallet) return false;
  if (!ACTIVE_PLAN_STATUSES.has(toPlanStatus(wallet.planStatus))) return false;
  if (wallet.balanceCents <= 0) return false;
  return true;
}
