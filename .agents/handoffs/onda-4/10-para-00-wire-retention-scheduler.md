- De: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Para: Agente 00 (Coordenador) — `server.ts` exige aprovação explícita do Coordenador (AGENTS.md §11)
- Onda: 4 (remediação de achado do Agente 05, roteada pelo Coordenador)
- Status: resolvido
- Prioridade: normal

## Problema

`.agents/handoffs/onda-1/05-para-00-callLog-retention-scheduling.md`: o Agente 05 implementou
`callLogService.purgeExpiredCallLogs(retentionDays?)` (retenção LGPD, padrão 365 dias, configurável
via `CALL_LOG_RETENTION_DAYS`) e `callLogRepository.deleteCallLogsOlderThan(cutoff)`, mas nada
disparava isso periodicamente.

## Alteração feita (dentro do meu escopo)

Criei `src/services/retentionScheduler.ts` (não pertence a nenhum agente listado em AGENTS.md §11 —
módulo novo, de infraestrutura de agendamento). Segue exatamente o mesmo padrão de
`src/services/webhook.worker.ts` (BullMQ + Redis via `getRedisConnectionOptions()`):

- Exporta `startRetentionScheduler()`: registra um repeatable job (`cron: '0 0 * * *'`, diário à
  meia-noite) na fila `callLogRetention` e inicia um `Worker` que, a cada ocorrência, chama
  `callLogService.purgeExpiredCallLogs()` e loga `deletedCount`/`cutoff`. Falha de purge é
  capturada via `worker.on('failed', ...)` (loga, não derruba o processo); falha ao conectar/criar
  a fila no boot também é capturada e logada, sem lançar.
- Exporta `stopRetentionScheduler()`: fecha worker e queue (shutdown/testes).
- Teste isolado `src/services/retentionScheduler.test.ts` (mocka `bullmq`, `./callLogService.js` e
  `../lib/logger.js`) — 5/5 passando: registra o job com o padrão cron correto; o processor chama
  `purgeExpiredCallLogs()` e retorna `{ deletedCount }`; uma rejeição do purge propaga para o
  handler `failed` do BullMQ; falha ao iniciar (ex.: Redis indisponível) não lança; `stop` fecha
  worker/queue.

**Não editei `server.ts`, `callLogService.ts` nem `callLogRepository.ts`.**

## Arquivo(s) envolvido(s)

`server.ts` (seu, aprovação explícita necessária).

## Alteração necessária

Ao lado da chamada existente de `startWebhookWorker()` (hoje em `server.ts`, dentro do bloco
`if (process.env.NODE_ENV !== 'test') { ... server.listen(...) }`, por volta da linha 323-328),
adicionar:

```ts
import { startRetentionScheduler } from "./src/services/retentionScheduler.js";
// ...
if (process.env.NODE_ENV !== 'test') {
  startWebhookWorker();
  startRetentionScheduler();   // <-- adicionar esta linha
  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
}
```

Import a adicionar junto aos outros no topo do arquivo (perto de `import { startWebhookWorker }
from "./src/services/webhook.worker.js";`, linha 27):

```ts
import { startRetentionScheduler } from "./src/services/retentionScheduler.js";
```

Nenhuma outra alteração em `server.ts` é necessária — mesmo padrão de `startWebhookWorker()`
(chamada fire-and-forget no boot, guardada pelo mesmo `NODE_ENV !== 'test'`, para não abrir
conexão Redis/registrar job durante a suíte de testes).

## Teste esperado

- Após o wiring, subir o servidor localmente com Redis disponível e confirmar no log a linha
  `[RetentionScheduler] Registered daily CallLog retention purge job`.
- Opcionalmente, para validar o disparo sem esperar 24h: chamar manualmente
  `callLogService.purgeExpiredCallLogs()` (já testado pelo Agente 05) ou usar a API do BullMQ para
  disparar a próxima ocorrência do job na fila `callLogRetention` num ambiente de teste manual, e
  confirmar via log `[RetentionScheduler] Purge job completed` com o `deletedCount` esperado.
- Suíte automatizada (`npm run test`) já cobre o módulo isoladamente
  (`src/services/retentionScheduler.test.ts`) e não exige Redis real (tudo mockado).

## Validações rodadas nesta branch (antes do wiring)

- `npm run typecheck`: sem erros.
- `npm run lint`: 0 erros, 79 warnings pré-existentes (nenhum nos arquivos que criei).
- `npm run test`: 300 passed | 1 skipped (301 total) — inclui os 5 novos testes de
  `retentionScheduler.test.ts`.
- `npm run build`: sucesso (`vite build` + `esbuild server.ts`), sem erros.

## Resolução

Wiring aplicado pelo Coordenador exatamente como sugerido: import de `startRetentionScheduler` no
topo de `server.ts` (ao lado de `startWebhookWorker`) e chamada dentro do bloco
`NODE_ENV !== 'test'`, antes de `server.listen(...)`. Gate completo (typecheck/lint/test/build)
verde após a mudança. Handoff original de retenção
(`.agents/handoffs/onda-1/05-para-00-callLog-retention-scheduling.md`) pode ser fechado por quem o
revisar em seguida — o mecanismo está registrado e ativo no boot fora do ambiente de teste.
