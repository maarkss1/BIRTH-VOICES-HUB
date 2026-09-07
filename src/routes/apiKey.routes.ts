import express from 'express';
import { requireTenant, requireRole } from '../middlewares/rbac.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { createApiKeyHandler, listApiKeysHandler, revokeApiKeyHandler } from '../controllers/apiKey.controller.js';

const router = express.Router();

// Issuing/listing/revoking API keys is an administrative, tenant-scoped capability — same
// authorization level as user management (/users) and billing (/billing/*): a leaked or
// over-issued key is a security incident, not a routine self-service action for every role.
// Additional per-IP limiter on top of server.ts's general 200 req/min: key management is a rare,
// deliberate action, so a much tighter budget here contains a compromised admin session or a
// scripted enumeration attempt without affecting legitimate use.
const apiKeyRateLimiter = createRateLimiter('apiKeyManagement', 20, 60);

router.post('/developers/keys', requireTenant, requireRole(['admin']), apiKeyRateLimiter, createApiKeyHandler);
router.get('/developers/keys', requireTenant, requireRole(['admin']), apiKeyRateLimiter, listApiKeysHandler);
router.delete('/developers/keys/:id', requireTenant, requireRole(['admin']), apiKeyRateLimiter, revokeApiKeyHandler);
// Alias for callers/UIs that prefer an explicit action verb over the DELETE verb — both revoke
// immediately and are otherwise identical (same controller, same audit action).
router.post('/developers/keys/:id/revoke', requireTenant, requireRole(['admin']), apiKeyRateLimiter, revokeApiKeyHandler);

export default router;
