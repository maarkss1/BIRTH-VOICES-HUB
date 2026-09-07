import express from 'express';
import { requireTenant } from '../middlewares/rbac.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { getWorkflowHandler, saveWorkflowHandler, updateWorkflowHandler, deleteWorkflowHandler, getWorkflowHistoryHandler, restoreWorkflowVersionHandler, duplicateWorkflowHandler, publishWorkflowHandler, listWorkflowVersionsHandler, rollbackWorkflowVersionHandler } from '../controllers/workflow.controller.js';

const router = express.Router();

// Additional per-IP limiter on top of server.ts's general 200 req/min, applied to the new
// version-history/rollback routes (same defense-in-depth shape already used for
// apiKey.routes.ts/billing.routes.ts/webhookEndpoint.routes.ts) — rollback in particular mutates
// the live published workflow, so it gets the same tighter budget as other admin-ish mutations.
const workflowVersionsRateLimiter = createRateLimiter('workflowVersions', 30, 60);

router.get('/workflow', requireTenant, getWorkflowHandler);
router.post('/workflow', requireTenant, saveWorkflowHandler);
router.put('/workflow', requireTenant, updateWorkflowHandler);
router.delete('/workflow', requireTenant, deleteWorkflowHandler);

router.get('/workflow/history', requireTenant, getWorkflowHistoryHandler);
router.post('/workflow/restore', requireTenant, restoreWorkflowVersionHandler);
router.post('/workflow/duplicate', requireTenant, duplicateWorkflowHandler);
// The only route that can flip Workflow.status to 'active' — gated server-side by
// workflowService.publishWorkflow() -> ValidationEngine (see AGENTS.md blocker #13).
router.post('/workflow/publish', requireTenant, publishWorkflowHandler);
router.get('/workflow/:id/versions', requireTenant, workflowVersionsRateLimiter, listWorkflowVersionsHandler);
router.post('/workflow/:id/versions/:version/rollback', requireTenant, workflowVersionsRateLimiter, rollbackWorkflowVersionHandler);


import { addCommentHandler, resolveCommentHandler, lockNodeHandler, unlockNodeHandler } from '../controllers/workflowCollab.controller.js';

router.post('/workflow/comments', requireTenant, addCommentHandler);
router.post('/workflow/comments/resolve', requireTenant, resolveCommentHandler);
router.post('/workflow/lock', requireTenant, lockNodeHandler);
router.post('/workflow/unlock', requireTenant, unlockNodeHandler);
export default router;
