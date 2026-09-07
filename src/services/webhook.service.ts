import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { resolveActiveEndpointsForEvent } from './webhookEndpointService.js';

/**
 * Envelope documented in docs/webhooks/index.md — consumers verify the signature over exactly
 * this JSON, so field names here are a published contract, not an internal detail.
 */
export interface WebhookPayload {
  id: string;
  type: string;
  timestamp: string;
  tenantId: string;
  data: Record<string, unknown>;
}

export class WebhookService {
  private webhookQueue: Queue;

  constructor() {
    this.webhookQueue = new Queue('webhooks', {
      connection: { ...getRedisConnectionOptions(), maxRetriesPerRequest: null },
    });
  }

  /**
   * Queues an event for delivery. Never throws: webhook delivery is a side effect of whatever
   * business operation produced the event, and must not be able to fail it.
   *
   * @param targetUrl Per-call destination — used for calls that carry their own callback URL
   *                  (e.g. `POST /api/voice/outbound`'s `callbackUrl`). When passed explicitly,
   *                  this legacy path is used as-is and per-tenant endpoints are not consulted —
   *                  the caller already named exactly one destination.
   *
   *                  When omitted, resolves the tenant's configured `TenantWebhookEndpoint`s
   *                  (webhookEndpointService.resolveActiveEndpointsForEvent) and enqueues one
   *                  delivery per active endpoint whose `events` includes this event type (or
   *                  `"*"`). Only when the tenant has NO active endpoint configured at all does
   *                  this fall back to the deployment-wide `WEBHOOK_URL`/`TEST_WEBHOOK_URL` env
   *                  vars — see resolveActiveEndpointsForEvent's `hasAnyActiveEndpoint` doc for why
   *                  a configured-but-non-matching tenant never falls through to that fallback.
   */
  public async dispatch(
    tenantId: string,
    event: string,
    data: Record<string, unknown>,
    targetUrl?: string,
  ): Promise<void> {
    try {
      const payload: WebhookPayload = {
        id: `evt_${randomUUID()}`,
        type: event,
        timestamp: new Date().toISOString(),
        tenantId,
        data,
      };

      if (targetUrl) {
        await this.enqueue({ url: targetUrl, payload });
        logger.info(`[WebhookService] Queued event ${event} for tenant ${tenantId} (explicit targetUrl)`);
        return;
      }

      // Defensive: resolution is a real Prisma read against `TenantWebhookEndpoint` (see
      // .agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint-pronto.md) and should not throw
      // in normal operation, but `dispatch()` itself is documented to never throw either — a
      // transient DB failure here is treated the same as "tenant has no active endpoint
      // configured", falling through to the legacy env-var behavior below rather than dropping the
      // event entirely.
      let hasAnyActiveEndpoint = false;
      let targets: { endpointId: string; url: string }[] = [];
      try {
        const resolution = await resolveActiveEndpointsForEvent(tenantId, event);
        hasAnyActiveEndpoint = resolution.hasAnyActiveEndpoint;
        targets = resolution.targets;
      } catch (resolutionError) {
        logger.debug(
          `[WebhookService] Could not resolve tenant webhook endpoints for tenant ${tenantId} (falling back to deployment-wide config): ${
            resolutionError instanceof Error ? resolutionError.message : String(resolutionError)
          }`,
        );
      }

      if (hasAnyActiveEndpoint) {
        if (targets.length === 0) {
          // Tenant has active endpoints, just none subscribed to this event type — a deliberate
          // no-op, never redirected to the deployment-wide fallback (see dispatch's doc comment).
          logger.debug(`[WebhookService] No tenant endpoint subscribed to event ${event} for tenant ${tenantId}`);
          return;
        }
        for (const target of targets) {
          await this.enqueue({ url: target.url, payload, endpointId: target.endpointId });
        }
        logger.info(
          `[WebhookService] Queued event ${event} for tenant ${tenantId} to ${targets.length} tenant endpoint(s)`,
        );
        return;
      }

      const webhookUrl = process.env.WEBHOOK_URL || process.env.TEST_WEBHOOK_URL;
      if (!webhookUrl) {
        logger.debug(`[WebhookService] No webhook URL configured for tenant ${tenantId}`);
        return;
      }

      await this.enqueue({ url: webhookUrl, payload });
      logger.info(`[WebhookService] Queued event ${event} for tenant ${tenantId} (deployment-wide fallback)`);
    } catch (error) {
      logger.error(`[WebhookService] Error dispatching webhook event ${event}`, error);
    }
  }

  private async enqueue(job: { url: string; payload: WebhookPayload; endpointId?: string }): Promise<void> {
    await this.webhookQueue.add('send_webhook', job, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
  }
}

export const webhookService = new WebhookService();
