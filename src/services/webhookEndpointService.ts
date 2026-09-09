// Business logic for tenant-configurable webhook endpoints (Agente 05 — Telefonia, Chamadas e
// Webhooks). Resolves .agents/handoffs/onda-5/00-para-05-webhooks-tenant-contrato.md, which itself
// resolves .agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md.
//
// Reuses the existing delivery infrastructure in webhook.service.ts/webhook.worker.ts (BullMQ
// queue, 5-attempt exponential backoff, SSRF defense, 5s timeout, HMAC-SHA256 signing) — this file
// only adds per-tenant endpoint CRUD and per-tenant/per-event resolution on top of it. It never
// enqueues or delivers anything itself.
//
// Secret handling (AGENTS.md §13), same shape as apiKeyService.ts:
// - The plaintext secret (`whsec_...`) is generated here and returned to the caller (controller)
//   EXACTLY ONCE, at creation or regeneration time. It is never persisted anywhere — only its
//   SHA-256 hash (`secretHash`) is stored.
// - Unlike apiKeyService's keyHash (used only for equality comparison), `secretHash` here is also
//   the ACTUAL HMAC-SHA256 signing key webhook.worker.ts uses for every delivery to this endpoint
//   (see hashWebhookSecret below). This is what lets the platform sign every future delivery
//   without ever storing (or being able to recover) the plaintext value shown to the tenant admin
//   once — a receiver who wants to verify a signature must SHA-256-hash their copied secret first,
//   then use that hex digest as the HMAC key. This is documented for the frontend/API consumer in
//   .agents/handoffs/onda-5/05-para-02-webhooks-endpoints-prontos.md.
// - Every list/read path returns only WebhookEndpointMetadata (built by `toMetadata` below), which
//   has no field for secret or secretHash — there is no code path in this service that could leak
//   either, even by accident.
import crypto from 'crypto';
import * as webhookEndpointRepository from '../repositories/webhookEndpointRepository.js';

export class WebhookEndpointServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Contract point 2 of 00-para-05-webhooks-tenant-contrato.md: reject the 6th active endpoint with
// a clear error rather than silently failing or evicting an existing one.
export const MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_TENANT = 5;

// Distinguishable at a glance from other platform secrets (Twilio/Bland/JWT/etc.) if it ever
// leaked into a log — same rationale as apiKeyService.ts's API_KEY_PREFIX.
const WEBHOOK_SECRET_PREFIX = 'whsec_';

