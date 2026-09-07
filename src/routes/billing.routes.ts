import express from 'express';
import { requireTenant, requireRole } from '../middlewares/rbac.js';
import {
  changePlanHandler,
  getWalletSummaryHandler,
  listPlansHandler,
  listTransactionsHandler,
} from '../controllers/billing.controller.js';

const router = express.Router();

// Wallet balance, transaction history and plan changes touch real customer money (AGENTS.md §9
// item 16, §16 item 12) — admin-only within the tenant, same authorization level as user
// management (GET/POST /users) and the audit trail (GET /audit-log).
router.get('/billing/summary', requireTenant, requireRole(['admin']), getWalletSummaryHandler);
router.get('/billing/transactions', requireTenant, requireRole(['admin']), listTransactionsHandler);
router.post('/billing/change-plan', requireTenant, requireRole(['admin']), changePlanHandler);

// Plan catalog is not tenant-specific data (same list for every tenant) — any authenticated
// tenant member can read it to see what plans exist, even if only an admin can act on it.
router.get('/billing/plans', requireTenant, listPlansHandler);

export default router;
