import { GoogleGenAI } from "@google/genai";
import { otelCollector, SYSTEM_TENANT_ID } from "../otel";
import { getAiConsent } from "../../../src/services/settingService.js";
import { createMetric } from "../../../src/services/metricService.js";
import { logger } from "../../../src/lib/logger.js";

export interface GatewayResponse {
  text: string;
  providerUsed: string;
  latencyMs: number;
  tokensUsed: number;
  costUSD: number;
  fromFallback: boolean;
  // True when the request never left the process because the tenant has not registered AI
  // consent (LGPD) — distinct from a provider outage. See processRequest for the enforcement.
  blockedByConsent?: boolean;
}

type ProviderName = 'GoogleGemini' | 'OpenAI' | 'Claude';

class LLMProviderGateway {
  // Per-tenant rate limit buckets. A single shared bucket (the previous implementation) let one
  // tenant's traffic exhaust the budget for every other tenant sharing this process.
  private activeRequestTimestamps: Map<string, number[]> = new Map();
  private rateLimitMax = 60;
  private rateLimitWindowMs = 60000;

  // Standard pricing in USD per 1K tokens. This is an estimate only; provider invoices remain the
  // source of truth. Models can be overridden by environment without a code release.
  private PRICING: Record<ProviderName, { prompt: number, completion: number }> = {
    'GoogleGemini': { prompt: 0.000075, completion: 0.0003 },
    'OpenAI': { prompt: 0.0015, completion: 0.002 },
    'Claude': { prompt: 0.003, completion: 0.015 }
  };

  private checkRateLimit(tenantId: string): boolean {
    const now = Date.now();
    const timestamps = (this.activeRequestTimestamps.get(tenantId) || [])
      .filter(ts => now - ts < this.rateLimitWindowMs);

    if (timestamps.length >= this.rateLimitMax) {
      this.activeRequestTimestamps.set(tenantId, timestamps);
      return false;
    }
    timestamps.push(now);
    this.activeRequestTimestamps.set(tenantId, timestamps);
    return true;
  }

  // Gate every external-AI-provider call on registered tenant consent (LGPD, AGENTS.md blocker
  // #8). SYSTEM_TENANT_ID is reserved for non-contact/system-level operations; any path carrying
  // real tenant/contact data must propagate its real tenant id before reaching this gateway.
  private async hasConsent(tenantId: string): Promise<boolean> {
    if (tenantId === SYSTEM_TENANT_ID) return true;
    const consent = await getAiConsent(tenantId);
    return consent.granted;
  }

  // Fire-and-forget, tenant-scoped persistence of a single real provider call. Never allowed to
  // throw into the voice/call critical path — a metrics write failure must not break a real
  // conversation. `userId` is null: an AI provider call is attributed to the tenant/session, not
  // to a single interactive user (see metricRepository.createMetric).
  private recordProviderCallMetrics(
    tenantId: string,
    provider: ProviderName | 'NONE',
    tokensUsed: number,
    costUSD: number,
    latencyMs: number,
    fromFallback: boolean,
  ): void {
    const tags = { provider, fromFallback };
    Promise.all([
      createMetric(tenantId, null, { name: 'ai_call_cost_usd', value: costUSD, tags }),
      createMetric(tenantId, null, { name: 'ai_call_tokens', value: tokensUsed, tags }),
      createMetric(tenantId, null, { name: 'ai_call_latency_ms', value: latencyMs, tags }),
    ]).catch((err: unknown) => {
      logger.error('[LLMProviderGateway] Failed to persist AI call metrics', err);
    });
  }

  public async processRequest(
    prompt: string,
    preferredProvider: ProviderName = 'GoogleGemini',
    systemInstruction: string = "Você é um assistente atencioso de atendimento e qualificação por voz.",
    tenantId: string = SYSTEM_TENANT_ID
  ): Promise<GatewayResponse> {
    const spanId = otelCollector.startLocalSpan('LLMProviderGateway.processRequest', 'system', {
      preferredProvider,
      promptLength: prompt.length
    }, tenantId);

    const startTime = Date.now();

    if (!this.checkRateLimit(tenantId)) {
      otelCollector.endLocalSpan(spanId, { error: 'Rate limit exceeded' });
      throw new Error('Rate limit exceeded (Max 60 requests/min). Por favor, aguarde alguns segundos.');
    }

    // Consent is checked before any provider, including the fallback, sees the prompt.
    if (!(await this.hasConsent(tenantId))) {
      otelCollector.endLocalSpan(spanId, { blockedByConsent: true });
      otelCollector.recordLocalMetric('llm_consent_blocked', 1, { tenantId }, tenantId);
      return {
        text: 'Não posso processar esta solicitação com um provedor de IA externo até que o consentimento de uso de IA seja registrado para esta organização. Por favor, contate um administrador.',
        providerUsed: 'NONE',
        latencyMs: Date.now() - startTime,
        tokensUsed: 0,
        costUSD: 0,
        fromFallback: false,
        blockedByConsent: true
      };
    }

    let successfulProvider: ProviderName | null = null;
    const errorLog: string[] = [];
    let text = '';
    let tokensUsed = Math.ceil((prompt.length + systemInstruction.length) / 4);
    let isFallback = false;

    // The preferred provider gets first attempt. Gemini is always the final fallback and the Set
    // removes the duplicate when Gemini itself is preferred.
    const providerChain: ProviderName[] = [preferredProvider, 'GoogleGemini'];
    const uniqueChain = Array.from(new Set(providerChain));

    for (const provider of uniqueChain) {
      try {
        if (provider === 'GoogleGemini') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) throw new Error('GEMINI_API_KEY não configurado.');

          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          });

