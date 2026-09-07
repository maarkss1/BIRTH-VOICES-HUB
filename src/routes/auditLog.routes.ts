import express from 'express';
import { requireTenant, requireRole } from '../middlewares/rbac.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { listAuditLogHandler } from '../controllers/auditLog.controller.js';

const router = express.Router();

// Audit trail read access: admin-only within the tenant, same authorization level as user
// management (GET /users) since audit entries can reveal sensitive operational history.
// Additional per-IP limiter on top of server.ts's general 200 req/min — an admin reviewing the
// trail never needs more than occasional page loads.
router.get('/audit-log', requireTenant, requireRole(['admin']), createRateLimiter('auditLog', 30, 60), listAuditLogHandler);

export default router;
