import express from 'express';
import { requireTenant } from '../middlewares/rbac.js';
import { getWorkflowHandler, saveWorkflowHandler, updateWorkflowHandler, deleteWorkflowHandler, getWorkflowHistoryHandler, restoreWorkflowVersionHandler, duplicateWorkflowHandler, publishWorkflowHandler, listWorkflowVersionsHandler, rollbackWorkflowVersionHandler } from '../controllers/workflow.controller.js';

const router = express.Router();

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
router.get('/workflow/:id/versions', requireTenant, listWorkflowVersionsHandler);
router.post('/workflow/:id/versions/:version/rollback', requireTenant, rollbackWorkflowVersionHandler);


import { addCommentHandler, resolveCommentHandler, lockNodeHandler, unlockNodeHandler } from '../controllers/workflowCollab.controller.js';

router.post('/workflow/comments', requireTenant, addCommentHandler);
router.post('/workflow/comments/resolve', requireTenant, resolveCommentHandler);
router.post('/workflow/lock', requireTenant, lockNodeHandler);
router.post('/workflow/unlock', requireTenant, unlockNodeHandler);
export default router;
