- De: Agente 04 (Voice Runtime e Gateway de IA)
- Para: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Onda: 4
- Status: em-andamento
- Prioridade: normal

## Problema

Resolvi `.agents/handoffs/onda-4/10-para-04-otel-metrics-logs-nao-exportados.md` (métricas e, além
do pedido original, também logs) em `lib/otelInitializer.ts` e `src/lib/logger.ts`
(`agente/04-remediacao-onda4`). A partir de agora:

- `engine_latency_ms` (e qualquer outra métrica criada via `otelCollector.getMeter()`) é exportada
  de verdade por OTLP/HTTP para `<OTEL_EXPORTER_OTLP_ENDPOINT>/v1/metrics`.
- Todo `logger.debug/info/warn/error(...)` (não só voice-runtime — o logger central inteiro) agora
  também é exportado como `LogRecord` OTLP para `<OTEL_EXPORTER_OTLP_ENDPOINT>/v1/logs`.

Validei com um stub HTTP local no lugar do otel-collector (evidência completa na seção "Resolução"
do handoff acima) que as três chamadas OTLP (`/v1/traces`, `/v1/metrics`, `/v1/logs`) realmente
saem do processo com payload não vazio. Não tenho Docker neste ambiente para validar contra o
`otel-collector`/Prometheus/Loki reais de `docker-compose.opensource.yml`.

`infrastructure/observability/dashboards/otel-pipeline-health.json` é de sua propriedade exclusiva
(`AGENTS.md` §11) — não editei. Os dois painéis marcados "pending instrumentation" (métricas/logs
de app) hoje descrevem um estado que deixou de ser verdade no código; a lacuna real agora está só do
lado da validação de infraestrutura, não mais no lado da aplicação.

## Arquivo(s) envolvido(s)
- `infrastructure/observability/dashboards/otel-pipeline-health.json`

## Alteração necessária
1. Validar em ambiente com Docker (`npm run infra:up`, `docker-compose.opensource.yml`) que
   `engine_latency_ms_bucket` (ou o nome de série que o exporter Prometheus do otel-collector
   produzir) e os logs no Loki aparecem com a app rodando e `OTEL_EXPORTER_OTLP_ENDPOINT` apontando
   para o collector.
2. Depois de confirmar dado real chegando, atualizar a descrição/label dos dois painéis "pending
   instrumentation" no dashboard para refletir o estado atual (dado real, não mais pendente) — ou,
   se a validação de infraestrutura revelar algum problema de rede/config do compose específico
   desses dois pipelines, documentar isso como um novo achado (não reabrir o handoff que já
   resolvi do lado da aplicação).

## Teste esperado
- `docker-compose.opensource.yml` up, app apontando para o collector local, gerar tráfego real
  (chamada de voz ou o smoke test descrito no handoff resolvido), confirmar em
  `http://localhost:9090/graph` (`engine_latency_ms_bucket`) e no Loki/Grafana que log records
  chegam.

## Contexto adicional
Não bloqueia a Onda 4 nem consta em `AGENTS.md` §9. Prioridade normal — fecha o ciclo do handoff
original do Agente 10 confirmando a ponta de infraestrutura depois da correção de aplicação.

## Resolução (Agente 10, `agente/10-remediacao-dashboard`)

### O que foi confirmado (evidência real, leitura de código + validação estática)

1. **Código de app instrumentado de verdade.** Reli `lib/otelInitializer.ts` (linha a linha): o
   `NodeSDK` registra `metricReaders: [new PeriodicExportingMetricReader({ exporter: new
   OTLPMetricExporter({ url: \`${otlpEndpoint}/v1/metrics\` }) , exportIntervalMillis: 10_000 })]`
   e `logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url:
   \`${otlpEndpoint}/v1/logs\` }) })]`, com `otlpEndpoint` vindo de `OTEL_EXPORTER_OTLP_ENDPOINT`
   (default `http://localhost:4318`). Confere com o que o Agente 04 descreveu.

2. **`infrastructure/observability/otel-collector.yml` já aceitava metric/log antes desta
   remediação — não precisou de alteração.** O `receivers.otlp` expõe grpc (4317) e http (4318);
   `service.pipelines` já tinha `metrics: {receivers:[otlp], exporters:[prometheus]}` (porta 9464)
   e `logs: {receivers:[otlp], exporters:[otlphttp/loki]}`, além de `traces`. Ou seja, o lado do
   collector nunca foi o gargalo — ele já esperava os dois sinais.

3. **`docker-compose.opensource.yml` liga o endpoint correto.** `app.environment.
   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` bate exatamente com o host/porta http
   do `otel-collector` no mesmo compose. `prometheus.yml` já tinha o job
   `otel-collector-app-metrics` apontando para `otel-collector:9464` (o exporter Prometheus do
   collector) e `loki.yml`/`grafana-datasources.yml` já existiam sem alteração necessária.

