import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn();

let lastWorkerProcessor: (() => unknown) | undefined;

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function Queue() {
    return { add: mockAdd, close: mockQueueClose };
  }),
  Worker: vi.fn().mockImplementation(function Worker(_name: string, processor: () => unknown) {
    lastWorkerProcessor = processor;
    return { on: mockOn, close: mockWorkerClose };
  }),
}));

const mockRedisDisconnect = vi.fn();
const mockRedisOn = vi.fn();
vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function Redis() {
    return { on: mockRedisOn, disconnect: mockRedisDisconnect, ping: vi.fn() };
  }),
}));

vi.mock('../lib/env.js', () => ({
  getRedisConnectionOptions: () => ({ host: 'localhost', port: 6379 }),
  getRedisUrl: () => 'redis://localhost:6379',
  getRedisRetryStrategy: () => (times: number) => Math.min(times * 500, 10_000),
}));

const mockCheckPlatformHealth = vi.fn();
vi.mock('../controllers/health.controller.js', () => ({
  checkPlatformHealth: (...args: unknown[]) => mockCheckPlatformHealth(...args),
}));

const mockListActiveTenantIds = vi.fn();
vi.mock('../repositories/tenantRepository.js', () => ({
  listActiveTenantIds: () => mockListActiveTenantIds(),
}));

const mockCreateMetric = vi.fn();
vi.mock('./metricService.js', () => ({
  createMetric: (...args: unknown[]) => mockCreateMetric(...args),
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { startSlaScheduler, stopSlaScheduler, PLATFORM_READY_METRIC_NAME } from './slaScheduler.js';
import { logger } from '../lib/logger.js';

beforeEach(() => {
  vi.clearAllMocks();
  lastWorkerProcessor = undefined;
  mockAdd.mockResolvedValue(undefined);
  mockCheckPlatformHealth.mockResolvedValue({ ready: true, checks: { database: 'ok', redis: 'ok' } });
  mockListActiveTenantIds.mockResolvedValue(['tenant-a', 'tenant-b']);
  mockCreateMetric.mockResolvedValue({ id: 'metric-1' });
});

describe('startSlaScheduler', () => {
  it('registers a 5-minute repeatable job on the platformSlaCheck queue', async () => {
    startSlaScheduler();
    // Allow the fire-and-forget queue.add().then() microtask to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockAdd).toHaveBeenCalledWith(
      'check',
      {},
      expect.objectContaining({
        repeat: { pattern: '*/5 * * * *' },
      })
    );
  });

  it('samples real platform health and fans a Metric row out to every active tenant', async () => {
    startSlaScheduler();
    expect(lastWorkerProcessor).toBeDefined();

    const result = await lastWorkerProcessor!();

    expect(mockCheckPlatformHealth).toHaveBeenCalledTimes(1);
    expect(mockListActiveTenantIds).toHaveBeenCalledTimes(1);
    expect(mockCreateMetric).toHaveBeenCalledTimes(2);
    expect(mockCreateMetric).toHaveBeenCalledWith(
      'tenant-a',
      null,
      expect.objectContaining({ name: PLATFORM_READY_METRIC_NAME, value: 1 })
    );
    expect(mockCreateMetric).toHaveBeenCalledWith(
      'tenant-b',
      null,
      expect.objectContaining({ name: PLATFORM_READY_METRIC_NAME, value: 1 })
    );
    expect(result).toEqual({ ready: true, tenantCount: 2 });
  });

  it('records value 0 (never fabricated) when the platform is not actually ready', async () => {
    mockCheckPlatformHealth.mockResolvedValue({ ready: false, checks: { database: 'error', redis: 'ok' } });

    startSlaScheduler();
    const result = await lastWorkerProcessor!();

    expect(mockCreateMetric).toHaveBeenCalledWith(
      'tenant-a',
      null,
      expect.objectContaining({ name: PLATFORM_READY_METRIC_NAME, value: 0 })
    );
    expect(result).toEqual({ ready: false, tenantCount: 2 });
  });

  it('logs, but does not throw, when persisting the metric fails for some tenants', async () => {
    mockCreateMetric.mockResolvedValueOnce({ id: 'ok' }).mockRejectedValueOnce(new Error('db unreachable'));

    startSlaScheduler();
    await expect(lastWorkerProcessor!()).resolves.toEqual({ ready: true, tenantCount: 2 });

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to persist'));
  });

  it('does not crash the process when starting the scheduler itself throws', async () => {
    const { Queue } = await import('bullmq');
    (Queue as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('redis connection refused');
    });

    expect(() => startSlaScheduler()).not.toThrow();
  });

  it('registers a failed-job handler so a rejected sample never crashes the worker', () => {
    startSlaScheduler();
    expect(mockOn).toHaveBeenCalledWith('failed', expect.any(Function));
  });
});

describe('stopSlaScheduler', () => {
  it('closes the worker, the queue and disconnects the redis client', async () => {
    startSlaScheduler();
    await stopSlaScheduler();

    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockQueueClose).toHaveBeenCalled();
    expect(mockRedisDisconnect).toHaveBeenCalled();
  });
});
