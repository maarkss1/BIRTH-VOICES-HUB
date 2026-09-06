- De: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Para: Agente 04 (Voice Runtime e Gateway de IA)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema

Ao validar a missão "Observabilidade" (`.agents/prompts/10-infraestrutura-observabilidade.md` item
4), confirmei que a pilha `infrastructure/observability/**` (otel-collector, Prometheus, Tempo,
Loki, Grafana) está corretamente conectada e um dashboard real (`infrastructure/observability/dashboards/otel-pipeline-health.json`)
já mostra dado ao vivo — mas só para **traces**. Métricas e logs declarados nos pipelines do
otel-collector nunca recebem dado real da aplicação:

- `lib/otelInitializer.ts` registra um `NodeSDK` com apenas `traceExporter` (`OTLPTraceExporter`).
  Não há `metricReader`/`OTLPMetricExporter` nem `logRecordProcessor`/`OTLPLogExporter`
  configurados.
- `lib/voice-runtime/otel.ts` (`OpenTelemetryCollector`) chama `metrics.getMeter(...)` e
  `this.meter.createHistogram('engine_latency_ms', ...)` esperando que isso alimente um pipeline de
  métricas real — mas como nenhum `MeterProvider` com exportador foi registrado pelo SDK, a API
  global do OTel usa um `MeterProvider` no-op, e essas métricas nunca saem do processo.
- O logger central (`src/lib/logger.ts`, pino) também não passa por nenhuma bridge OTel Logs — só
  vai para stdout.

Verificação:
```bash
grep -n "traceExporter\|metricReader\|logRecordProcessor" lib/otelInitializer.ts
# só traceExporter aparece
```

Isso não é um achado novo de auditoria (já está em `docs/AUDIT.md` §2/§3.5, "Observabilidade: sem
Correlation ID central..."), mas ao entregar o dashboard funcional pedido na minha missão eu preciso
registrar explicitamente essa lacuna em vez de fabricar dado ou fingir que os painéis de métricas/logs
mostram algo real — ver `AGENTS.md` §14. Os dois painéis correspondentes no dashboard
(`otel-pipeline-health.json`) ficam deliberadamente com a descrição "pending instrumentation" e sem
dado (nunca um número inventado), apontando para este handoff.

## Arquivo(s) envolvido(s)
- `lib/otelInitializer.ts` (bootstrap do NodeSDK — fora da propriedade exclusiva de qualquer agente
  listada em `AGENTS.md` §11, mas consumido só pela camada de telemetria que o Agente 04 possui)
- `lib/voice-runtime/otel.ts` (propriedade exclusiva do Agente 04 — não editei)

## Alteração necessária
1. Em `lib/otelInitializer.ts`, adicionar ao `NodeSDK`:
   - `metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: '<endpoint>/v1/metrics' }) })`, reaproveitando `OTEL_EXPORTER_OTLP_ENDPOINT` do mesmo jeito que o `traceExporter` já faz.
   - Opcionalmente um `logRecordProcessor` com `OTLPLogExporter` se quiser logs estruturados via OTel também saindo por esse caminho (alternativa: manter só pino/stdout e não mexer em logs agora — decisão de produto, não bloqueador).
2. Confirmar que `lib/voice-runtime/otel.ts` (`this.meter.createHistogram(...)`) realmente emite dado no novo pipeline após a mudança acima (o coletor já está pronto para receber em `otel-collector:4318/v1/metrics` e expor via `otel-collector:9464`, sem nenhuma mudança de infraestrutura necessária — `infrastructure/observability/prometheus.yml` job `otel-collector-app-metrics` já aponta para lá, hoje vazio).
3. Depois disso, o painel "App Metrics (OTLP)" em `infrastructure/observability/dashboards/otel-pipeline-health.json` passa a mostrar dado real automaticamente — não precisa de nenhuma edição no dashboard.

## Teste esperado
- Rodar `npm run infra:up` (stack `docker-compose.opensource.yml`), subir a app apontando
  `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, gerar algumas chamadas que passem por
  `OpenTelemetryCollector.endLocalSpan`, e confirmar em `http://localhost:9090/graph` que a query
  `engine_latency_ms_bucket` (ou o nome que o exporter de métrica produzir) retorna série não vazia.
- `npm run typecheck`/`npm run test` permanecem verdes após a mudança.

## Contexto adicional
Não bloqueia a Onda 4 nem está na lista de bloqueadores de `AGENTS.md` §9 — é debito de
observabilidade já catalogado em `docs/AUDIT.md`. Registrado aqui como handoff acionável em vez de
"achado sem correção" (proibido por `AGENTS.md` §19) porque a correção completa exige editar
`lib/voice-runtime/otel.ts`, de propriedade exclusiva do Agente 04.
