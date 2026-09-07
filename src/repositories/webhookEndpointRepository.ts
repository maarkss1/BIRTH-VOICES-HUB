// Prisma access for the per-tenant webhook endpoint domain (Agente 05 — Telefonia, Chamadas e
// Webhooks — webhook.service.ts/webhook.worker.ts are already exclusively owned by this agent per
// AGENTS.md §11, and this repository is the natural extension of that domain: resolves
// .agents/handoffs/onda-5/00-para-05-webhooks-tenant-contrato.md).
//
// SCAFFOLD NOTICE (AGENTS.md §14 — never fabricate data): `prisma/schema.prisma` is exclusive to
// Agente 01 and does not yet define a `TenantWebhookEndpoint` model — see
// .agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md for the exact proposed shape.
// Every function below already has the FINAL signature that webhookEndpointService.ts and
// webhook.worker.ts call, so nothing above this file will need to change once the schema lands —
// but each one throws `WebhookEndpointSchemaNotReadyError` instead of querying a table that does
// not exist yet, rather than silently returning empty results (which would look like "tenant has
// no endpoints configured" and is not true — the feature is simply not deployed yet) or a `never`
// mock value pretending to be real persistence. This mirrors the exact scaffold Agente 12 used for
// billing before Agente 01 added Plan/Wallet/Transaction — see
// .agents/handoffs/onda-4/12-para-01-schema-billing-monetizacao.md.
//
// Once that handoff is resolved: swap every function body for the equivalent
// `prisma.tenantWebhookEndpoint.*` call (same thin, no-business-logic pattern already used by
// apiKeyRepository.ts) and delete this notice + the error class.
//
// webhookEndpointService.ts is unit-tested today with this repository fully mocked (same approach
// apiKeyService.test.ts already uses for apiKeyRepository.ts), so the business logic (secret
// generation/hashing, the 5-active-endpoint limit, per-tenant/per-event resolution, cross-tenant
// isolation of lookups) already has real, executable test coverage independent of this scaffold.

export class WebhookEndpointSchemaNotReadyError extends Error {
  constructor() {
    super(
      'TenantWebhookEndpoint ainda não existe em prisma/schema.prisma — aguardando o Agente 01 ' +
        'resolver .agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md.',
    );
    this.name = 'WebhookEndpointSchemaNotReadyError';
  }
}

export interface TenantWebhookEndpointRecord {
  id: string;
  tenantId: string;
  url: string;
  /** SHA-256 hex digest of the plaintext secret — see webhookEndpointService.ts#hashWebhookSecret. */
  secretHash: string;
  /** Event types this endpoint receives, or `["*"]` for all. */
  events: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: string | null;
}

export async function countActiveEndpointsForTenant(_tenantId: string): Promise<number> {
  throw new WebhookEndpointSchemaNotReadyError();
}

export async function createEndpoint(_data: {
  tenantId: string;
  url: string;
  secretHash: string;
  events: string[];
}): Promise<TenantWebhookEndpointRecord> {
  throw new WebhookEndpointSchemaNotReadyError();
}

// All endpoints (active and inactive) belonging to the tenant — used by the GET listing. Never
// selects a column that would let the secret leak (there would be none to select even if asked:
// only secretHash is ever persisted, never the plaintext).
export async function listEndpointsForTenant(_tenantId: string): Promise<TenantWebhookEndpointRecord[]> {
  throw new WebhookEndpointSchemaNotReadyError();
}

// Active-only — used by webhookEndpointService.resolveActiveEndpointsForEvent (dispatch path). A
// tenant-scoped query at the repository layer, never a filter applied after fetching everyone
// (AGENTS.md §15): the WHERE clause itself must carry `tenantId`, once implemented against Prisma.
export async function listActiveEndpointsForTenant(_tenantId: string): Promise<TenantWebhookEndpointRecord[]> {
  throw new WebhookEndpointSchemaNotReadyError();
}

// Tenant-scoped lookup by id — never a global-by-id lookup. Used by delete/regenerate so an admin
// from tenant A can never act on — or even discover the existence of — an endpoint of tenant B.
export async function findEndpointForTenant(
  _id: string,
  _tenantId: string,
): Promise<TenantWebhookEndpointRecord | null> {
  throw new WebhookEndpointSchemaNotReadyError();
}

// Global-by-id, active-only lookup used exclusively by webhook.worker.ts right before signing a
// delivery attempt (the job only carries `endpointId`, resolved fresh on every attempt — see
// webhookEndpointService.findActiveSigningSecretHash). This is intentionally NOT tenant-scoped:
// the worker has no tenant-authenticated caller to scope against, it is resolving the endpoint
// that a prior, already-tenant-scoped `dispatch()` call decided to enqueue for.
export async function findActiveEndpointById(_id: string): Promise<TenantWebhookEndpointRecord | null> {
  throw new WebhookEndpointSchemaNotReadyError();
}

export async function deleteEndpoint(_id: string): Promise<void> {
  throw new WebhookEndpointSchemaNotReadyError();
}

export async function regenerateSecret(
  _id: string,
  _secretHash: string,
): Promise<TenantWebhookEndpointRecord> {
  throw new WebhookEndpointSchemaNotReadyError();
}

// Best-effort delivery bookkeeping (lastDeliveryAt/lastDeliveryStatus), called fire-and-forget by
// webhook.worker.ts — a failure here must never fail the delivery attempt it is recording.
export async function recordDeliveryResult(_id: string, _status: string): Promise<void> {
  throw new WebhookEndpointSchemaNotReadyError();
}
