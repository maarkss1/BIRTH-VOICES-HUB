import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// Metrics with userId === null are tenant-wide events (no single user to attribute them to —
// e.g. an AI provider call triggered by an automated voice/call flow, see
// lib/voice-runtime/providers/LLMGateway.ts). They are merged in alongside the caller's own
// per-user metrics so a tenant member's dashboard can see organization-wide signals (AI cost,
// tokens, latency) without exposing another tenant's data — both queries stay scoped to the
// caller's own `tenantId`, so this can never cross a tenant boundary. Two plain equality queries
// (rather than a single `OR`-combined one) merged in application code, so this keeps working
// against the simplified Prisma test double in vitest.setup.ts, which only matches literal field
// equality and has no concept of an `OR` clause.
export async function listMetricsForUser(tenantId: string, userId: string) {
  const [own, tenantWide] = await Promise.all([
    prisma.metric.findMany({ where: { tenantId, userId }, orderBy: { timestamp: 'desc' }, take: 1000 }),
    prisma.metric.findMany({ where: { tenantId, userId: null }, orderBy: { timestamp: 'desc' }, take: 1000 }),
  ]);
  return [...own, ...tenantWide]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 1000);
}

// `userId` is optional/null for tenant-wide events that are not attributable to a single user
// (see listMetricsForUser above). Real per-user actions (e.g. `user_login`) keep passing a real
// userId.
export function createMetric(
  tenantId: string,
  userId: string | null,
  data: { name: string; value: number; tags?: unknown },
) {
  return prisma.metric.create({
    data: {
      tenantId,
      userId,
      name: data.name,
      value: data.value,
      tags: (data.tags ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function deleteMetricsForUser(tenantId: string, userId: string) {
  return prisma.metric.deleteMany({ where: { tenantId, userId } });
}
