import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// webhook.service.ts constructs `export const webhookService = new WebhookService()` — a Queue —
// at module TOP LEVEL, which runs as soon as this test file's `import { WebhookService } from
// './webhook.service.js'` is evaluated (ESM evaluates a dependency's module body before returning
// control to the importer, regardless of where the import statement sits textually in this file).
// A plain `const mockAdd = vi.fn()` referenced inside the `vi.mock('bullmq', ...)` factory would
// still be in its temporal dead zone at that point; `vi.hoisted` runs before any import is
// evaluated, which is exactly the ordering guarantee needed here.
const { mockAdd } = vi.hoisted(() => ({ mockAdd: vi.fn().mockResolvedValue(undefined) }));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function Queue() {
    return { add: mockAdd };
  }),
}));

vi.mock('../lib/env.js', () => ({
  getRedisConnectionOptions: () => ({ host: 'localhost', port: 6379 }),
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockResolveActiveEndpointsForEvent = vi.fn();
vi.mock('./webhookEndpointService.js', () => ({
  resolveActiveEndpointsForEvent: (...args: unknown[]) => mockResolveActiveEndpointsForEvent(...args),
}));

import { WebhookService } from './webhook.service.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  mockAdd.mockResolvedValue(undefined);
  delete process.env.WEBHOOK_URL;
  delete process.env.TEST_WEBHOOK_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('WebhookService.dispatch — explicit targetUrl (legacy per-call path)', () => {
  it('enqueues a single job to targetUrl without consulting tenant endpoints', async () => {
    const service = new WebhookService();
    await service.dispatch('tenant-a', 'agent.call.ended', { ok: true }, 'https://caller.example.com/callback');

    expect(mockResolveActiveEndpointsForEvent).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [, jobData, jobOpts] = mockAdd.mock.calls[0];
    expect(jobData.url).toBe('https://caller.example.com/callback');
    expect(jobData.endpointId).toBeUndefined();
    expect(jobData.payload.tenantId).toBe('tenant-a');
    expect(jobData.payload.type).toBe('agent.call.ended');
    expect(jobOpts).toEqual({ attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
  });
});

describe('WebhookService.dispatch — per-tenant endpoint resolution', () => {
  it('enqueues one job per matching active endpoint, each carrying its own endpointId', async () => {
    mockResolveActiveEndpointsForEvent.mockResolvedValue({
      hasAnyActiveEndpoint: true,
      targets: [
        { endpointId: 'ep-1', url: 'https://a.example.com/hook' },
        { endpointId: 'ep-2', url: 'https://b.example.com/hook' },
      ],
    });

    const service = new WebhookService();
    await service.dispatch('tenant-a', 'call.completed', { sessionId: 's1' });

    expect(mockResolveActiveEndpointsForEvent).toHaveBeenCalledWith('tenant-a', 'call.completed');
    expect(mockAdd).toHaveBeenCalledTimes(2);
    const urls = mockAdd.mock.calls.map((call) => call[1].url);
    const endpointIds = mockAdd.mock.calls.map((call) => call[1].endpointId);
    expect(urls).toEqual(['https://a.example.com/hook', 'https://b.example.com/hook']);
    expect(endpointIds).toEqual(['ep-1', 'ep-2']);
  });

  it('does not enqueue anything when the tenant has active endpoints but none subscribe to this event type', async () => {
    mockResolveActiveEndpointsForEvent.mockResolvedValue({ hasAnyActiveEndpoint: true, targets: [] });
    process.env.WEBHOOK_URL = 'https://deployment-wide.example.com/hook';

    const service = new WebhookService();
    await service.dispatch('tenant-a', 'lead.qualified', { leadId: 'l1' });

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('falls back to the deployment-wide WEBHOOK_URL only when the tenant has NO active endpoint at all', async () => {
    mockResolveActiveEndpointsForEvent.mockResolvedValue({ hasAnyActiveEndpoint: false, targets: [] });
    process.env.WEBHOOK_URL = 'https://deployment-wide.example.com/hook';

    const service = new WebhookService();
    await service.dispatch('tenant-a', 'call.completed', { sessionId: 's1' });

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][1].url).toBe('https://deployment-wide.example.com/hook');
    expect(mockAdd.mock.calls[0][1].endpointId).toBeUndefined();
  });

  it('drops the event silently (never throws) when there is no tenant endpoint and no deployment-wide URL configured', async () => {
    mockResolveActiveEndpointsForEvent.mockResolvedValue({ hasAnyActiveEndpoint: false, targets: [] });

    const service = new WebhookService();
    await expect(service.dispatch('tenant-a', 'call.completed', {})).resolves.toBeUndefined();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('treats a schema-not-ready resolution failure exactly like "no tenant endpoint configured" and never throws', async () => {
    mockResolveActiveEndpointsForEvent.mockRejectedValue(new Error('TenantWebhookEndpoint ainda não existe'));
    process.env.WEBHOOK_URL = 'https://deployment-wide.example.com/hook';

    const service = new WebhookService();
    await expect(service.dispatch('tenant-a', 'call.completed', {})).resolves.toBeUndefined();

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][1].url).toBe('https://deployment-wide.example.com/hook');
  });

  it('never enqueues a target belonging to a different tenant than the one dispatching', async () => {
    mockResolveActiveEndpointsForEvent.mockImplementation(async (tenantId: string) => {
      if (tenantId !== 'tenant-a') {
        throw new Error('should never be queried for another tenant');
      }
      return { hasAnyActiveEndpoint: true, targets: [{ endpointId: 'ep-a', url: 'https://a.example.com/hook' }] };
    });

    const service = new WebhookService();
    await service.dispatch('tenant-a', 'call.completed', {});

    expect(mockResolveActiveEndpointsForEvent).toHaveBeenCalledWith('tenant-a', 'call.completed');
    expect(mockAdd.mock.calls[0][1].url).toBe('https://a.example.com/hook');
  });

  it('dispatch never throws even if the queue itself rejects', async () => {
    mockResolveActiveEndpointsForEvent.mockResolvedValue({ hasAnyActiveEndpoint: false, targets: [] });
    process.env.WEBHOOK_URL = 'https://deployment-wide.example.com/hook';
    mockAdd.mockRejectedValueOnce(new Error('redis is down'));

    const service = new WebhookService();
    await expect(service.dispatch('tenant-a', 'call.completed', {})).resolves.toBeUndefined();
  });
});
