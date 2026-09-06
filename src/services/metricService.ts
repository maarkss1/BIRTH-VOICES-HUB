import * as metricRepository from '../repositories/metricRepository.js';

export function listMetrics(tenantId: string, userId: string) {
  return metricRepository.listMetricsForUser(tenantId, userId);
}

// `userId` is null for tenant-wide events with no single attributable user (e.g. an AI provider
// call from lib/voice-runtime/providers/LLMGateway.ts) — see metricRepository.createMetric.
export function createMetric(tenantId: string, userId: string | null, data: { name: string; value: number; tags?: unknown }) {
  return metricRepository.createMetric(tenantId, userId, data);
}

export function clearMetrics(tenantId: string, userId: string) {
  return metricRepository.deleteMetricsForUser(tenantId, userId);
}
