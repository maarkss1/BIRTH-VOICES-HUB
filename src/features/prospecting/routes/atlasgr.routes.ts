import express from 'express';
import { logger } from '../../../lib/logger.js';
import {
  voiceProspectingService,
  BlandConfigurationError,
  ExternalAiConsentRequiredError,
} from '../services/voice.service.js';
import { atlasGROutboundPayloadSchema, blandCallResultSchema } from '../validators/atlasgr.schema.js';
import { safeEqual } from '../lib/safeCompare.js';
import {
  beginBlandCallbackProcessing,
  completeBlandCallbackProcessing,
  IdempotencyCheckFailedError,
  releaseBlandCallbackProcessing,
} from '../lib/webhookIdempotency.js';
import { upsertAtlasGRCallResult } from '../../../repositories/atlasGRCallResultRepository.js';

const router = express.Router();

// This router is mounted before the global express.json() (see server.ts — it also needs to run
// before csrfProtection, since both routes below are server-to-server webhooks authenticated by
// their own secret, not by session cookie/Origin). It therefore owns its JSON body parser.
router.use(express.json());

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Authenticates the AtlasGR CRM as the caller via a pre-shared secret sent in a custom header.
 * Fails closed: if the secret isn't configured server-side, every request is rejected rather than
 * silently accepted.
 */
function validateAtlasGRSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expectedSecret = process.env.ATLASGR_WEBHOOK_SECRET;
  if (!expectedSecret) {
    logger.error('AtlasGR webhook rejected: ATLASGR_WEBHOOK_SECRET is not configured (failing closed)');
    res.status(503).json({ error: 'Integração AtlasGR não está configurada.' });
    return;
  }

  const provided = req.headers['x-atlasgr-webhook-secret'];
  if (typeof provided !== 'string' || !safeEqual(provided, expectedSecret)) {
    logger.warn('AtlasGR webhook rejected: missing or invalid shared secret', {
      hasHeader: typeof provided === 'string',
    });
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }

  next();
}

/**
 * Authenticates the Bland AI call-result callback via a token embedded in the callback URL itself
 * (Bland AI's outbound-call API takes a plain `webhook` URL with no custom-header support, so a
 * shared secret has to travel in the path).
 */
function validateBlandCallbackToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expectedToken = process.env.BLAND_WEBHOOK_TOKEN;
  if (!expectedToken) {
    logger.error('Bland AI callback rejected: BLAND_WEBHOOK_TOKEN is not configured (failing closed)');
    res.status(503).json({ error: 'Callback da Bland AI não está configurado.' });
    return;
  }

  const provided = req.params.token;
  if (typeof provided !== 'string' || !safeEqual(provided, expectedToken)) {
    logger.warn('Bland AI callback rejected: invalid token');
    res.status(403).json({ error: 'Token inválido.' });
    return;
  }

  next();
}

router.post('/webhook/atlasgr/outbound', validateAtlasGRSecret, async (req, res) => {
  const parsed = atlasGROutboundPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('AtlasGR webhook rejected: invalid payload', { issues: parsed.error.issues });
    res.status(400).json({ error: 'Payload inválido.', issues: parsed.error.issues.map((i) => i.message) });
    return;
  }

  try {
    const result = await voiceProspectingService.triggerOutboundCall(parsed.data);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ExternalAiConsentRequiredError) {
      logger.warn('AtlasGR webhook rejected: external AI consent is not granted for the configured tenant');
      res.status(403).json({
        error: 'Consentimento para processamento por provedor externo de IA é obrigatório.',
        code: 'AI_PROVIDER_CONSENT_REQUIRED',
      });
      return;
    }
    if (error instanceof IdempotencyCheckFailedError) {
      logger.error('AtlasGR webhook: idempotency check failed, rejecting to avoid a duplicate call', {
        error: error.message,
      });
      res.status(503).json({ error: 'Não foi possível processar o webhook no momento. Tente novamente.' });
      return;
    }
    if (error instanceof BlandConfigurationError) {
      logger.error('AtlasGR webhook: Bland AI integration is misconfigured', { error: error.message });
      res.status(503).json({ error: 'Integração com Bland AI não está configurada.' });
      return;
    }
    logger.error('AtlasGR webhook: failed to process outbound call request', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({ error: 'Failed to process AtlasGR webhook' });
  }
});

