- De: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Para: Agente 00 (Coordenador) — `server.ts` é de aprovação exclusiva do Coordenador
- Onda: 4
- Status: resolvido
- Prioridade: bloqueador

## Problema

Auditando o bloco Socket.io de `server.ts` para a missão do LiveSupervisor, encontrei dois
problemas reais, independentes do modo demo (`demoTelemetryEnabled`, que já é corretamente
gated por `NODE_ENV !== 'production' && ENABLE_DEMO_TELEMETRY === 'true'` — isso não é o achado):

1. **`intervene_call` sem checagem de role**: qualquer socket autenticado (qualquer usuário, de
   qualquer tenant) podia disparar uma intervenção — só havia verificação de JWT válido no
   middleware `io.use`, nenhuma de `role`.
2. **`io.emit("intervention_triggered", ...)` era um broadcast global**: o evento ia para *todo*
   socket conectado ao servidor, de qualquer tenant, não só para quem observava aquela sessão.
   Isso é vazamento cross-tenant real (bloqueador `AGENTS.md` §9 item 2) e RBAC quebrado
   (item 1) — ambos ativos em produção, não atrás do flag de demo.

Não havia handler de `watch_session` no servidor (o cliente já emitia, mas era no-op) e nenhuma
noção de sala/room por sessão ou tenant — a única coisa impedindo o vazamento na prática era o
volume baixo de usuários simultâneos, não uma barreira real.

## Arquivo(s) envolvido(s)
- `server.ts` (bloco Socket.io, linhas ~181-260) — fora da minha propriedade exclusiva
  (`AGENTS.md` §11: qualquer mudança no bloco Socket.io exige aprovação do Agente 00), por isso
  não editei diretamente e abri este handoff em vez disso.
- `components/LiveSupervisor/LiveSupervisor.tsx` (meu) já enviava `watch_session`/`intervene_call`
  no formato certo, então a correção do lado do servidor não exigiu mudança de contrato.

## Alteração necessária
- Adicionar `socket.on("watch_session", ...)` que dá `socket.join()` em uma sala
  `watch:<tenantId>:<sessionId>`.
- Checar `socket.data.user.role` (mesmo proxy conservador `admin` usado no cliente, ver handoff
  `11-para-01-supervisor-role-rbac.md`) antes de aceitar `intervene_call`; rejeitar com um evento
  de erro explícito em vez de silenciosamente ignorar.
- Trocar `io.emit` por `io.to(room).emit` no `intervention_triggered`.

## Teste esperado
Dois sockets autenticados como tenants/sessões diferentes; intervenção disparada por um não deve
chegar ao outro. Socket autenticado sem role `admin` disparando `intervene_call` deve receber
`intervention_error`, não `intervention_triggered`.

## Contexto adicional
Achado durante a missão de Onda 4 do Agente 11, antes de qualquer commit — nunca chegou a `main`.

## Resolução

Corrigido pelo Coordenador diretamente em `server.ts` (aprovação exclusiva do bloco Socket.io,
`AGENTS.md` §11), na mesma revisão que integrou o trabalho do Agente 11: `watch_session` agora
dá `join` em `watch:<tenantId>:<sessionId>`; `intervene_call` checa
`ROLES_ALLOWED_TO_INTERVENE.includes(role)` e emite `intervention_error` quando nega; o broadcast
de intervenção usa `io.to(room).emit(...)`, nunca mais `io.emit` global. `LiveSupervisor.tsx`
ganhou um listener de `intervention_error` correspondente, revertendo o estado otimista quando o
servidor rejeita. Testado manualmente lendo o fluxo completo cliente↔servidor; suíte de testes do
componente (`LiveSupervisor.test.tsx`, do Agente 11) e gate de typecheck/lint/build permanecem
verdes após a mudança.
