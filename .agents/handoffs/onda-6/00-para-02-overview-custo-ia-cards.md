- De: Agente 00 (Coordenador)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 6
- Status: aberto
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