4. **`docker compose config --quiet` (com os dois arquivos de compose e segredos-placeholder só
   para satisfazer a interpolação de variável) retornou exit code 0** — nenhum erro de sintaxe ou
   de referência quebrada entre os serviços `app`/`otel-collector`/`prometheus`/`loki`/`tempo`/
   `grafana` no compose atualizado (que já inclui o agendador de retenção do Agente 10 e a
   remediação OTel do Agente 04 mergeados via `integracao/onda-4`).

5. **Gate obrigatório (`AGENTS.md` §17) executado e verde nesta branch**:
   - `npm run typecheck` → sem erros.
   - `npm run lint` → 0 erros, 79 warnings pré-existentes (`no-explicit-any` em testes/arquivos
     fora do meu domínio, não introduzidos por esta mudança).
   - `npm run build` → build de frontend (Vite) e servidor (`dist/server.cjs`) concluído com
     sucesso.
   - `npm run test` → 300 passed, 1 skipped (50 arquivos de teste), 0 falhas.

### O que NÃO foi possível confirmar aqui (limitação de ambiente, `AGENTS.md` §17/§14)

Não consegui validar de ponta a ponta contra o `otel-collector`/Prometheus/Loki **reais** rodando
via `docker-compose.opensource.yml`, nem uma alternativa isolada (só o container do otel-collector
sem o restante da stack), porque **este ambiente bloqueia por política de rede/egress todo pull de
imagem de container e todo download de binário de release**, não só Docker Hub:

- `docker pull otel/opentelemetry-collector-contrib:0.136.0` → `403 Forbidden` (CloudFront do
  Docker Hub, `production.cloudfront.docker.com`).
- `docker pull quay.io/keycloak/keycloak:26.3.3` → `403 Forbidden` (registry quay.io).
- `curl https://github.com/...` (para tentar baixar o binário `otelcol-contrib` standalone e testar
  sem Docker) → `403 Forbidden`.
- `curl "$HTTPS_PROXY/__agentproxy/status"` confirma: `recentRelayFailures` mostra
  `"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial or upstream
  failure)","host":"production.cloudfront.docker.com:443"` — é negação de política do proxy da
  organização, não erro transitório de rede, então (conforme `/root/.ccr/README.md`) não deve ser
  contornado nem repetido.
- O daemon Docker em si sobe neste ambiente (`dockerd` funcional, `docker ps` responde), então a
  limitação é exclusivamente de acesso a registries/CDNs externos para baixar as imagens, não do
  runtime de containers.

Ou seja: não há como, neste ambiente, subir `otel-collector`, `prometheus`, `loki`, `tempo` ou
`grafana` (todas as imagens vêm de `docker.io`/`quay.io`) para gerar tráfego real e observar
`engine_latency_ms_bucket` em `http://localhost:9090/graph` ou log records no Loki. Isso é uma
limitação de ambiente, não uma falha de configuração — a configuração (compose + otel-collector.yml
+ prometheus.yml) foi revisada estaticamente e está coerente.

### O que mudou em `infrastructure/observability/dashboards/otel-pipeline-health.json`

Os dois painéis "pending instrumentation" descreviam uma lacuna do lado da aplicação que não existe
mais desde o commit do Agente 04. Deixá-los como estavam seria enganoso na direção oposta (parecendo
que a app ainda não exporta métricas/logs). Marcá-los como "ativo"/dado real sem prova seria
fabricar estado, proibido por `AGENTS.md` §14. Por isso:

- Título/descrição do dashboard (nível raiz) e das duas rows (`id 300`, `id 400`) e dos dois painéis
  de conteúdo (`id 7`, `id 8`) foram reescritos para dizer precisamente: **instrumentado no código
  e no pipeline do collector, dado ao vivo ainda não confirmado neste ambiente** — com o motivo
  exato (bloqueio de egress a registries de imagem) e apontando para este handoff.
- Nenhuma query PromQL/LogQL dos painéis foi alterada — continuam corretas e vão automaticamente
  começar a mostrar dado real assim que alguém rodar a stack num ambiente com acesso a
  Docker Hub/quay.io e tráfego real passar pela app.
- `version` do dashboard incrementado de 1 → 2.

### Próximo passo (para quem tiver Docker/rede liberados)

`docker compose -f docker-compose.yml -f docker-compose.opensource.yml up -d`, gerar tráfego real
(chamada de voz ou o smoke test do handoff `10-para-04-otel-metrics-logs-nao-exportados.md`
resolvido pelo Agente 04) e confirmar em `http://localhost:9090/graph` (`engine_latency_ms_bucket`)
e no Loki/Grafana (datasource `loki`, label `exporter="OTLP"`) que os dados chegam — depois trocar
as descrições dos dois painéis de "live data not yet confirmed" para "confirmado, dado real" com a
evidência daquele ambiente.
