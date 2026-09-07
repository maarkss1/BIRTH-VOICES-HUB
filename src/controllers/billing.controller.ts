import { Request, Response } from 'express';
import { changePlanSchema } from '../validators/index.js';
import { logger } from '../lib/logger.js';
import { writeAuditLog } from '../services/audit.js';
import {
  changePlan,
  getWalletSummary,
  listAvailablePlans,
  listTransactions,
  PlanNotFoundError,
  ProrationNotSupportedError,
} from '../services/billingService.js';
import { createNotification } from '../services/notificationService.js';

const BILLING_DEFAULT_PAGE_SIZE = 20;
const BILLING_MAX_PAGE_SIZE = 100;

function parsePagination(rawPage: unknown, rawPageSize: unknown): { page: number; pageSize: number } {
  const page = Math.max(1, Number.parseInt(String(rawPage ?? '1'), 10) || 1);
  const pageSize = Math.min(
    BILLING_MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(String(rawPageSize ?? BILLING_DEFAULT_PAGE_SIZE), 10) || BILLING_DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize };
}

// GET /api/billing/summary — wallet balance + current plan for the "Saldo em Carteira"/"Plano
// Atual" cards. `wallet: null` is a real, explicit state (tenant never onboarded to billing yet),
// not an error — the frontend renders it as an empty state (AGENTS.md §14).
export async function getWalletSummaryHandler(req: Request, res: Response) {
  const wallet = await getWalletSummary(req.tenantId!);
  res.json({ wallet });
}

// GET /api/billing/transactions — paginated "Histórico de Uso" table, tenant-scoped
// (req.tenantId always comes from requireTenant, never from a query param — AGENTS.md §15).
export async function listTransactionsHandler(req: Request, res: Response) {
  const { page, pageSize } = parsePagination(req.query.page, req.query.pageSize);
  const { items, total } = await listTransactions(req.tenantId!, { page, pageSize });
  res.json({
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

// GET /api/billing/plans — global plan catalog for the "Gerenciar Assinatura" flow.
export async function listPlansHandler(_req: Request, res: Response) {
  const plans = await listAvailablePlans();
  res.json({ plans });
}

// POST /api/billing/change-plan — upgrade/downgrade. Only `effectiveAt: 'immediate'` is
// implemented (see ProrationNotSupportedError in billingService.ts for the documented
// limitation); a request for `next_cycle` gets a clear 400, not a silent fallback to immediate.
export async function changePlanHandler(req: Request, res: Response) {
  const parsed = changePlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const wallet = await changePlan(
      req.tenantId!,
      parsed.data.planId,
      req.user!.id,
      parsed.data.effectiveAt ?? 'immediate'
    );
    writeAuditLog(req.tenantId, req.user!.id, 'BILLING_PLAN_CHANGED', { planId: parsed.data.planId });
    // Best-effort: a notification write failing must never fail the plan change itself (the
    // money/plan side-effect already succeeded). See notificationService.ts module doc — this is
    // the first of potentially several domains calling the same generic entry point, not a
    // billing-only notification path.
    createNotification({
      userId: req.user!.id,
      title: 'Plano atualizado',
      message: `Seu plano foi alterado com sucesso para ${wallet.planName ?? parsed.data.planId}.`,
    }).catch((err) => {
      logger.error('Failed to create plan-change notification', { err, userId: req.user!.id });
    });
    res.json({ wallet });
  } catch (err) {
    if (err instanceof PlanNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof ProrationNotSupportedError) return res.status(400).json({ error: err.message });
    throw err;
  }
}
