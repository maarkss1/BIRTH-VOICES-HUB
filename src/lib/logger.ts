import pino from 'pino';
import { logs, SeverityNumber, type Logger as OtelLogger } from '@opentelemetry/api-logs';
import { getRequestId } from './requestContext.js';

type LogMeta = Record<string, unknown> | unknown;

// Field-name-based redaction for known secret-bearing keys. This catches secrets passed as
// structured metadata (e.g. `logger.error('...', { apiKey })`) or embedded one level deep in an
// object (e.g. a provider's raw response echoed back for debugging). It does not scan arbitrary
// string values for secret-shaped content — call sites must still avoid interpolating raw
// credentials into the message string itself.
const SECRET_FIELD_NAMES = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'apikey',
  'secret',
  'clientSecret',
  'client_secret',
  'authorization',
  'Authorization',
  'jwtSecret',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'WEBHOOK_SIGNING_SECRET',
  'TWILIO_AUTH_TOKEN',
  'BLAND_API_KEY',
  'ELEVENLABS_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'S3_SECRET_KEY',
  'S3_ACCESS_KEY',
  'OIDC_CLIENT_SECRET',
];

const redactPaths = SECRET_FIELD_NAMES.flatMap((name) => [name, `*.${name}`]);

const base = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  base: undefined, // omit pid/hostname noise; Cloud Run already attaches that context
});

function normalizeMeta(meta: LogMeta): Record<string, unknown> | undefined {
  if (meta === undefined) return undefined;
  if (meta instanceof Error) {
    return { err: meta };
  }
  if (typeof meta === 'object' && meta !== null) {
    return meta as Record<string, unknown>;
  }
  return { detail: meta };
}

// --- OTel Logs bridge -------------------------------------------------------------------------
// See .agents/handoffs/onda-4/10-para-04-otel-metrics-logs-nao-exportados.md: pino only ever wrote
// to stdout, with no path into the OTel pipeline the otel-collector already exposes (`logs`
// pipeline -> Loki). `logs.getLogger(...)` is safe to call unconditionally: until
// `lib/otelInitializer.ts` registers a real LoggerProvider (via `logRecordProcessors`), the global
// Logs API hands back a no-op logger and `emit(...)` below is a harmless no-op — the same pattern
// already relied on for traces/metrics elsewhere in this codebase.
const otelLogger: OtelLogger = logs.getLogger('birth-voices-app-logger');

const OTEL_SEVERITY: Record<'debug' | 'info' | 'warn' | 'error', { number: SeverityNumber; text: string }> = {
  debug: { number: SeverityNumber.DEBUG, text: 'DEBUG' },
  info: { number: SeverityNumber.INFO, text: 'INFO' },
  warn: { number: SeverityNumber.WARN, text: 'WARN' },
  error: { number: SeverityNumber.ERROR, text: 'ERROR' },
};

function isSecretKey(key: string): boolean {
  return SECRET_FIELD_NAMES.some((name) => name.toLowerCase() === key.toLowerCase());
}

// Redacts the same field names/depth as the pino `redact` config above (top-level + one level
// nested, matching the `name`/`*.name` path pairs in `redactPaths`). Applied independently of
// pino's own redaction because this object is exported down a second, separate path (OTel Logs ->
// otel-collector -> Loki) and must never rely on pino's internal serialization to have already
// scrubbed it in place.
function redactSecretsForExport(input: Record<string, unknown>, depth = 1): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSecretKey(key)) {
      out[key] = '[REDACTED]';
    } else if (depth > 0 && value !== null && typeof value === 'object' && !(value instanceof Error) && !Array.isArray(value)) {
      out[key] = redactSecretsForExport(value as Record<string, unknown>, depth - 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// OTel LogRecord attribute values must be strings/numbers/booleans (or homogeneous arrays of
// those) — flatten anything else (Error objects, nested objects/arrays already past the
// redaction pass) into a string so `emit(...)` never throws on a shape it doesn't accept.
function toAttributeValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function emitOtelLogRecord(level: 'debug' | 'info' | 'warn' | 'error', message: string, payload: Record<string, unknown>) {
  try {
    const severity = OTEL_SEVERITY[level];
    const redacted = redactSecretsForExport(payload);
    const attributes: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(redacted)) {
      attributes[key] = toAttributeValue(value);
    }
    otelLogger.emit({
      severityNumber: severity.number,
      severityText: severity.text,
      body: message,
      attributes,
    });
  } catch (bridgeError) {
    // Telemetry export must never break the actual application log call.
    base.warn({ err: bridgeError }, 'Failed to emit log record to OTel Logs bridge');
  }
}
// -----------------------------------------------------------------------------------------------

function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: LogMeta) {
  const requestId = getRequestId();
  const normalized = normalizeMeta(meta);
  const payload = {
    ...(requestId ? { requestId } : {}),
    ...(normalized || {}),
  };
  base[level](payload, message);
  emitOtelLogRecord(level, message, payload);
}

export const logger = {
  debug(message: string, meta?: LogMeta) {
    log('debug', message, meta);
  },
  info(message: string, meta?: LogMeta) {
    log('info', message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    log('warn', message, meta);
  },
  error(message: string, meta?: LogMeta) {
    log('error', message, meta);
  },
};
