import { createHmac } from 'crypto';
import { Worker, Job, UnrecoverableError } from 'bullmq';
import { getRedisConnectionOptions } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { isPrivateOrReservedHost } from '../validators/index.js';
import { WebhookPayload } from './webhook.service.js';
import { findActiveSigningSecretHash } from './webhookEndpointService.js';
import { recordDeliveryResult } from '../repositories/webhookEndpointRepository.js';

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

/** Thrown when a job carries an `endpointId` that no longer resolves to an active endpoint
 * (deleted or deactivated between enqueue and this delivery attempt) — see signBody below. */
class WebhookEndpointGoneError extends Error {}

/**
 * Signs the exact bytes we are about to send. Receivers recompute this HMAC over the raw request
 * body, so the string signed here and the string sent must be the same one — re-serializing the
 * payload for the request would risk a different key order and a signature that never verifies.
 *
 * Per-tenant endpoints (job carries `endpointId`) sign with that endpoint's own secret, resolved
 * fresh from webhookEndpointService on every attempt — never a single global secret, and never the
 * secret captured at enqueue time (a rotation/deletion mid-retry must take effect immediately, see
 * webhookEndpointService.findActiveSigningSecretHash). Legacy calls with no `endpointId` (a
 * `targetUrl` passed directly to `webhookService.dispatch`, or the deployment-wide
 * WEBHOOK_URL/TEST_WEBHOOK_URL fallback) keep signing with the single deployment-wide
 * WEBHOOK_SIGNING_SECRET env var, exactly as before — no per-tenant endpoint exists to own a
 * secret for that path.
 */
async function signBody(body: string, endpointId?: string): Promise<string | null> {
  if (endpointId) {
    const secretHash = await findActiveSigningSecretHash(endpointId);
    if (!secretHash) {
      throw new WebhookEndpointGoneError(`Webhook endpoint ${endpointId} no longer exists or is inactive`);
    }
    return createHmac('sha256', secretHash).update(body).digest('hex');
  }
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function startWebhookWorker() {
  const connection = { ...getRedisConnectionOptions(), maxRetriesPerRequest: null };

  const worker = new Worker(
    'webhooks',
    async (job: Job<{ url: string; payload: WebhookPayload; endpointId?: string }>) => {
      const { url, payload, endpointId } = job.data;
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

      let signature: string | null;
      try {
        signature = await signBody(body, endpointId);
      } catch (error) {
        if (error instanceof WebhookEndpointGoneError) {
          // The endpoint was deleted/deactivated after this job was enqueued — there is no secret
          // left to sign with and no admin left who configured this destination. Same reasoning
          // as the SSRF check above: this is categorically undeliverable, not a transient failure,
          // so fail immediately instead of burning the retry budget against a target that will
          // never become valid again.
          logger.error(`[WebhookWorker] ${error.message} (job ${job.id}) — failing without retry.`);
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }

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
        if (endpointId) {
          // Best-effort bookkeeping only — must never fail (or slow down) a delivery that already
          // succeeded. Throws WebhookEndpointSchemaNotReadyError until the schema in
          // .agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md lands; swallowed here for
          // exactly that reason.
          recordDeliveryResult(endpointId, 'delivered').catch(() => undefined);
        }
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
    const endpointId = job?.data?.endpointId;
    const attempts = job?.opts?.attempts ?? 1;
    if (endpointId && job && job.attemptsMade >= attempts) {
      // Final failure (retry budget exhausted) — best-effort bookkeeping, same "never fail on
      // recording" reasoning as the success path above.
      recordDeliveryResult(endpointId, 'failed').catch(() => undefined);
    }
  });

  logger.info('[WebhookWorker] Started listening for webhook events');

  return worker;
}
