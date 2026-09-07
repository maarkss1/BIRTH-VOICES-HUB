import express from 'express';
import { requireTenant, requireRole } from '../middlewares/rbac.js';
import { createApiKeyHandler, listApiKeysHandler, revokeApiKeyHandler } from '../controllers/apiKey.controller.js';

const router = express.Router();

// Issuing/listing/revoking API keys is an administrative, tenant-scoped capability — same
// authorization level as user management (/users) and billing (/billing/*): a leaked or
// over-issued key is a security incident, not a routine self-service action for every role.
router.post('/developers/keys', requireTenant, requireRole(['admin']), createApiKeyHandler);
router.get('/developers/keys', requireTenant, requireRole(['admin']), listApiKeysHandler);
router.delete('/developers/keys/:id', requireTenant, requireRole(['admin']), revokeApiKeyHandler);
// Alias for callers/UIs that prefer an explicit action verb over the DELETE verb — both revoke
// immediately and are otherwise identical (same controller, same audit action).
router.post('/developers/keys/:id/revoke', requireTenant, requireRole(['admin']), revokeApiKeyHandler);

export default router;
