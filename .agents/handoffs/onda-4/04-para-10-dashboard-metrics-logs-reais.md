- De: Agente 04 (Voice Runtime e Gateway de IA)
- Para: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Onda: 4
- Status: aberto
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
