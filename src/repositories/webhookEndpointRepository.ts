// Prisma access for the per-tenant webhook endpoint domain (Agente 05 — Telefonia, Chamadas e
// Webhooks — webhook.service.ts/webhook.worker.ts are already exclusively owned by this agent per
// AGENTS.md §11, and this repository is the natural extension of that domain: resolves
// .agents/handoffs/onda-5/00-para-05-webhooks-tenant-contrato.md).
//
// Backed by the real `TenantWebhookEndpoint` model in prisma/schema.prisma (Agente 01 — see
// .agents/handoffs/onda-5/01-para-05-schema-webhook-endpoint-pronto.md). Kept intentionally thin:
// every function here is a direct Prisma query/mutation with no business rules (secret
// generation/hashing, the 5-active-endpoint limit, DTO mapping, authorization) — that logic lives
// in `src/services/webhookEndpointService.ts` (Clean Architecture, AGENTS.md §2: Controller →
// Service → Repository, no Prisma access outside `src/repositories/**`), same thin pattern already
// used by `apiKeyRepository.ts`.
//
// `secretHash` is NEVER selected by the listing/lookup queries below — only the functions that
// need it for delivery signing (`findActiveEndpointById`) or rotation
// (`regenerateSecret`/`createEndpoint`, which only ever WRITE it, never read a prior value back
// out for display) touch it. This makes an accidental hash leak through the listing endpoint
// structurally impossible rather than something the service layer has to remember to strip.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

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

// `events` is persisted as Prisma `Json` (see schema comment on TenantWebhookEndpoint) so the
// value that comes back from any query is `Prisma.JsonValue`, not `string[]`. Every row that ever
// goes through `createEndpoint`/`regenerateSecret` writes a genuine `string[]`, so in practice this
// always round-trips cleanly — but a defensive read never trusts that blindly (AGENTS.md §14:
// never fabricate data). An unexpected shape (not an array, or an array with non-string entries)
// is narrowed down to only its well-formed string entries rather than thrown, fabricated, or
// passed through as `unknown` — the caller's `TenantWebhookEndpointRecord.events: string[]`
// contract is never broken either way.
function normalizeEvents(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function toRecord(row: {
  id: string;
  tenantId: string;
  url: string;
  secretHash: string;
  events: Prisma.JsonValue;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: string | null;
}): TenantWebhookEndpointRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    url: row.url,
    secretHash: row.secretHash,
    events: normalizeEvents(row.events),
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastDeliveryAt: row.lastDeliveryAt,
    lastDeliveryStatus: row.lastDeliveryStatus,
  };
}

export async function countActiveEndpointsForTenant(tenantId: string): Promise<number> {
  return prisma.tenantWebhookEndpoint.count({ where: { tenantId, active: true } });
}

export async function createEndpoint(data: {
  tenantId: string;
  url: string;
  secretHash: string;
  events: string[];
}): Promise<TenantWebhookEndpointRecord> {
  const created = await prisma.tenantWebhookEndpoint.create({
    data: {
      tenantId: data.tenantId,
      url: data.url,
      secretHash: data.secretHash,
      events: data.events,
    },
  });
  return toRecord(created);
}

// All endpoints (active and inactive) belonging to the tenant — used by the GET listing. Never
// selects a column that would let the secret leak (there would be none to select even if asked:
// only secretHash is ever persisted, never the plaintext) — toRecord/the service layer's
// `toMetadata` never surface it regardless.
export async function listEndpointsForTenant(tenantId: string): Promise<TenantWebhookEndpointRecord[]> {
  const rows = await prisma.tenantWebhookEndpoint.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toRecord);
}

// Active-only — used by webhookEndpointService.resolveActiveEndpointsForEvent (dispatch path). A
// tenant-scoped query at the repository layer, never a filter applied after fetching everyone
// (AGENTS.md §15): the WHERE clause itself carries both `tenantId` and `active`.
export async function listActiveEndpointsForTenant(tenantId: string): Promise<TenantWebhookEndpointRecord[]> {
  const rows = await prisma.tenantWebhookEndpoint.findMany({
    where: { tenantId, active: true },
  });
  return rows.map(toRecord);
}

// Tenant-scoped lookup by id — never a global-by-id lookup. Used by delete/regenerate so an admin
// from tenant A can never act on — or even discover the existence of — an endpoint of tenant B.
// The WHERE clause itself carries `tenantId`, never a filter applied after an unscoped fetch.
export async function findEndpointForTenant(
  id: string,
  tenantId: string,
): Promise<TenantWebhookEndpointRecord | null> {
  const row = await prisma.tenantWebhookEndpoint.findFirst({ where: { id, tenantId } });
  return row ? toRecord(row) : null;
}

// Global-by-id, active-only lookup used exclusively by webhook.worker.ts right before signing a
// delivery attempt (the job only carries `endpointId`, resolved fresh on every attempt — see
// webhookEndpointService.findActiveSigningSecretHash). This is intentionally NOT tenant-scoped:
// the worker has no tenant-authenticated caller to scope against, it is resolving the endpoint
// that a prior, already-tenant-scoped `dispatch()` call decided to enqueue for.
export async function findActiveEndpointById(id: string): Promise<TenantWebhookEndpointRecord | null> {
  const row = await prisma.tenantWebhookEndpoint.findFirst({ where: { id, active: true } });
  return row ? toRecord(row) : null;
}

export async function deleteEndpoint(id: string): Promise<void> {
  await prisma.tenantWebhookEndpoint.delete({ where: { id } });
}

export async function regenerateSecret(
  id: string,
  secretHash: string,
): Promise<TenantWebhookEndpointRecord> {
  const updated = await prisma.tenantWebhookEndpoint.update({
    where: { id },
    data: { secretHash },
  });
  return toRecord(updated);
}

// Best-effort delivery bookkeeping (lastDeliveryAt/lastDeliveryStatus), called fire-and-forget by
// webhook.worker.ts — a failure here must never fail the delivery attempt it is recording. This
// function itself can reject like any other Prisma call (e.g. the endpoint was deleted between the
// attempt and this write); the caller is the one responsible for treating it as fire-and-forget.
export async function recordDeliveryResult(id: string, status: string): Promise<void> {
  await prisma.tenantWebhookEndpoint.update({
    where: { id },
    data: { lastDeliveryAt: new Date(), lastDeliveryStatus: status },
  });
}
