import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn();

let lastWorkerProcessor: ((job: unknown) => unknown) | undefined;

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function Queue() {
    return { add: mockAdd, close: mockQueueClose };
  }),
  Worker: vi.fn().mockImplementation(function Worker(_name: string, processor: (job: unknown) => unknown) {
    lastWorkerProcessor = processor;
    return { on: mockOn, close: mockWorkerClose };
  }),
}));

vi.mock('../lib/env.js', () => ({
  getRedisConnectionOptions: () => ({ host: 'localhost', port: 6379 }),
}));

const mockPurgeExpiredCallLogs = vi.fn();
vi.mock('./callLogService.js', () => ({
  purgeExpiredCallLogs: (...args: unknown[]) => mockPurgeExpiredCallLogs(...args),
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { startRetentionScheduler, stopRetentionScheduler } from './retentionScheduler.js';

beforeEach(() => {
  vi.clearAllMocks();
  lastWorkerProcessor = undefined;
  mockAdd.mockResolvedValue(undefined);
});

describe('startRetentionScheduler', () => {
  it('registers a daily repeatable job on the callLogRetention queue', async () => {
    startRetentionScheduler();
    // Allow the fire-and-forget queue.add().then() microtask to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockAdd).toHaveBeenCalledWith(
      'purge',
      {},
      expect.objectContaining({
        repeat: { pattern: '0 0 * * *' },
      })
    );
  });

  it('processes a job by calling purgeExpiredCallLogs and logging the result', async () => {
    mockPurgeExpiredCallLogs.mockResolvedValue({ deletedCount: 3, cutoff: new Date('2025-01-01') });

    startRetentionScheduler();
    expect(lastWorkerProcessor).toBeDefined();

    const result = await lastWorkerProcessor!({ id: 'job-1' });

    expect(mockPurgeExpiredCallLogs).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deletedCount: 3 });
  });

  it('does not throw when purgeExpiredCallLogs rejects — the worker error handler owns it', async () => {
    mockPurgeExpiredCallLogs.mockRejectedValue(new Error('db unreachable'));

    startRetentionScheduler();

    await expect(lastWorkerProcessor!({ id: 'job-2' })).rejects.toThrow('db unreachable');
    // BullMQ, not our code, is responsible for catching this rejection and emitting 'failed' —
    // confirm we did register that handler.
    expect(mockOn).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('does not crash the process when starting the scheduler itself throws', async () => {
    const { Queue } = await import('bullmq');
    (Queue as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('redis connection refused');
    });

    expect(() => startRetentionScheduler()).not.toThrow();
  });
});

describe('stopRetentionScheduler', () => {
  it('closes the worker and queue', async () => {
    startRetentionScheduler();
    await stopRetentionScheduler();

    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockQueueClose).toHaveBeenCalled();
  });
});
