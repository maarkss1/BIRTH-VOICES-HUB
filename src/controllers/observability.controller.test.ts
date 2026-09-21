import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { observabilityMetricsHandler } from './observability.controller.js';
import { otelCollector } from '../../lib/voice-runtime/otel.js';

vi.mock('../../lib/voice-runtime/otel.js', () => ({
  otelCollector: {
    getSpans: vi.fn(),
    getMetrics: vi.fn(),
  },
}));

function fakeResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('observability.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('observabilityMetricsHandler', () => {
    it('returns filtered spans and metrics for the authenticated tenant', () => {
      const mockSpans = [
        { name: 'voice_call_turn', tenantId: 'tenant-123', durationMs: 45 },
      ];
      const mockMetrics = [
        { name: 'llm_latency', value: 350, tenantId: 'tenant-123' },
      ];

      vi.mocked(otelCollector.getSpans).mockReturnValue(mockSpans as never);
      vi.mocked(otelCollector.getMetrics).mockReturnValue(mockMetrics as never);

      const req = { tenantId: 'tenant-123' } as unknown as Request;
      const res = fakeResponse();

      observabilityMetricsHandler(req, res);

      expect(otelCollector.getSpans).toHaveBeenCalledWith('tenant-123');
      expect(otelCollector.getMetrics).toHaveBeenCalledWith('tenant-123');
      expect(res.json).toHaveBeenCalledWith({
        spans: mockSpans,
        metrics: mockMetrics,
      });
    });

    it('returns empty collections when collector has no data for tenant', () => {
      vi.mocked(otelCollector.getSpans).mockReturnValue([]);
      vi.mocked(otelCollector.getMetrics).mockReturnValue([]);

      const req = { tenantId: 'tenant-empty' } as unknown as Request;
      const res = fakeResponse();

      observabilityMetricsHandler(req, res);

      expect(otelCollector.getSpans).toHaveBeenCalledWith('tenant-empty');
      expect(otelCollector.getMetrics).toHaveBeenCalledWith('tenant-empty');
      expect(res.json).toHaveBeenCalledWith({
        spans: [],
        metrics: [],
      });
    });
  });
});
