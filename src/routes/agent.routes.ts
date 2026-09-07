import express from 'express';
import { requireTenant } from '../middlewares/rbac.js';
import { listAgentsHandler, createAgentHandler, deleteAgentHandler, getAgentHandler, updateAgentConfigHandler } from '../controllers/agent.controller.js';

const router = express.Router();

router.get('/agents', requireTenant, listAgentsHandler);
router.get('/agents/:id', requireTenant, getAgentHandler);
router.post('/agents', requireTenant, createAgentHandler);
router.put('/agents/:id/config', requireTenant, updateAgentConfigHandler);
router.delete('/agents/:id', requireTenant, deleteAgentHandler);


import { addKnowledgeDocumentHandler, testRagQueryHandler, uploadKnowledgeDocumentHandler } from '../controllers/knowledge.controller.js';

router.post('/agents/:id/knowledge', requireTenant, addKnowledgeDocumentHandler);
router.post('/agents/:id/knowledge/upload', requireTenant, uploadKnowledgeDocumentHandler);
router.post('/agents/:id/rag/test', requireTenant, testRagQueryHandler);
export default router;
