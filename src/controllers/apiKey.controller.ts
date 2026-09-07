import { Request, Response } from 'express';
import { createApiKeySchema } from '../validators/index.js';
import { writeAuditLog } from '../services/audit.js';
import {
  ApiKeyServiceError,
  createApiKeyForTenant,
  listApiKeysForTenant,
  revokeApiKeyForTenant,
} from '../services/apiKeyService.js';

// POST /api/developers/keys — issues a new tenant API key. The plaintext `key` is present in this
// response ONLY: it is never stored, never logged and never retrievable again afterwards
// (AGENTS.md §13). The caller (Agente 02's Developers.tsx) must show it to the admin once and
// tell them to copy it now.
export async function createApiKeyHandler(req: Request, res: Response) {
  const parsed = createApiKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const apiKey = await createApiKeyForTenant(req.tenantId!, req.user!.id, {
    name: parsed.data.name,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  });

  // Audit the creation event itself, never the secret value.
  writeAuditLog(req.tenantId, req.user!.id, 'API_KEY_CREATE', { apiKeyId: apiKey.id, name: apiKey.name });

  res.status(201).json({
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
    },
    key: apiKey.key,
  });
}

// GET /api/developers/keys — metadata only (name, createdAt, lastUsedAt, revoked state). Never
// includes the hash or the plaintext key.
export async function listApiKeysHandler(req: Request, res: Response) {
  const apiKeys = await listApiKeysForTenant(req.tenantId!);
  res.json({ apiKeys });
}

// DELETE /api/developers/keys/:id and POST /api/developers/keys/:id/revoke — both revoke the key
// immediately (no cache, checked live by the auth middleware on every request going forward).
export async function revokeApiKeyHandler(req: Request, res: Response) {
  try {
    const apiKey = await revokeApiKeyForTenant(req.tenantId!, String(req.params.id));
    writeAuditLog(req.tenantId, req.user!.id, 'API_KEY_REVOKE', { apiKeyId: apiKey.id });
    res.json({ success: true, apiKey });
  } catch (err) {
    if (err instanceof ApiKeyServiceError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}