function generatePlaintextSecret(): string {
  // 256 bits of randomness, base64url-encoded (URL/header-safe, no padding characters) — same
  // size as apiKeyService.ts's generateApiKeySecret.
  return `${WEBHOOK_SECRET_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

// Exported (not just internal) because webhook.worker.ts signs deliveries with this exact digest
// (see webhookEndpointService.findActiveSigningSecretHash) and docs/tests need to reproduce it
// independently to verify a signature end-to-end.
export function hashWebhookSecret(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

export interface CreatedWebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  secret: string; // plaintext — present only in the create/regenerate response, never again
}

export interface WebhookEndpointMetadata {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: string | null;
}

function toMetadata(row: webhookEndpointRepository.TenantWebhookEndpointRecord): WebhookEndpointMetadata {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastDeliveryAt: row.lastDeliveryAt,
    lastDeliveryStatus: row.lastDeliveryStatus,
  };
}

// POST /api/developers/webhooks. `url`/`events` are assumed already validated by
// createWebhookEndpointSchema (SSRF-safe HTTPS URL, non-empty events list) at the controller
// boundary — this function trusts its caller the same way createApiKeyForTenant trusts its own
// Zod-validated input.
export async function createWebhookEndpointForTenant(
  tenantId: string,
  data: { url: string; events: string[] },
): Promise<CreatedWebhookEndpoint> {
  const activeCount = await webhookEndpointRepository.countActiveEndpointsForTenant(tenantId);
  if (activeCount >= MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_TENANT) {
    throw new WebhookEndpointServiceError(
      `Limite de ${MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_TENANT} endpoints de webhook ativos por tenant atingido. ` +
        'Remova ou desative um endpoint existente antes de criar outro.',
      409,
    );
  }

  const plaintextSecret = generatePlaintextSecret();
  const secretHash = hashWebhookSecret(plaintextSecret);

  const created = await webhookEndpointRepository.createEndpoint({
    tenantId,
    url: data.url,
    secretHash,
    events: data.events,
  });

  return {
    id: created.id,
    url: created.url,
    events: created.events,
    active: created.active,
    createdAt: created.createdAt,
    secret: plaintextSecret,
  };
}

export async function listWebhookEndpointsForTenant(tenantId: string): Promise<WebhookEndpointMetadata[]> {
  const rows = await webhookEndpointRepository.listEndpointsForTenant(tenantId);
  return rows.map(toMetadata);
}

// DELETE /api/developers/webhooks/:id. Tenant-scoped lookup (never trusts the id alone) so an
// admin from tenant A can never delete — or even discover the existence of — an endpoint
// belonging to tenant B (AGENTS.md §15).
export async function deleteWebhookEndpointForTenant(tenantId: string, id: string): Promise<void> {
  const existing = await webhookEndpointRepository.findEndpointForTenant(id, tenantId);
  if (!existing) {
    throw new WebhookEndpointServiceError('Endpoint de webhook não encontrado.', 404);
  }
  await webhookEndpointRepository.deleteEndpoint(id);
}

// POST /api/developers/webhooks/:id/regenerate-secret. Contract point 3: the only way to get a
// working secret again after the one-time reveal is to invalidate the old one and mint a new one
// — there is no "reveal again" path anywhere in this service.
export async function regenerateWebhookEndpointSecret(
  tenantId: string,
  id: string,
): Promise<CreatedWebhookEndpoint> {
  const existing = await webhookEndpointRepository.findEndpointForTenant(id, tenantId);
  if (!existing) {
    throw new WebhookEndpointServiceError('Endpoint de webhook não encontrado.', 404);
  }
  const plaintextSecret = generatePlaintextSecret();
  const secretHash = hashWebhookSecret(plaintextSecret);
  const updated = await webhookEndpointRepository.regenerateSecret(id, secretHash);
  return {
    id: updated.id,
    url: updated.url,
    events: updated.events,
    active: updated.active,
    createdAt: updated.createdAt,
    secret: plaintextSecret,
  };
}

export interface WebhookDispatchTarget {
  endpointId: string;
  url: string;
}

export interface WebhookDispatchResolution {
  /**
   * True as soon as the tenant has at least one active endpoint, regardless of whether any of
   * them subscribe to the event being dispatched. webhookService.dispatch uses this — not
   * `targets.length` — to decide whether to fall back to the deployment-wide WEBHOOK_URL/
   * TEST_WEBHOOK_URL env vars: once a tenant has opted into the per-tenant model, an event that
   * matches none of their endpoints must be a silent no-op, never redirected to the deployment's
   * own fallback destination (AGENTS.md §15 — a tenant's configured destinations, or the deliberate
   * absence of a matching one, must never fall through to a different tenant's or the
   * deployment's own destination).
   */
  hasAnyActiveEndpoint: boolean;
  targets: WebhookDispatchTarget[];
}

// Called by webhookService.dispatch for every event that does not carry an explicit targetUrl.
export async function resolveActiveEndpointsForEvent(
  tenantId: string,
  event: string,
): Promise<WebhookDispatchResolution> {
  const active = await webhookEndpointRepository.listActiveEndpointsForTenant(tenantId);
  const targets = active
    .filter((endpoint) => endpoint.events.includes('*') || endpoint.events.includes(event))
    .map((endpoint) => ({ endpointId: endpoint.id, url: endpoint.url }));
  return { hasAnyActiveEndpoint: active.length > 0, targets };
}

// Called only by webhook.worker.ts, immediately before signing an actual delivery attempt.
// Resolved fresh on every attempt (never cached from enqueue time) so a secret rotation
// (regenerateWebhookEndpointSecret) or a deletion that happens between enqueue and a retried
// delivery takes effect immediately — same "live read, no propagation delay" guarantee
// apiKeyService.authenticateApiKey already gives revoked API keys. Returns `null` for a
// deleted/deactivated endpoint so the worker can fail the job instead of signing with a stale or
// nonexistent secret.
export async function findActiveSigningSecretHash(endpointId: string): Promise<string | null> {
  const endpoint = await webhookEndpointRepository.findActiveEndpointById(endpointId);
  return endpoint ? endpoint.secretHash : null;
}