          const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
            contents: prompt,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          text = response.text || '';
          if (!text) throw new Error('Gemini retornou resposta vazia.');
          tokensUsed = response.usageMetadata?.totalTokenCount || tokensUsed;
          successfulProvider = provider;
          break;
        }

        if (provider === 'OpenAI') {
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) throw new Error('OPENAI_API_KEY não configurado.');

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: prompt }
              ],
              temperature: 0.7
            })
          });

          if (!response.ok) {
            throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { total_tokens?: number };
          };
          text = data.choices?.[0]?.message?.content || '';
          if (!text) throw new Error('OpenAI retornou resposta vazia.');
          tokensUsed = data.usage?.total_tokens || tokensUsed;
          successfulProvider = provider;
          break;
        }

        if (provider === 'Claude') {
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurado.');

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
              system: systemInstruction,
              messages: [
                { role: 'user', content: prompt }
              ],
              max_tokens: 1024
            })
          });

          if (!response.ok) {
            throw new Error(`Claude API Error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json() as {
            content?: Array<{ text?: string }>;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          text = data.content?.[0]?.text || '';
          if (!text) throw new Error('Claude retornou resposta vazia.');
          tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) || tokensUsed;
          successfulProvider = provider;
          break;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errorLog.push(`${provider}: ${message}`);
        isFallback = true;

        const failSpan = otelCollector.startLocalSpan(
          'LLMProviderGateway.providerFailure',
          'llm-gateway',
          { provider, error: message, nextProvider: uniqueChain[uniqueChain.indexOf(provider) + 1] || 'NONE' },
          tenantId
        );
        otelCollector.endLocalSpan(failSpan, { failed: true });
      }
    }

    if (!successfulProvider) {
      // Never fabricate a provider success or a business confirmation when every provider failed.
      text = 'Peço desculpas, estou com uma instabilidade técnica no momento. Por favor, tente novamente em alguns instantes.';
    }

    const latencyMs = Date.now() - startTime;
    const providerUsed = successfulProvider ?? 'NONE';
    const pricing = successfulProvider ? this.PRICING[successfulProvider] : null;
    const promptTokens = Math.ceil(tokensUsed * 0.7);
    const completionTokens = Math.ceil(tokensUsed * 0.3);
    const costUSD = pricing
      ? ((promptTokens * pricing.prompt) + (completionTokens * pricing.completion)) / 1000
      : 0;

    otelCollector.endLocalSpan(spanId, {
      providerUsed,
      tokensUsed,
      costUSD,
      latencyMs,
      fromFallback: isFallback,
      allProvidersFailed: successfulProvider === null,
      errors: errorLog
    });

    otelCollector.recordLocalMetric('llm_cost', costUSD, { provider: providerUsed }, tenantId);
    otelCollector.recordLocalMetric('llm_tokens', tokensUsed, { provider: providerUsed }, tenantId);

    // Persist real cost/tokens/latency in the durable Metric table (tenant-scoped) so dashboards
    // (e.g. pages/Dashboard/Overview.tsx) can query real historical AI usage instead of only the
    // in-memory/capped otelCollector data above. Only recorded when an actual provider call
    // succeeded — tokensUsed/costUSD before that point are our own pre-call estimates, and
    // AGENTS.md §14 forbids fabricating cost/telemetry numbers. SYSTEM_TENANT_ID has no row in
    // the Tenant table (see otel.ts), so it is excluded to avoid a foreign-key failure and
    // because there is no real tenant to scope a billing/usage metric to.
    if (successfulProvider && tenantId !== SYSTEM_TENANT_ID) {
      this.recordProviderCallMetrics(tenantId, providerUsed, tokensUsed, costUSD, latencyMs, isFallback);
    }

    return {
      text,
      providerUsed,
      latencyMs,
      tokensUsed,
      costUSD,
      fromFallback: isFallback
    };
  }
}

export const llmProviderGateway = new LLMProviderGateway();
