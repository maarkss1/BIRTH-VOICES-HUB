import { createHmac } from 'crypto';
import { Worker, Job, UnrecoverableError } from 'bullmq';
import { getRedisConnectionOptions } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { isPrivateOrReservedHost } from '../validators/index.js';
import { WebhookPayload } from './webhook.service.js';

/** Matches the 5s timeout published in docs/webhooks/index.md. */
const DELIVERY_TIMEOUT_MS = 5000;

/**
 * Defense-in-depth SSRF guard, re-checked here (not just at the `POST /api/voice/outbound` Zod
 * schema in `src/validators/index.ts`) because `job.data.url` is whatever was enqueued by
 * `webhookService.dispatch(...)`, and that is not guaranteed to always come from a value the
 * inbound schema validated — e.g. `WEBHOOK_URL`/`TEST_WEBHOOK_URL` env vars today, and any future
 * per-tenant `Webhook` model (see the TODO in `webhook.service.ts`) that a tenant admin could
 * configure through a different endpoint tomorrow. Reuses the exact same literal-IP allow/deny
 * logic as the inbound schema so the two checks cannot silently drift apart.
 * See `.agents/handoffs/onda-1/01-para-05-webhook-worker-ssrf-defense-in-depth.md`.
 */
function isSafeWebhookUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production')) {
    return false;
  }
  return !isPrivateOrReservedHost(parsed.hostname);
}

/**
 * Signs the exact bytes we are about to send. Receivers recompute this HMAC over the raw request
 * body, so the string signed here and the string sent must be the same one — re-serializing the
 * payload for the request would risk a different key order and a signature that never verifies.
 */
function signBody(body: string): string | null {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function startWebhookWorker() {
  const connection = { ...getRedisConnectionOptions(), maxRetriesPerRequest: null };

  const worker = new Worker(
    'webhooks',
    async (job: Job<{ url: string; payload: WebhookPayload }>) => {
      const { url, payload } = job.data;
      logger.debug(`[WebhookWorker] Processing job ${job.id} for tenant ${payload.tenantId}`);

      if (!isSafeWebhookUrl(url)) {
        // Not a transient delivery failure — the target is categorically disallowed (private/
        // reserved host, cloud metadata address, or a disallowed scheme), so retrying it under
        // the job's backoff config would only waste worker time hammering the same blocked
        // target. UnrecoverableError tells BullMQ to fail the job immediately without consuming
        // the retry budget.
        logger.error(
          `[WebhookWorker] Refusing to deliver event ${payload.type} for tenant ${payload.tenantId} (job ${job.id}): target URL is not an allowed public HTTPS endpoint.`,
        );
        throw new UnrecoverableError('Webhook target URL is not allowed (private/reserved host or disallowed scheme)');
      }

      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'BirthVoicesHub-Webhook/1.0',
      };

      const signature = signBody(body);
      if (signature) {
        headers['x-birthvoices-signature'] = signature;
      } else {
        // Without this the receiver cannot tell our requests from anyone else's POST to the same
        // public URL, so it is a deployment error rather than an optional nicety.
        logger.warn('[WebhookWorker] WEBHOOK_SIGNING_SECRET is not set — sending unsigned webhook');
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        logger.info(`[WebhookWorker] Successfully delivered event ${payload.type} to ${url}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[WebhookWorker] Failed to deliver event ${payload.type} to ${url}. Error: ${msg}`);
        throw error; // Let BullMQ handle the retry based on backoff config
      }
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[WebhookWorker] Job ${job?.id} failed. Reason: ${err.message}`);
  });

  logger.info('[WebhookWorker] Started listening for webhook events');

  return worker;
}