router.post('/webhooks/bland/:token', validateBlandCallbackToken, async (req, res) => {
  const parsed = blandCallResultSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('Bland AI callback rejected: invalid payload', { issues: parsed.error.issues });
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }

  const data = parsed.data as typeof parsed.data & Record<string, unknown>;
  const callId = data.call_id;
  logger.info('Received Bland AI call result callback', {
    callId,
    status: data.status,
  });

  // There must never be a built-in credential or localhost destination in this production path.
  // Both values are external configuration and the callback fails closed when either is absent.
  const atlasBaseUrl = process.env.ATLASGR_BASE_URL?.trim();
  const webhookSecret = process.env.ATLASGR_WEBHOOK_SECRET?.trim();
  if (!atlasBaseUrl || !webhookSecret) {
    logger.error('Bland AI callback cannot be forwarded: AtlasGR destination or signing secret is missing', {
      callId,
      hasBaseUrl: Boolean(atlasBaseUrl),
      hasSecret: Boolean(webhookSecret),
    });
    res.status(503).json({ error: 'Integração de retorno com AtlasGR não está configurada.' });
    return;
  }

  let processingState: Awaited<ReturnType<typeof beginBlandCallbackProcessing>>;
  try {
    processingState = await beginBlandCallbackProcessing(callId);
  } catch (error) {
    logger.error('Bland AI callback rejected because idempotency storage is unavailable', {
      callId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(503).json({ error: 'Não foi possível verificar idempotência do callback.' });
    return;
  }

  if (processingState === 'duplicate') {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  if (processingState === 'in_progress') {
    // Ask the provider to retry later instead of executing the same CRM side effect concurrently.
    res.status(503).json({ error: 'Callback já está sendo processado. Tente novamente.' });
    return;
  }

  const variables = asRecord(data.variables);
  const forwardPayload = {
    call_id: callId,
    phone_number: asString(data.to) || asString(variables.phone_number),
    concatenated_transcript: asString(data.concatenated_transcript),
    summary: asString(data.summary),
    recording_url: asString(data.recording_url),
    call_length: asNumber(data.call_length),
    completed: asBoolean(data.completed, true),
  };

  // Persist the call result for audit/historical lookup before attempting to forward it to
  // AtlasGR, so a later forwarding failure doesn't also cost us the only record that Bland AI
  // reported this result at all (see
  // .agents/handoffs/onda-4/01-para-06-persistir-resultado-bland-pronto.md). Fire-and-forget on
  // purpose: this local bookkeeping must never fail or delay the response to Bland AI, but a
  // failure here is never swallowed silently either — it is always logged.
  // `tenantId` is best-effort only: `ATLASGR_TENANT_ID` identifies the tenant at call *dispatch*
  // time, but that id is never sent to Bland AI as call metadata and never comes back in this
  // callback, so it cannot be verified against the actual call — see the `AtlasGRCallResult`
  // model comment in prisma/schema.prisma for the full rationale.
  upsertAtlasGRCallResult({
    callId,
    status: data.status ?? null,
    completed: forwardPayload.completed,
    callLength: forwardPayload.call_length || null,
    leadId: asString(variables.lead_id) || null,
    tenantId: process.env.ATLASGR_TENANT_ID?.trim() || null,
  }).catch((error) => {
    logger.error('Failed to persist AtlasGR/Bland AI call result', {
      callId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  try {
    const response = await fetch(`${atlasBaseUrl.replace(/\/$/, '')}/api/webhooks/voice-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atlasgr-webhook-secret': webhookSecret,
        // Lets the receiving CRM make its own update idempotent even if this service crashes after
        // AtlasGR accepts the request but before Redis is marked `done`.
        'x-idempotency-key': `bland-call-result:${callId}`,
      },
      body: JSON.stringify(forwardPayload),
    });

    if (!response.ok) {
      throw new Error(`AtlasGR voice-result returned HTTP ${response.status}`);
    }

    await completeBlandCallbackProcessing(callId);
    logger.info('Successfully forwarded voice call result to AtlasGR', { callId });
    res.status(200).json({ received: true, duplicate: false });
  } catch (error) {
    try {
      await releaseBlandCallbackProcessing(callId);
    } catch (releaseError) {
      logger.error('Failed to release Bland callback processing lock after forwarding failure', {
        callId,
        error: releaseError instanceof Error ? releaseError.message : String(releaseError),
      });
    }

    logger.error('Failed to forward voice call result to AtlasGR CRM', {
      callId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({ error: 'Falha ao encaminhar resultado da chamada para AtlasGR.' });
  }
});

export default router;
