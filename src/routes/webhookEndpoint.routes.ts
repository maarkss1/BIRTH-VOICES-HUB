import express from 'express';
import { requireTenant, requireRole } from '../middlewares/rbac.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import {
  createWebhookEndpointHandler,
  listWebhookEndpointsHandler,
  deleteWebhookEndpointHandler,
  regenerateWebhookEndpointSecretHandler,
} from '../controllers/webhookEndpoint.controller.js';

const router = express.Router();

// Same authorization level as API key management (apiKey.routes.ts) and billing: a tenant webhook
// endpoint receives real event payloads (call outcomes, lead data) signed with a secret only the
// creating tenant should ever see — admin-only, not a routine self-service action for every role.
// Additional per-IP limiter on top of server.ts's general 200 req/min, same shape and budget the
// Coordinator's contract specifies (00-para-05-webhooks-tenant-contrato.md, item 4).
const webhookEndpointsRateLimiter = createRateLimiter('webhookEndpoints', 20, 60);

router.post(
  '/developers/webhooks',
  requireTenant,
  requireRole(['admin']),
  webhookEndpointsRateLimiter,
  createWebhookEndpointHandler,
);
router.get(
  '/developers/webhooks',
  requireTenant,
  requireRole(['admin']),
  webhookEndpointsRateLimiter,
  listWebhookEndpointsHandler,
);
router.delete(
  '/developers/webhooks/:id',
  requireTenant,
  requireRole(['admin']),
  webhookEndpointsRateLimiter,
  deleteWebhookEndpointHandler,
);
// Not part of the Coordinator's minimal POST/GET/DELETE contract, but required to make contract
// point 3 usable end-to-end ("só permite gerar um novo, invalidando o antigo") — without this
// route a tenant that loses its one-time secret would have no way back except deleting and
// recreating the endpoint (losing its delivery history/bookkeeping in the process).
router.post(
  '/developers/webhooks/:id/regenerate-secret',
  requireTenant,
  requireRole(['admin']),
  webhookEndpointsRateLimiter,
  regenerateWebhookEndpointSecretHandler,
);

export default router;
