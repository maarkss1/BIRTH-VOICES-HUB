
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from '../src/lib/logger.js';

// See .agents/handoffs/onda-4/10-para-04-otel-metrics-logs-nao-exportados.md: this SDK used to
// register only `traceExporter`, so `lib/voice-runtime/otel.ts` (OpenTelemetryCollector) called
// `metrics.getMeter(...)`/`createHistogram(...)` against a no-op global MeterProvider — the
// histograms were created and recorded into, but nothing ever left the process. Registering
// `metricReaders` (real periodic OTLP export) and `logRecordProcessors` (real OTLP log export)
// below makes NodeSDK call `metrics.setGlobalMeterProvider(...)` / `logs.setGlobalLoggerProvider(...)`
// internally with providers that actually flush to the otel-collector, closing that gap for both
// signals without any change required in `lib/voice-runtime/otel.ts` itself.
const otlpEndpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318').replace(/\/$/, '');

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'birth-voices-app',
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  }),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${otlpEndpoint}/v1/metrics`,
      }),
      // otel-collector.yml's metrics pipeline batches independently; a short local export
      // interval keeps the Prometheus scrape (`otel-collector-app-metrics` job, 15s by default)
      // from reading a stale/empty window on the very first scrapes after boot.
      exportIntervalMillis: 10_000,
    }),
  ],
  // Bridges the central pino logger (src/lib/logger.ts) into real OTel Logs export. The bridge
  // itself lives in src/lib/logger.ts, calling the global Logs API (`@opentelemetry/api-logs`),
  // which is a safe no-op until a LoggerProvider is registered here — same pattern already used
  // for traces/metrics elsewhere in this file. Registering this processor is what turns that
  // no-op into a real OTLP export to the collector's `logs` pipeline (-> Loki).
  logRecordProcessors: [
    new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({
        url: `${otlpEndpoint}/v1/logs`,
      }),
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => logger.info('SDK shut down successfully'))
    .catch((error) => logger.error('Error shutting down SDK', error))
    .finally(() => process.exit(0));
});
