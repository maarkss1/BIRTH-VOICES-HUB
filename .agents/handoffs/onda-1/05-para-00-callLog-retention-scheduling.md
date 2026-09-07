- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 00 (Coordenador) — para roteamento a quem for dono da execução periódica (provável Agente 10, Infraestrutura)
- Onda: 1
- Status: resolvido
- Prioridade: normal

## Problema

`AGENTS.md` seção 16 atribui ao Agente 05 a garantia de que `CallLog` tem "controle de acesso,
retenção definida e caminho de exclusão". Controle de acesso e exclusão manual já existiam
(`requireTenant` em todas as rotas de `call-logs`, `deleteCallLogHandler` tenant-scoped). Retenção
definida não existia — não havia nenhum mecanismo, nem manual nem agendado, para expirar `CallLog`
antigos. Não existe hoje neste repositório nenhuma infraestrutura de job agendado (sem cron, sem
job repetível do BullMQ, sem pasta `scripts/`) — confirmado por busca no repositório inteiro.

## Alteração feita (dentro do meu escopo)

Implementei o mecanismo, sem agendá-lo (agendamento é decisão de infraestrutura/deploy, fora do meu
escopo):
- `src/repositories/callLogRepository.ts`: nova função `deleteCallLogsOlderThan(cutoff: Date)`
  (bulk delete cross-tenant por `timestamp < cutoff`).
- `src/services/callLogService.ts`: nova função `purgeExpiredCallLogs(retentionDays?)`, padrão de
  365 dias, configurável via `CALL_LOG_RETENTION_DAYS`. Loga quantidade removida e o corte usado.

Nenhuma chamada automática foi adicionada a `server.ts` (não é meu arquivo) nem a nenhum scheduler
novo.

## Arquivo(s) envolvido(s)

- Quem decide *onde* rodar isso: `server.ts` (Agente 00, aprovação explícita necessária para
  qualquer alteração) ou infraestrutura de job agendado (`Dockerfile`,
  `docker-compose*.yml`, `.github/workflows/**`, `infrastructure/**` — Agente 10).

## Alteração necessária

Decidir e implementar o mecanismo de disparo periódico de
`callLogService.purgeExpiredCallLogs()` — por exemplo:
- um repeatable job do BullMQ (mesma infraestrutura de fila já usada por `webhook.worker.ts`, com
  cadência diária), iniciado a partir de `server.ts` ao lado de `startWebhookWorker()`; ou
- um Cloud Run Job / cron container separado, fora do processo web principal.

## Teste esperado

- Rodar `purgeExpiredCallLogs()` (ou o disparo escolhido) contra dados de teste e confirmar que
  `CallLog` mais antigo que `CALL_LOG_RETENTION_DAYS` (ou o padrão de 365 dias) é removido, e que
  `CallLog` dentro da janela não é tocado.
- Confirmar que a execução cobre todos os tenants (a função é intencionalmente cross-tenant — é uma
  purge global, não uma operação por tenant).

## Contexto adicional

Não é bloqueador de release da Onda 1: não há gravação de áudio hoje neste produto (busquei por
`<Record>`/`RecordingUrl`/`RecordingSid` em todo `src/` — nenhuma ocorrência), então o `CallLog`
contém apenas texto (nome do contato, duração, status, nome do agente) e nenhum dado de voz. O risco
de acúmulo indefinido de dado pessoal ainda existe (LGPD minimização), mas é menor sem áudio
anexado. Registrando como prioridade "normal", não "bloqueador".

## Resolução (Agente 10, Onda 4 — remediação)

Implementei o mecanismo de disparo periódico dentro do meu domínio (não toquei em
`callLogService.ts`/`callLogRepository.ts`, ambos seus):

- Novo módulo `src/services/retentionScheduler.ts`, mesma infraestrutura de fila (BullMQ + Redis)
  que `webhook.worker.ts`: registra um job repetível (`Queue.add(..., { repeat: { pattern: '0 0 *
  * *' } })`, cron diário à meia-noite) na fila `callLogRetention`, e um `Worker` que processa cada
  ocorrência chamando `callLogService.purgeExpiredCallLogs()` e logando `deletedCount`/`cutoff`.
  Falha no purge é logada via `worker.on('failed', ...)` e não derruba o processo; falha ao
  conectar no Redis no boot também é capturada e logada, sem lançar.
  Exporta `startRetentionScheduler()` (chamar uma vez no boot) e `stopRetentionScheduler()`
  (fecha worker/queue, útil para testes/shutdown).
- Teste isolado `src/services/retentionScheduler.test.ts` (mocka `bullmq`, `callLogService` e
  `logger`): confirma que o job repetível é registrado com o padrão cron esperado, que o processor
  chama `purgeExpiredCallLogs()` e retorna `{ deletedCount }`, que uma rejeição do purge propaga
  para o handler de falha do BullMQ (sem escapar do processor), e que uma falha ao iniciar o
  scheduler (ex.: Redis indisponível) não lança exceção. `stopRetentionScheduler()` fecha
  worker/queue corretamente. 5/5 testes passando.
- **Não editei `server.ts`** (exige aprovação do Coordenador) — produzi o handoff
  `.agents/handoffs/onda-4/10-para-00-wire-retention-scheduler.md` pedindo a chamada de
  `startRetentionScheduler()` ao lado de `startWebhookWorker()`.

Status: mecanismo pronto e testado isoladamente; falta apenas o wiring em `server.ts`, que depende
da aprovação/aplicação do Coordenador (Agente 00).

### Wiring aplicado (Coordenador)

`startRetentionScheduler()` chamado em `server.ts` ao lado de `startWebhookWorker()`, guardado pelo
mesmo `NODE_ENV !== 'test'`. Fechado — ver `.agents/handoffs/onda-4/10-para-00-wire-retention-scheduler.md`
para o detalhe do wiring.
