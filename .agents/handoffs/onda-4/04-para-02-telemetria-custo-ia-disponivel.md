- De: Agente 04 (Voice Runtime e Gateway de IA)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 4
- Status: resolvido
- Prioridade: normal

## Problema

`.agents/handoffs/onda-2/02-para-04-10-telemetria-overview.md`: `Overview.tsx` mostra um `Alert`
honesto no lugar de custo/tokens/latência de IA porque não existia pipeline real alimentando essas
métricas — `Metric` (Prisma) só recebia o evento `user_login`.

## Correção aplicada nesta remediação

`lib/voice-runtime/providers/LLMGateway.ts` (`processRequest`) agora persiste, no `Metric`
(Prisma, durável — não o `otelCollector` em memória/capado em 1000 registros), um evento real por
**chamada que efetivamente atingiu um provedor de IA com sucesso** (nunca para chamada bloqueada
por falta de consentimento, nunca para uma tentativa em que todos os provedores falharam — nesses
casos não há uso/custo real reportado pelo provedor para registrar, e `AGENTS.md` §14 proíbe
fabricar o número):

- `ai_call_cost_usd` — custo estimado em USD (mesma fórmula de pricing já usada no gateway).
- `ai_call_tokens` — tokens totais reportados pela resposta real do provedor (não a estimativa
  pré-chamada).
- `ai_call_latency_ms` — latência real do `processRequest` completo (até a resposta do provedor).

Cada linha carrega `tags: { provider, fromFallback }` e é escrita como evento **tenant-wide**
(`userId: null`, ver `src/repositories/metricRepository.ts`) — uma chamada de IA não é uma ação de
um usuário interativo específico, é atribuída ao tenant/sessão de chamada. A gravação é
fire-and-forget com `catch` (nunca derruba a chamada de voz/texto real por falha de escrita de
métrica) e é pulada para o tenant sentinela `system` (`SYSTEM_TENANT_ID`), que não tem linha na
tabela `Tenant` e violaria a FK.

Para que essas métricas tenant-wide apareçam para qualquer usuário do tenant (não só para quem as
gerou), estendi `metricRepository.listMetricsForUser`/`metricService.createMetric` (que já eram
genéricos e não exclusivos de outro agente — ver `AGENTS.md` §11 e
`.agents/prompts/04-voice-runtime-ia.md`, que já lista `metricRepository.ts`/`metrics.controller.ts`
no meu escopo) para aceitar `userId: string | null` e, na listagem, mesclar os eventos
`userId: null` do tenant com os do usuário autenticado (duas queries simples mescladas em código —
evitei `OR` no `where` porque o dublê de Prisma em `vitest.setup.ts`, exclusivo do Agente 08, não
entende esse operador). **Nenhuma mudança de schema/migração** — `Metric.name` já é `String` livre,
sem enum, então não precisei de handoff para o Agente 01.

Não implementei CSAT/SLA — sem fonte de dado real hoje (fora do meu domínio, ver seção "Contexto
adicional").

## Onde o dado fica persistido/consultável

- Tabela `Metric` (Postgres via Prisma), linhas com `name` em
  `ai_call_cost_usd | ai_call_tokens | ai_call_latency_ms`, `tenantId` real, `userId: null`,
  `tags: { provider, fromFallback }`, `timestamp` real da chamada.
- Endpoint já existente `GET /api/metrics` (`requireTenant`, `src/routes/metrics.routes.ts` →
  `metrics.controller.ts` → `metricService.listMetrics(tenantId, userId)`) agora retorna, para
  qualquer usuário autenticado do tenant, tanto os próprios eventos quanto os tenant-wide
  (`ai_call_*`), ordenados por `timestamp desc`, até 1000 registros. Nenhum endpoint novo foi
  criado.
- Cada resposta de `LLMGateway.processRequest` (`GatewayResponse`) já expõe
  `tokensUsed`/`costUSD`/`latencyMs`/`providerUsed`/`fromFallback` por chamada individual, caso
  prefiram agregar no backend em vez de reprocessar a lista bruta do `Metric` no frontend.

## Arquivo(s) envolvido(s)

- `lib/voice-runtime/providers/LLMGateway.ts` (meu, exclusivo — `AGENTS.md` §11)
- `src/repositories/metricRepository.ts`, `src/services/metricService.ts` (não exclusivos; listados
  no meu escopo em `.agents/prompts/04-voice-runtime-ia.md`)
- `__tests__/metricRepository.test.ts`, `__tests__/llmGatewayFailover.test.ts` (testes cobrindo o
  novo comportamento)

## Alteração necessária (sua parte)

Trocar o `Alert` "telemetria ainda não instrumentada" em `pages/Dashboard/Overview.tsx` por cards
reais de custo/tokens/latência de IA, consumindo `GET /api/metrics` e agregando (soma de
`ai_call_cost_usd`/`ai_call_tokens`, média/percentil de `ai_call_latency_ms`) com os mesmos estados
de loading/erro/vazio já padronizados nesta onda — vazio genuíno até a primeira chamada de IA
acontecer para aquele tenant (não é mais "pipeline inexistente", é "ainda sem chamadas"). CSAT e
SLA continuam sem fonte real — mantenha o estado vazio/honesto para esses dois enquanto não houver
handoff resolvendo a fonte de dado deles.

## Teste esperado

1. Com `GEMINI_API_KEY`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY` configuradas e consentimento de IA
   concedido para um tenant, disparar uma chamada real via `llmProviderGateway.processRequest(...)`
   (ou o fluxo de voz/chat que a invoca) e confirmar 3 novas linhas em `Metric` para aquele
   `tenantId` (`ai_call_cost_usd`, `ai_call_tokens`, `ai_call_latency_ms`).
2. `GET /api/metrics` autenticado nesse tenant deve incluir essas 3 linhas mesmo para um usuário
   diferente de quem originou a chamada (evento tenant-wide).
3. Nenhuma linha é criada quando a chamada é bloqueada por falta de consentimento ou quando todos
   os provedores falham (ver `__tests__/llmGatewayFailover.test.ts`).

## Contexto adicional

CSAT (satisfação do cliente) e SLA (disponibilidade) não têm fonte de dado real hoje em nenhum
domínio que eu tenha visibilidade — CSAT normalmente viria de uma pesquisa pós-atendimento (produto,
não Voice Runtime) e SLA de uptime/infra (Agente 10). Não abri handoff formal para isso agora
porque não haveria dono claro para "criar a fonte" sem uma decisão de produto primeiro (que
mecanismo de coleta de CSAT? survey pós-chamada? Onde armazenar?) — sinalizando aqui para o
Coordenador/roadmap decidir se isso vira uma missão nova, em vez de inventar uma fonte de dado. Ver
também `.agents/handoffs/onda-4/04-para-10-dashboard-metrics-logs-reais.md` (métricas/logs OTLP,
onda anterior) e `.agents/handoffs/onda-1/01-para-04-observability-cross-tenant-leak.md` (isolamento
tenant do `otelCollector`, não afetado por esta mudança — ela é só sobre a tabela `Metric`).

