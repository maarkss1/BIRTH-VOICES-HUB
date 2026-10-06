import express from 'express';
import { requireTenant } from '../middlewares/rbac.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { listAgentsHandler, createAgentHandler, deleteAgentHandler, getAgentHandler, updateAgentConfigHandler } from '../controllers/agent.controller.js';

const router = express.Router();

router.get('/agents', requireTenant, listAgentsHandler);
router.get('/agents/:id', requireTenant, getAgentHandler);
router.post('/agents', requireTenant, createAgentHandler);
router.put('/agents/:id/config', requireTenant, updateAgentConfigHandler);
router.delete('/agents/:id', requireTenant, deleteAgentHandler);


import { addKnowledgeDocumentHandler, testRagQueryHandler, uploadKnowledgeDocumentHandler } from '../controllers/knowledge.controller.js';

// Additional per-IP limiter on top of server.ts's general 200 req/min, same shape already used
// for apiKey.routes.ts/billing.routes.ts/webhookEndpoint.routes.ts/workflow.routes.ts (Onda 3-5).
// CodeQL flagged /agents/:id/knowledge/upload specifically (PR #60) — it's a real gap this time,
// not the tool's usual false positive on an existing custom limiter: this route had none at all,
// and it's also the most expensive of the three (decodes a base64 buffer + runs a ClamAV scan per
// request), so it gets the tightest budget of the group.
const knowledgeUploadRateLimiter = createRateLimiter('knowledgeUpload', 10, 60);
const knowledgeRateLimiter = createRateLimiter('knowledge', 30, 60);

router.post('/agents/:id/knowledge', requireTenant, knowledgeRateLimiter, addKnowledgeDocumentHandler);
router.post('/agents/:id/knowledge/upload', requireTenant, knowledgeUploadRateLimiter, uploadKnowledgeDocumentHandler);
router.post('/agents/:id/rag/test', requireTenant, knowledgeRateLimiter, testRagQueryHandler);
export default router;
