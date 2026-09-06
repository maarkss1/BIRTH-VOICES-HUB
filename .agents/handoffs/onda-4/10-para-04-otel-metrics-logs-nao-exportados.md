- De: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Para: Agente 04 (Voice Runtime e Gateway de IA)
- Onda: 4
- Status: resolvido
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

## Resolução (Agente 04, Onda 4 — remediação)

Resolvido além do mínimo pedido: métricas **e** logs, não só métricas.

### O que foi mudado

1. `lib/otelInitializer.ts` — o `NodeSDK` agora registra, além do `traceExporter` que já existia:
   - `metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: '<endpoint>/v1/metrics' }) , exportIntervalMillis: 10_000 })]`
   - `logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: '<endpoint>/v1/logs' }) })]`

   Ambos reaproveitam a mesma variável `OTEL_EXPORTER_OTLP_ENDPOINT` que o `traceExporter` já usava
   (default `http://localhost:4318`), exatamente como o handoff pediu. Ao registrar
   `metricReaders`/`logRecordProcessors`, o próprio `NodeSDK` chama internamente
   `metrics.setGlobalMeterProvider(...)` e `logs.setGlobalLoggerProvider(...)` com providers reais —
   nenhuma mudança foi necessária em `lib/voice-runtime/otel.ts`: os `this.meter.createHistogram(...)`
   que já existiam lá agora escrevem em um `MeterProvider` real em vez do no-op global.

2. `src/lib/logger.ts` (bridge de logs, não apenas "opcional/pendente" — foi viável no tempo da
   missão) — o logger central (pino) agora também emite cada `debug/info/warn/error` como um
   `LogRecord` real via `@opentelemetry/api-logs` (`logs.getLogger('birth-voices-app-logger').emit(...)`),
   em paralelo ao `stdout` que já existia:
   - `logs.getLogger(...)` é seguro de chamar incondicionalmente: antes de #1 acima rodar, a API
     global devolve um logger no-op — mesmo padrão já usado para tracer/meter neste repositório.
   - **Nenhum novo caminho de vazamento de segredo**: o bridge aplica sua própria redação
     (`redactSecretsForExport`, mesma lista `SECRET_FIELD_NAMES` e a mesma profundidade
     top-level+1-nível que o `redact.paths` do pino já usava) antes de montar os `attributes` do
     `LogRecord` — não depende da redação interna do pino ter mutado o objeto original, porque esse
     objeto é reusado para um segundo destino de exportação (ver `AGENTS.md` §13/§16). Validado no
     smoke test abaixo: `apiKey` chegou como `[REDACTED]` tanto no stdout quanto no `LogRecord`
     exportado.
   - Falha ao emitir para o OTel Logs nunca derruba o log real da aplicação (`try/catch` com fallback
     para `base.warn(...)`).

### Estado exato do pipeline depois da mudança

- **Traces**: já funcionava antes (Agente 10 confirmou). Sem mudança de comportamento.
- **Métricas**: agora reais. `engine_latency_ms` (histogram criado em
  `lib/voice-runtime/otel.ts#endLocalSpan`) é exportado por OTLP/HTTP a cada 10s para
  `<OTEL_EXPORTER_OTLP_ENDPOINT>/v1/metrics` → chega ao `otel-collector` → pipeline `metrics` →
  exporter `prometheus` (porta 9464) → já configurado em `infrastructure/observability/prometheus.yml`
  (job `otel-collector-app-metrics`), sem nenhuma mudança de infraestrutura.
- **Logs**: agora reais. Todo `logger.debug/info/warn/error(...)` chamado em qualquer parte da app
  (não só voice-runtime) agora também sai como `LogRecord` OTLP para `<endpoint>/v1/logs` → pipeline
  `logs` do `otel-collector` → exporter `otlphttp/loki`. Isso cobre mais do que o pedido original do
  handoff (que citava só o painel "pending instrumentation" de métricas/logs do dashboard) — o
  logger central inteiro passou a ter bridge, não só uma prova de conceito isolada.

