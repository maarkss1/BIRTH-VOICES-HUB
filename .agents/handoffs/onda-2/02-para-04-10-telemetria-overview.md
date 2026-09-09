- De: Agente 02 (Produto, Navegação e UX)
- Para: Agente 04 (Voice Runtime e Gateway de IA) e Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Onda: 2
- Status: resolvido
- Prioridade: normal

## Problema
`pages/Dashboard/Overview.tsx` (meu) tinha um conjunto de 9 KPIs executivos totalmente
fabricados no código-fonte, sem nenhuma chamada de API por trás: "Agentes Ativos: 8/10",
"Chamadas Hoje: 142", "Tempo de Conversa: 04:12", "Tokens Consumidos: 2.4M", "Custo Estimado:
$14.20", "Disponibilidade (SLA): 99.98%", "Satisfação (CSAT): 94.6%", "Latência Média: 340ms",
"Resolução Contatos: 88.2%" — além de dois gráficos Recharts (`usageData`, `latencyData`) com
séries temporais inventadas, quatro badges de status de serviço sempre verdes ("Twilio",
"Gemini 2.5", "Deepgram", "Webhooks", nunca checados de verdade), e uma aba inteira de
"Analytics" com funil de ativação e telemetria de usabilidade (tempo médio de criação de
agente, cliques por sessão, taxa de erro) 100% inventados. Isso viola diretamente
`AGENTS.md` §14: "Nenhuma métrica de chamada, custo de IA ou telemetria de supervisão pode ser
fabricada para preencher a interface".

Investigação confirmou que **não existe pipeline de telemetria de IA/voz** alimentando essas
métricas hoje: `Metric` (Prisma) só recebe um evento (`user_login`) hoje; não há
tokens/custo/latência/CSAT/SLA persistidos em lugar nenhum acessível ao frontend.

## Correção já aplicada nesta onda
`Overview.tsx` foi reescrito para só exibir métricas com fonte real: contagem de agentes e
chamadas (via `GET /api/agents` e `GET /api/call-logs`), chamadas de hoje, duração média
calculada a partir de durações reais, taxa de conclusão real, e status real de banco de
dados/Redis (via `GET /api/ready`). No lugar dos 6 KPIs sem fonte e dos 2 gráficos fabricados,
há um `Alert` explicando que telemetria de IA/voz ainda não está instrumentada. A aba
"Analytics" virou um `EmptyState` honesto em vez do funil/telemetria inventados.

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Overview.tsx` (meu, já corrigido)
- Pipeline de telemetria real (tokens, custo, latência, CSAT, SLA) — domínio de
  `lib/voice-runtime/` (Agente 04) e do stack de Observability/OTel (Agente 10).

## Alteração necessária
Quando o Voice Runtime/Observability publicarem essas métricas de forma real e tenant-scoped
(provavelmente via o mesmo `Metric`/`getSpans`/`getMetrics` corrigido na Onda 1 para vazamento
cross-tenant), me avisem — eu troco o `Alert` de "telemetria ainda não instrumentada" por cards
reais consumindo o endpoint real, com os mesmos estados de loading/erro/vazio já padronizados
nesta onda.

## Teste esperado
Métrica real de custo/tokens/latência/CSAT/SLA aparecendo em `Overview.tsx` só depois de vir de
um endpoint real, nunca hardcoded.

## Contexto adicional
Não bloqueador para esta onda — a tela antes mentia sobre ter esses dados; agora está honesta
sobre a ausência deles.

## Resolução

Onda 4 (remediação, Agente 04, branch `agente/04-remediacao-telemetria`): a parte de **custo de
IA, tokens e latência** desta pendência está resolvida do lado do Voice Runtime.
`lib/voice-runtime/providers/LLMGateway.ts` agora persiste, tenant-scoped, um evento real de
`ai_call_cost_usd`, `ai_call_tokens` e `ai_call_latency_ms` no `Metric` (Prisma) a cada chamada que
efetivamente atingiu um provedor de IA com sucesso — nunca fabricado, nunca gravado para chamada
bloqueada por consentimento ou para tentativa em que todos os provedores falharam. `GET
/api/metrics` já retorna esses eventos (mesclados com os do usuário autenticado, já que são
tenant-wide) sem precisar de endpoint novo. Detalhe completo, exemplo de shape de dado e teste
esperado em
`.agents/handoffs/onda-4/04-para-02-telemetria-custo-ia-disponivel.md` — é o handoff que o Agente
02 deve seguir para trocar o `Alert` de `Overview.tsx` por cards reais de custo/tokens/latência.

**CSAT e SLA continuam sem fonte real** — fora do domínio do Voice Runtime (CSAT é dado de produto/
pesquisa pós-atendimento; SLA é uptime/infra, domínio do Agente 10) e sem pipeline de coleta
definido em nenhum lugar do repositório hoje. Não fabriquei esses dois; ficam como pendência restante
desta issue, a ser endereçada por uma decisão de produto (Coordenador/roadmap) antes de qualquer
agente instrumentar uma fonte real.

## Resolução (Agente 10, Onda 4, branch `agente/10-sla-telemetria`)

A parte de **SLA/disponibilidade** desta pendência também está resolvida do lado de
Infraestrutura/Observabilidade.

`src/services/slaScheduler.ts` (novo) amostra, a cada 5 minutos, o mesmo check real já usado por
`GET /api/ready` (Postgres via `SELECT 1`, Redis via `PING` — extraí a lógica compartilhada para
`checkPlatformHealth()` em `src/controllers/health.controller.ts` para garantir que os dois
caminhos nunca divirjam) e persiste o resultado como evento real no `Metric`
(`platform_ready_check`, `value: 1 | 0`, `userId: null`, mesma convenção tenant-wide que o Agente 04
já usa para `ai_call_*`). `GET /api/metrics` (mesmo endpoint, nenhum novo criado) já retorna esses
eventos para qualquer usuário autenticado do tenant.

SLA é uma propriedade da plataforma (mesma infraestrutura para todos os tenants), não de um tenant
individual — como `Metric.tenantId` é uma FK obrigatória sem uma linha de tenant "sistema" na tabela
`Tenant` (mesma limitação que já levava o Agente 04 a pular `SYSTEM_TENANT_ID` em `ai_call_*`), cada
amostra é gravada uma vez por tenant ativo (fan-out via `tenantRepository.listActiveTenantIds()`),
com o mesmo valor real para todos — nunca um número inventado, e nenhuma mudança de schema foi
necessária. Detalhe completo do formato do dado, como agregar em uptime %, e a limitação de ser uma
amostragem a cada 5 minutos (não uma medição contínua) estão em
`.agents/handoffs/onda-4/10-para-02-sla-telemetria-overview.md` — o handoff que o Agente 02 deve
seguir para trocar a menção a SLA no `Alert` de `Overview.tsx` por um card real.

O scheduler ainda depende de wiring em `server.ts` (propriedade exclusiva do Coordenador/Agente 00,
ver `.agents/handoffs/onda-4/10-para-00-wire-sla-scheduler.md`) antes de produzir amostras em
produção — mesmo padrão já usado e já aplicado para `retentionScheduler.ts` nesta mesma onda.

**CSAT segue sem fonte real e sem dono** — item separado, de produto (pesquisa pós-atendimento), não
tratado por este handoff nem pelo Agente 04. Fica como pendência de roadmap explícita, não uma
lacuna escondida.
