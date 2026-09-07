- De: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema

`.agents/handoffs/onda-2/02-para-04-10-telemetria-overview.md`: "Disponibilidade (SLA): 99.98%" em
`Overview.tsx` era fabricado. Hoje a tela mostra um `Alert` "Telemetria de IA e voz ainda não
instrumentada" cobrindo tokens/custo/latência/SLA/CSAT juntos. A parte de custo/tokens/latência já
foi resolvida pelo Agente 04
(`.agents/handoffs/onda-4/04-para-02-telemetria-custo-ia-disponivel.md`). Esta é a parte de
**SLA/disponibilidade** — a fatia que me cabia.

## O que existe agora (dado real, não fabricado)

SLA aqui é uma propriedade da **plataforma**, não de um tenant individual — todos os tenants rodam
sobre a mesma infraestrutura de Postgres/Redis/app. `src/services/slaScheduler.ts` (novo) amostra a
cada 5 minutos o mesmo check real de `GET /api/ready` (`checkPlatformHealth`, extraído de
`src/controllers/health.controller.ts` — Postgres via `SELECT 1`, Redis via `PING`, nunca um valor
fabricado) e persiste o resultado como uma linha `Metric` por tenant ativo:

```
name: "platform_ready_check"
value: 1   // plataforma pronta (Postgres + Redis ok) neste tick
value: 0   // não pronta (pelo menos um check falhou)
userId: null            // evento tenant-wide, mesma convenção do Agente 04 para ai_call_*
tags: { database: "ok" | "error", redis: "ok" | "error", checkedAt: "<ISO timestamp>" }
timestamp: <hora real do check>
```

**Por que uma linha por tenant em vez de uma linha única "de plataforma":**
`Metric.tenantId` (prisma/schema.prisma) é uma FK obrigatória para `Tenant` — não existe uma linha
de tenant "sistema/plataforma" na tabela `Tenant` (é o mesmo motivo pelo qual o
`lib/voice-runtime/providers/LLMGateway.ts` do Agente 04 pula a gravação de métrica para
`SYSTEM_TENANT_ID`: violaria a FK). Como alterar o schema está fora do meu escopo para esta missão
pontual (propriedade exclusiva do Agente 01) e pediria uma decisão de produto maior, optei pelo
fan-out: a mesma amostra real é gravada uma vez por tenant ativo, cada um recebendo exatamente o
mesmo valor honesto (porque é a mesma infraestrutura compartilhada). `GET /api/metrics`, já
tenant-scoped e usado pelo Agente 04 para custo/tokens/latência, retorna isso automaticamente —
**nenhum endpoint novo foi criado.**

## Como consumir em `Overview.tsx`

1. No mesmo fetch/estado que já existe para os cards de custo/tokens/latência do Agente 04 (`GET
   /api/metrics`), filtre `metrics.filter(m => m.name === 'platform_ready_check')`.
2. Uptime/SLA da janela é: `(quantidade com value === 1) / (quantidade total)` dos eventos
   retornados, ordenados por `timestamp desc`. Hoje o endpoint retorna até 1000 eventos mesclando
   `platform_ready_check` com os demais nomes tenant-wide (`ai_call_*`) — para uma janela mais
   limpa/específica, filtre também por `tags.checkedAt`/`timestamp` dentro do intervalo desejado
   (ex.: últimas 24h) antes de calcular a razão.
3. Estado real, não fabricado: se `metrics.filter(...).length === 0` (scheduler acabou de subir,
   ainda não rodou um tick, ou o tenant é novo), mostre vazio/"ainda sem amostras suficientes" — não
   um placeholder numérico. A partir da primeira amostra (até 5 minutos após o deploy do scheduler,
   ver `.agents/handoffs/onda-4/10-para-00-wire-sla-scheduler.md`, pendente de wiring pelo
   Coordenador em `server.ts`), o card já tem dado real para mostrar.
4. Cada evento também carrega `tags.database`/`tags.redis` individualmente — dá para mostrar não só
   o percentual agregado, mas também "qual componente causou a última indisponibilidade" se quiser
   ir além do número único.

## Limitação documentada (honesta, não bloqueadora)

- Isto é uma amostragem periódica (a cada 5 minutos), não uma medição contínua — uma indisponibilidade
  mais curta que o intervalo entre dois ticks pode não aparecer em nenhuma amostra. Um SLA calculado
  a partir disso é uma aproximação real (nunca fabricada), não uma medição de uptime de precisão de
  segundo. Documente isso perto do card se quiser transparência total com o usuário final (ex.: um
  tooltip "amostrado a cada 5 minutos").
- O scheduler ainda depende de wiring em `server.ts`, que só o Agente 00/Coordenador pode aplicar —
  ver `.agents/handoffs/onda-4/10-para-00-wire-sla-scheduler.md`. Até esse wiring entrar, não há
  amostra nenhuma sendo produzida (o código existe e está testado, mas não roda em produção ainda).
  Trate isso da mesma forma que "ainda sem chamadas de IA" no card de custo do Agente 04: vazio
  honesto, nunca um número de exemplo.
- **CSAT continua sem fonte real e sem dono** — não faz parte desta entrega (é dado de
  produto/pesquisa pós-atendimento, fora do domínio de Infraestrutura). Mantenha o estado
  vazio/honesto para CSAT especificamente até que exista uma decisão de produto sobre como
  coletá-lo.

## Arquivo(s) envolvido(s)

- `pages/Dashboard/Overview.tsx` (seu — não editei)
- `src/services/slaScheduler.ts`, `src/controllers/health.controller.ts`,
  `src/repositories/tenantRepository.ts` (meus, já implementados e testados)

## Teste esperado

1. Com o scheduler ativo (após o wiring do Coordenador) e Postgres/Redis saudáveis, confirmar que
   `GET /api/metrics` autenticado passa a incluir linhas `platform_ready_check` com `value: 1` a
   cada ~5 minutos.
2. Derrubar Redis ou Postgres momentaneamente (ambiente de teste manual) e confirmar que a próxima
   amostra grava `value: 0` com `tags` indicando qual componente falhou — nunca um número fixo de
   "SLA 99.98%" independente do estado real.
3. Overview.tsx calculando o percentual a partir desses eventos reais, com estado vazio explícito
   antes da primeira amostra existir para aquele tenant.

## Contexto adicional

Mesmo padrão de entrega do Agente 04 para custo/tokens/latência de IA — ver
`.agents/handoffs/onda-4/04-para-02-telemetria-custo-ia-disponivel.md` para o precedente de como
ele documentou a leitura de `GET /api/metrics` no lado do frontend.