### Validação real (evidência, não afirmação)

Smoke test manual (fora de `__tests__/**`, que é propriedade exclusiva do Agente 08 — não criei
teste automatizado lá; ver nota abaixo) rodando `lib/otelInitializer.ts` real +
`otelCollector.startLocalSpan/endLocalSpan` + `logger.info(...)` contra um stub HTTP local ouvindo em
`:4318` no lugar do otel-collector real:

```
mini-collector listening on 4318
HIT POST /v1/logs bytes=1550
HIT POST /v1/traces bytes=1691
HIT POST /v1/metrics bytes=1776
done
```

As três requisições HTTP reais (`/v1/traces`, `/v1/metrics`, `/v1/logs`) chegaram ao stub — confirma
que os três pipelines efetivamente emitem OTLP, não apenas que o código compila. Log de diagnóstico
do próprio SDK (`diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)`) mostrou o
`LogRecord` exportado com `attributes: { foo: 'bar', apiKey: '[REDACTED]' }`, confirmando a redação
no novo caminho de exportação. Script de smoke test foi temporário (fora do repo após o teste, não
commitado).

Não subi a stack `docker-compose.opensource.yml` completa (`npm run infra:up` + Prometheus real
scrapando `:9090/graph`) neste ambiente de execução — sem Docker disponível nesta sessão. O smoke
test acima com um stub HTTP no lugar do otel-collector é a evidência equivalente disponível: prova
que a aplicação realmente faz as chamadas OTLP corretas (endpoint, path, payload não vazio) que o
`otel-collector.yml` já está configurado para receber; não prova a ponta Prometheus/Loki/Grafana
(infraestrutura, fora do meu domínio, já validada pelo Agente 10 para traces e com a mesma
configuração de pipeline para métricas/logs).

### Gate desta missão (branch `agente/04-remediacao-onda4`)

```
npm run typecheck   # OK, sem erros
npm run lint        # OK, 0 erros — 79 warnings pré-existentes (no-explicit-any em __tests__/**
                     # e vitest.setup.ts, já catalogados em TECHNICAL-DEBT-CHECKLIST.html, não
                     # tocados por esta remediação)
npm run test        # OK — 48 arquivos / 294 testes passando, 1 skip (pré-existente)
npm run build       # OK — vite build + esbuild server.ts sem erros
```

### O que falta (nada bloqueador; deixado explícito em vez de fingir 100%)

- Nenhuma unit/integration test nova foi adicionada para o bridge de logs/métricas: `__tests__/**` é
  propriedade exclusiva do Agente 08 (`AGENTS.md` §11). Se a cobertura automatizada for desejada,
  fica como pedido para o Agente 08 (não abri handoff formal por não ser bloqueador — o
  comportamento foi validado manualmente com evidência real acima, e o pipeline de trace já seguia o
  mesmo padrão de "sem teste dedicado, validado por integração real").
- `infrastructure/observability/dashboards/otel-pipeline-health.json` (propriedade do Agente 10):
  os dois painéis "pending instrumentation" citados no handoff original agora podem mostrar dado
  real, mas a edição do dashboard/labels é do Agente 10 — abri
  `.agents/handoffs/onda-4/04-para-10-dashboard-metrics-logs-reais.md` em vez de editar
  `infrastructure/**` diretamente.
- Não validei contra o `otel-collector` real (`docker-compose.opensource.yml`) por falta de Docker
  neste ambiente — ver nota de validação acima. Recomendo ao Coordenador confirmar em ambiente com
  Docker antes de release, mesmo não sendo bloqueador (o smoke test já prova que a aplicação emite
  OTLP corretamente; o risco residual é config de rede do compose, que é domínio do Agente 10).

### Arquivos alterados
- `lib/otelInitializer.ts`
- `src/lib/logger.ts`
