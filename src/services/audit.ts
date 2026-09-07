import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { createAuditLog } from '../repositories/auditLogRepository.js';
import { logger } from '../lib/logger.js';
import { getRedisUrl, getRedisRetryStrategy } from '../lib/env.js';

const redisUrl = getRedisUrl();
// BullMQ requires maxRetriesPerRequest: null on its connection; enqueue failures are still caught
// below so a Redis outage degrades to "audit log skipped" rather than blocking the request path.
// retryStrategy caps reconnect attempts at 10s apart so a real outage doesn't log-storm.
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null, connectTimeout: 2000, retryStrategy: getRedisRetryStrategy() });
connection.on('error', (err) => logger.error('Audit Redis connection error', err.message));

const auditQueue = new Queue('auditLogs', { connection });

new Worker(
  'auditLogs',
  async (job) => {
    await createAuditLog(job.data);
  },
  { connection }
);

export function writeAuditLog(tenantId: string | undefined, userId: string, action: string, details: unknown) {
  auditQueue
    .add('log', { tenantId, userId, action, details }, { removeOnComplete: true, removeOnFail: 100 })
    .catch((err) => logger.error('Audit queue enqueue failure', err));
}
