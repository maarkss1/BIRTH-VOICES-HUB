- De: Agente 00 (Coordenador)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 6
- Status: resolvido
- Prioridade: normal

## Contexto

`.agents/handoffs/onda-4/04-para-02-telemetria-custo-ia-disponivel.md` (Agente 04, Status:
resolvido do lado dele): o backend de telemetria de custo/tokens/latência de IA já está pronto e
persistindo dados reais desde a Onda 4 — só falta o frontend consumir. Leia esse handoff inteiro
antes de começar; ele já documenta exatamente onde o dado mora e como consultá-lo.

## Tarefa

Em `pages/Dashboard/Overview.tsx` (seu domínio):

- Troque o `Alert` "telemetria ainda não instrumentada" por cards reais de custo/tokens/latência de
  IA, consumindo `GET /api/metrics` (já existente, `requireTenant`).
- Agregue no frontend: soma de `ai_call_cost_usd`, soma de `ai_call_tokens`, média/percentil de
  `ai_call_latency_ms` (filtre a lista pelo campo `name` de cada `Metric`).
- Mesmos estados de loading/erro/vazio já padronizados nesta onda (ver outros cards do mesmo
  arquivo para o padrão) — vazio genuíno até a primeira chamada de IA acontecer para aquele tenant
  ("ainda sem chamadas", não "pipeline inexistente" — a distinção importa, o pipeline já existe).
- **CSAT e SLA continuam sem fonte de dado real** — mantenha o estado vazio/honesto para esses dois.
  Não implemente CSAT/SLA nesta tarefa: não há decisão de produto sobre a fonte de dado ainda (ver
  nota do Coordenador ao usuário sobre isso — decisão pendente, fora do escopo desta onda).

## Teste esperado

- Com métricas `ai_call_*` reais no tenant: cards mostram os valores agregados corretos.
- Sem nenhuma métrica ainda: estado vazio honesto, nunca um número fabricado (`AGENTS.md` §14).
- Métricas de outro tenant nunca aparecem (isolamento tenant já garantido pelo endpoint — só
  verifique que o frontend não mistura dados de duas chamadas/contextos).

## Validação obrigatória antes de eu integrar

`npm run typecheck && npm run lint && npx vitest run && npm run build` — todos limpos.

## Resolução

Em `pages/Dashboard/Overview.tsx`: o Alert "telemetria de IA ainda não instrumentada" foi
substituído por quatro cards reais (`Custo de IA (total)`, `Tokens consumidos`, `Latência média de
IA`, `CSAT`). O fetch de `GET /api/metrics` (antes usado só para SLA) passou a ser único e
compartilhado — `fetchMetrics`/`metricsState` guardam todas as linhas retornadas pelo endpoint e
tanto o card de SLA quanto os três novos cards de IA filtram por `name` sobre o mesmo array, em vez
de dois fetches redundantes ao mesmo endpoint.

Agregação implementada (client-side, sobre a lista já tenant-scoped devolvida pelo backend):
- `Custo de IA (total)`: soma de todas as linhas `ai_call_cost_usd`.
- `Tokens consumidos`: soma de todas as linhas `ai_call_tokens`.
- `Latência média de IA`: média aritmética de todas as linhas `ai_call_latency_ms`.
- Contagem de chamadas usada nas legendas = nº de amostras de latência (uma por chamada
  bem-sucedida, conforme contrato do handoff do Agente 04).

Estado vazio genuíno: com `metricsState.status === 'ready'` e nenhuma linha `ai_call_*`, os três
cards mostram `—` com a legenda "Ainda sem chamadas de IA para esta organização" (nunca um número
fabricado). Loading/erro reaproveitam o mesmo `FetchStatus` já padronizado no arquivo (skeleton /
"Erro" com retry implícito no reload da página, mesmo padrão dos outros `RealStatCard`).

CSAT: nenhuma implementação de dado real foi feita (fora de escopo desta onda, sem decisão de
produto sobre a fonte). Mantive um card `CSAT` explícito, sempre em estado vazio (`—`, "Sem fonte
de dado definida"), com tooltip explicando o motivo — em vez de simplesmente remover a menção a
CSAT da tela, que deixaria a ausência implícita. SLA (disponibilidade) não foi alterado
funcionalmente, apenas migrado para consumir o novo estado `metricsState` compartilhado.

Isolamento de tenant: nenhuma mudança no backend; o frontend apenas agrega o array já retornado
por `GET /api/metrics` (`requireTenant`) para o tenant autenticado — não há merge com nenhuma outra
fonte nem cache entre navegações (o estado é resetado a cada mount do componente).

Testes: `pages/Dashboard/Overview.telemetria-ia.test.tsx` (co-localizado, não `__tests__/**`) cobre
(1) agregação correta com métricas reais, (2) estado vazio honesto quando não há `ai_call_*` ainda
(incluindo o card de CSAT) e ausência do Alert antigo, e (3) que um remount com resposta diferente
do endpoint (simulando troca de tenant/sessão) nunca reaproveita valores agregados do mount
anterior.

Validação executada nesta ordem, todas limpas: `npm run typecheck`, `npm run lint` (0 erros; only
os warnings `no-explicit-any` pré-existentes em outros arquivos, listados em
`TECHNICAL-DEBT-CHECKLIST.html`), `npx vitest run` (568 passed, 1 skip pré-existente), `npm run
build`.

Arquivos alterados: `pages/Dashboard/Overview.tsx` (meu domínio exclusivo);
`pages/Dashboard/Overview.telemetria-ia.test.tsx` (novo). Nenhum arquivo fora da minha propriedade
foi tocado.
