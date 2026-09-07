import { Request, Response } from 'express';
import { createWebhookEndpointSchema } from '../validators/index.js';
import { writeAuditLog } from '../services/audit.js';
import {
  WebhookEndpointServiceError,
  createWebhookEndpointForTenant,
  listWebhookEndpointsForTenant,
  deleteWebhookEndpointForTenant,
  regenerateWebhookEndpointSecret,
} from '../services/webhookEndpointService.js';
import { WebhookEndpointSchemaNotReadyError } from '../repositories/webhookEndpointRepository.js';

// Shared by every handler below: WebhookEndpointServiceError carries the right HTTP status for a
// business-rule rejection (limit reached, not found); WebhookEndpointSchemaNotReadyError means the
// underlying Prisma model has not landed yet (see
// .agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md) — reported as 503 (service
// temporarily unavailable), never as a fabricated empty success. Returns true when it handled the
// error (caller returns immediately); false means the caller should rethrow.
function handleKnownError(err: unknown, res: Response): boolean {
  if (err instanceof WebhookEndpointServiceError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  if (err instanceof WebhookEndpointSchemaNotReadyError) {
    res.status(503).json({ error: 'Endpoints de webhook por tenant ainda não estão disponíveis nesta implantação.' });
    return true;
  }
  return false;
}

// POST /api/developers/webhooks — creates a new tenant-scoped webhook endpoint. The plaintext
// `secret` is present in this response ONLY: it is never stored, never logged and never
// retrievable again afterwards (AGENTS.md §13) — only regenerating it (below) produces a new one.
export async function createWebhookEndpointHandler(req: Request, res: Response) {
  const parsed = createWebhookEndpointSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const endpoint = await createWebhookEndpointForTenant(req.tenantId!, parsed.data);
    writeAuditLog(req.tenantId, req.user!.id, 'WEBHOOK_ENDPOINT_CREATE', {
      webhookEndpointId: endpoint.id,
      url: endpoint.url,
      events: endpoint.events,
    });
    res.status(201).json({
      webhookEndpoint: {
        id: endpoint.id,
        url: endpoint.url,
        events: endpoint.events,
        active: endpoint.active,
        createdAt: endpoint.createdAt,
      },
      secret: endpoint.secret,
    });
  } catch (err) {
    if (handleKnownError(err, res)) return;
    throw err;
  }
}

// GET /api/developers/webhooks — metadata only (url, events, active, delivery bookkeeping). Never
// includes the secret or its hash.
export async function listWebhookEndpointsHandler(req: Request, res: Response) {
  try {
    const webhookEndpoints = await listWebhookEndpointsForTenant(req.tenantId!);
    res.json({ webhookEndpoints });
  } catch (err) {
    if (handleKnownError(err, res)) return;
    throw err;
  }
}

// DELETE /api/developers/webhooks/:id — tenant-scoped: an admin from tenant A can never delete, or
// even discover the existence of, an endpoint belonging to tenant B.
export async function deleteWebhookEndpointHandler(req: Request, res: Response) {
  try {
    await deleteWebhookEndpointForTenant(req.tenantId!, String(req.params.id));
    writeAuditLog(req.tenantId, req.user!.id, 'WEBHOOK_ENDPOINT_DELETE', { webhookEndpointId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    if (handleKnownError(err, res)) return;
    throw err;
  }
}

// POST /api/developers/webhooks/:id/regenerate-secret — invalidates the current secret and mints
// a new one, returned in plaintext exactly once, same rule as creation.
export async function regenerateWebhookEndpointSecretHandler(req: Request, res: Response) {
  try {
    const endpoint = await regenerateWebhookEndpointSecret(req.tenantId!, String(req.params.id));
    writeAuditLog(req.tenantId, req.user!.id, 'WEBHOOK_ENDPOINT_REGENERATE_SECRET', {
      webhookEndpointId: endpoint.id,
    });
    res.json({
      webhookEndpoint: {
        id: endpoint.id,
        url: endpoint.url,
        events: endpoint.events,
        active: endpoint.active,
        createdAt: endpoint.createdAt,
      },
      secret: endpoint.secret,
    });
  } catch (err) {
    if (handleKnownError(err, res)) return;
    throw err;
  }
}
