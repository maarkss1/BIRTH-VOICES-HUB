// Growth/Billing domain service (Agente 12 — Growth, Billing e Monetização de Uso).
//
// STATUS: scaffold only. Every exported function below is the real, stable signature that
// billing.controller.ts, usageMeteringService.ts and pages/Dashboard/Billing.tsx will call once
// the backing Prisma models exist — but `prisma/schema.prisma` (Agente 01's exclusive file, see
// AGENTS.md §11) has no `Plan`/`Wallet`/`UsageRecord`/`Transaction` model yet. Every function here
// throws BillingBackendNotReadyError instead of touching a table that does not exist, so nothing
// in this file can ever silently fabricate a balance/plan/transaction (AGENTS.md §14). The moment
// the schema handoff below is resolved, each function body is replaced with the real
// Prisma-backed implementation — the exported signatures are designed not to need to change for
// callers when that happens.
//
// Schema requested via .agents/handoffs/onda-4/12-para-01-schema-billing-monetizacao.md.

export class BillingBackendNotReadyError extends Error {
  constructor(operation: string) {
    super(
      `billingService.${operation}: sem backend de billing real ainda — bloqueado em ` +
        '.agents/handoffs/onda-4/12-para-01-schema-billing-monetizacao.md (Plan/Wallet/UsageRecord/' +
        'Transaction ainda não existem em prisma/schema.prisma). Não fabrique saldo, plano ou ' +
        'histórico de cobrança enquanto este handoff estiver aberto — mostre o estado vazio/erro ' +
        'explícito (AGENTS.md §14).'
    );
    this.name = 'BillingBackendNotReadyError';
  }
}

export type PlanStatus = 'inactive' | 'active' | 'past_due' | 'canceled' | 'trialing';

// Mirrors the eventual Prisma `Wallet` (+ joined `Plan`) shape. Kept as a local interface — not
// imported from `@prisma/client` — because that model does not exist yet; once it does, this type
// should be re-derived from the Prisma payload rather than duplicated by hand. Deliberately omits
// gateway-internal identifiers (e.g. a raw Stripe customer id) — those never need to reach the
// frontend.
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

// Reads the tenant's current wallet balance + active plan for the "Saldo em Carteira"/"Plano
// Atual" cards in Billing.tsx. Callers must render an explicit empty/error state on rejection —
// exactly the loading/empty/error convention Billing.tsx already uses since Onda 2 — never retry
// into a fabricated placeholder value.
export async function getWalletSummary(_tenantId: string): Promise<WalletSummary> {
  throw new BillingBackendNotReadyError('getWalletSummary');
}

// Paginated transaction history for the "Histórico de Uso" table in Billing.tsx.
export async function listTransactions(
  _tenantId: string,
  _pagination: { page: number; pageSize: number }
): Promise<{ items: TransactionSummary[]; total: number }> {
  throw new BillingBackendNotReadyError('listTransactions');
}

// Catalog of purchasable plans for the "Gerenciar Assinatura" flow. Global, not tenant-scoped —
// every tenant sees the same catalog (per-tenant custom pricing is out of scope for this pass).
export async function listAvailablePlans(): Promise<PlanOption[]> {
  throw new BillingBackendNotReadyError('listAvailablePlans');
}

// Upgrade/downgrade with proration (ROADMAP "Fase 6" item 1). `effectiveAt` lets the caller
// (billing.controller.ts) offer immediate vs. next-cycle change once implemented; the proration
// math itself is intentionally NOT sketched here because it depends on
// Wallet.currentPeriodStart/currentPeriodEnd existing in the schema first.
export async function changePlan(
  _tenantId: string,
  _newPlanId: string,
  _actorUserId: string,
  _effectiveAt: 'immediate' | 'next_cycle' = 'immediate'
): Promise<WalletSummary> {
  throw new BillingBackendNotReadyError('changePlan');
}

// Credits or debits the wallet and returns the resulting transaction. MUST be idempotent once
// implemented: the real implementation should upsert/guard on `idempotencyKey` so redelivering the
// same request (payment webhook retry, client double-submit) never double-charges or double-credits.
export async function recordTransaction(_input: RecordTransactionInput): Promise<TransactionSummary> {
  throw new BillingBackendNotReadyError('recordTransaction');
}

// Inadimplência com degradação gradual (ROADMAP "Fase 6" item 1 / this agent's mission prompt):
// once implemented, this must only ever gate the START of a *new* voice session — never terminate
// a call already in progress. The call site belongs to whichever service currently authorizes
// starting a new session (Agente 05's outboundCallService.ts/telephonyService.ts); wiring this in
// is a future handoff FROM this function TO Agente 05, not something implemented in this file.
export async function canStartNewSession(_tenantId: string): Promise<boolean> {
  throw new BillingBackendNotReadyError('canStartNewSession');
}
