import express from 'express';
import { requireTenant, requireRole } from '../middlewares/rbac.js';
import { listAuditLogHandler } from '../controllers/auditLog.controller.js';

const router = express.Router();

// Audit trail read access: admin-only within the tenant, same authorization level as user
// management (GET /users) since audit entries can reveal sensitive operational history.
router.get('/audit-log', requireTenant, requireRole(['admin']), listAuditLogHandler);

export default router;
