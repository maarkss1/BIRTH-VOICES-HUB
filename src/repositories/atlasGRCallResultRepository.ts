import { prisma } from '../lib/prisma.js';

/**
 * Persists the result of a call dispatched via the AtlasGR/Bland AI prospecting integration.
 * Resolves .agents/handoffs/onda-1/06-para-01-persistir-resultado-bland.md — see the
 * `AtlasGRCallResult` model in `prisma/schema.prisma` for the full rationale, including why
 * `tenantId` is optional (this integration has no verifiable per-call tenant signal today).
 *
 * Intended caller: the Bland AI result callback handler in
 * `src/features/prospecting/routes/atlasgr.routes.ts` (Agente 06's domain) — this file only
 * provides the persistence primitive; wiring it into that handler is Agente 06's follow-up
 * (see `.agents/handoffs/onda-4/01-para-06-persistir-resultado-bland-pronto.md`).
 */

export interface UpsertAtlasGRCallResultInput {
  callId: string;
  tenantId?: string | null;
  leadId?: string | null;
  status?: string | null;
  completed?: boolean | null;
  callLength?: number | null;
}

/**
 * Idempotent by construction: `callId` carries a unique constraint, so a redelivered Bland AI
 * callback for the same call (e.g. after the Redis idempotency TTL in
 * `src/features/prospecting/lib/webhookIdempotency.ts` has already expired) updates the existing
 * row instead of creating a duplicate one. `receivedAt` is therefore only set on first insert —
 * it intentionally is NOT bumped on a later redelivery, since it records when this call result was
 * first observed, not when it was last confirmed.
 */
export function upsertAtlasGRCallResult(input: UpsertAtlasGRCallResultInput) {
  const shared = {
    tenantId: input.tenantId ?? null,
    leadId: input.leadId ?? null,
    status: input.status ?? null,
    completed: input.completed ?? null,
    callLength: input.callLength ?? null,
  };

  return prisma.atlasGRCallResult.upsert({
    where: { callId: input.callId },
    create: {
      callId: input.callId,
      ...shared,
    },
    update: shared,
  });
}

export function findAtlasGRCallResultByCallId(callId: string) {
  return prisma.atlasGRCallResult.findUnique({ where: { callId } });
}

/**
 * Tenant-scoped, paginated read of dispatched-call results, for a future "quantas ligações a
 * AtlasGR disparou e qual foi o resultado de cada uma" view. `tenantId` must come from the
 * authenticated session (requireTenant), never from client input, same rule as every other
 * tenant-scoped query in this codebase — see AGENTS.md §15.
 *
 * Rows with `tenantId: null` (see the model comment for why some legitimately have none) are
 * intentionally excluded here rather than merged in the way `metricRepository.listMetricsForUser`
 * merges tenant-wide rows: a null `tenantId` on this model reflects "no verifiable tenant", not
 * "belongs to every tenant", so surfacing it inside one tenant's own view would misattribute it.
 * A separate, explicitly-labelled admin/operational view is the right place to list untenanted
 * rows, not this function.
 */
export async function listAtlasGRCallResultsForTenant(
  tenantId: string,
  { page, pageSize }: { page: number; pageSize: number }
) {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.atlasGRCallResult.findMany({
      where: { tenantId },
      orderBy: { receivedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.atlasGRCallResult.count({ where: { tenantId } }),
  ]);
  return { items, total };
}
