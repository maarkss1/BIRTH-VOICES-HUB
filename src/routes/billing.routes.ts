import express from 'express';
import { requireTenant, requireRole } from '../middlewares/rbac.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import {
  changePlanHandler,
  getWalletSummaryHandler,
  listPlansHandler,
  listTransactionsHandler,
} from '../controllers/billing.controller.js';

const router = express.Router();

// Wallet balance, transaction history and plan changes touch real customer money (AGENTS.md §9
// item 16, §16 item 12) — admin-only within the tenant, same authorization level as user
// management (GET/POST /users) and the audit trail (GET /audit-log). Additional per-IP limiter on
// top of server.ts's general 200 req/min, tight enough to blunt a scripted plan-change/enumeration
// loop while leaving normal dashboard use untouched.
const billingRateLimiter = createRateLimiter('billing', 30, 60);

router.get('/billing/summary', requireTenant, requireRole(['admin']), billingRateLimiter, getWalletSummaryHandler);
router.get('/billing/transactions', requireTenant, requireRole(['admin']), billingRateLimiter, listTransactionsHandler);
router.post('/billing/change-plan', requireTenant, requireRole(['admin']), billingRateLimiter, changePlanHandler);

// Plan catalog is not tenant-specific data (same list for every tenant) — any authenticated
// tenant member can read it to see what plans exist, even if only an admin can act on it.
router.get('/billing/plans', requireTenant, billingRateLimiter, listPlansHandler);

export default router;
