import { isPrivateOrReservedHost } from '../../src/validators/index.js';
import { logger } from '../../src/lib/logger.js';

/**
 * Generic outbound HTTP call for a Studio `tool` node (`node.data.config.method/endpoint/
 * headers/bodyPayload/timeoutMs/retryLimit` — see `docs/patterns/workflow-execution-contract.md`
 * §3). This is deliberately separate from `ToolEngine.ts` (`ToolExecutionEngine`), which scopes
 * *named, pre-registered* LLM function-calling tools to a tenant's `allowedTools`/
 * `grantedPermissions`. A Studio `tool` node instead calls an arbitrary tenant-configured HTTP
 * endpoint directly — the risk to defend against here is SSRF (a tenant pointing the call at
 * internal infrastructure), not tool-registry permission scope.
 *
 * Reuses `isPrivateOrReservedHost` from `src/validators/index.ts` (the same literal-IP allow/deny
 * logic already applied to `callbackUrl` there and, as defense-in-depth, to outbound webhook
 * delivery in `webhook.worker.ts`) instead of re-implementing SSRF defense a third time — see
 * `.agents/handoffs/onda-1/01-para-05-webhook-worker-ssrf-defense-in-depth.md` for the precedent.
 */

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

// A tool call happens synchronously inside a live phone turn (call setup today; see
// workflowRuntimeService.ts for why it cannot yet happen mid-conversation). These bounds keep the
// worst case (max timeout * max attempts) well under a typical telephony webhook response
// deadline instead of trusting whatever a tenant configured in the Studio inspector.
export const DEFAULT_TOOL_TIMEOUT_MS = 4000;
export const MAX_TOOL_TIMEOUT_MS = 6000;
export const DEFAULT_TOOL_RETRY_LIMIT = 0;
export const MAX_TOOL_RETRY_LIMIT = 1;
const MAX_RESPONSE_BODY_CHARS = 4000;

export interface HttpToolRequest {
  method: string;
  endpoint: string;
  headers?: Record<string, string>;
  bodyPayload?: unknown;
  timeoutMs?: number;
  retryLimit?: number;
}

export type HttpToolFailureReason =
  | 'unsupported_method'
  | 'blocked_url'
  | 'invalid_url'
  | 'timeout'
  | 'network_error'
  | `http_${number}`;

export interface HttpToolResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: HttpToolFailureReason;
}

/**
 * Same allow/deny policy as `isSafeWebhookUrl` in `webhook.worker.ts`: HTTPS required in
 * production (plain HTTP tolerated outside production for local test receivers), and the host
 * must not resolve, as a literal, to loopback/private/link-local/cloud-metadata space.
 */
export function isSafeToolUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production')) {
    return false;
  }
  return !isPrivateOrReservedHost(parsed.hostname);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Executes one Studio `tool` node's HTTP call. Never throws — every failure mode (blocked URL,
 * unsupported method, timeout, network error, non-2xx response) resolves to `{ ok: false, error }`
 * so a caller can always keep the phone call going on a recoverable path (see
 * `workflowRuntimeService.ts`'s `tool_ok`/`tool_error` variables), never propagate an unhandled
 * exception up into `telephonyService.ts`.
 */
export async function executeHttpTool(request: HttpToolRequest): Promise<HttpToolResult> {
  const method = (request.method || 'GET').trim().toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return { ok: false, error: 'unsupported_method' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(request.endpoint);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (!isSafeToolUrl(parsedUrl.toString())) {
    logger.warn('Workflow tool node refused: target URL is not an allowed public endpoint', {
      // Never log the full URL/query string here — a tenant-configured endpoint can carry
      // sensitive tokens or contact data in its query string.
      host: parsedUrl.hostname,
    });
    return { ok: false, error: 'blocked_url' };
  }

  const timeoutMs = clamp(request.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS, 1000, MAX_TOOL_TIMEOUT_MS);
  const retryLimit = clamp(request.retryLimit ?? DEFAULT_TOOL_RETRY_LIMIT, 0, MAX_TOOL_RETRY_LIMIT);

  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...(request.headers ?? {}) },
  };
  if (method !== 'GET' && method !== 'DELETE' && request.bodyPayload !== undefined) {
    init.body = typeof request.bodyPayload === 'string' ? request.bodyPayload : JSON.stringify(request.bodyPayload);
  }

  let lastError: HttpToolFailureReason = 'network_error';
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      const response = await fetch(parsedUrl.toString(), {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text().catch(() => '');
      const body = text.length > MAX_RESPONSE_BODY_CHARS ? text.slice(0, MAX_RESPONSE_BODY_CHARS) : text;

      if (!response.ok) {
        lastError = `http_${response.status}`;
        continue;
      }

      return { ok: true, status: response.status, body };
    } catch (error: unknown) {
      lastError = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error';
    }
  }

  return { ok: false, error: lastError };
}
