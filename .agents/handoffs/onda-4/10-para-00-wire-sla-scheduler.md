- De: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Para: Agente 00 (Coordenador) — `server.ts` exige aprovação explícita do Coordenador (AGENTS.md §11)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema

Implementei `src/services/slaScheduler.ts`: um job periódico (BullMQ + Redis, mesmo padrão de
`src/services/retentionScheduler.ts` e `src/services/webhook.worker.ts`) que amostra a cada 5
minutos o mesmo check real usado por `GET /api/ready` (`checkPlatformHealth`, extraído de
`src/controllers/health.controller.ts`) e persiste o resultado como evento real no `Metric`
(`platform_ready_check`, `value: 1 | 0`) — ver detalhe completo em
`.agents/handoffs/onda-4/10-para-02-sla-telemetria-overview.md`. Assim como o
`retentionScheduler.ts`, este módulo não se auto-inicia: quem decide iniciar um scheduler no boot é
`server.ts`, de sua propriedade exclusiva.

## Correção feita (dentro do meu escopo)

- `src/services/slaScheduler.ts` — exporta `startSlaScheduler()`/`stopSlaScheduler()`.
- `src/controllers/health.controller.ts` — extraí `checkPlatformHealth(redisClient)` de dentro de
  `makeReadyHandler` para reaproveitar exatamente o mesmo check em ambos os lugares (nunca dois
  caminhos de "ready" divergentes).
- `src/repositories/tenantRepository.ts` — adicionei `listActiveTenantIds()` (necessário para o
  fan-out por tenant, ver handoff para o Agente 02 sobre o porquê).

**Não editei `server.ts`.**

## Arquivo(s) envolvido(s)

`server.ts` (seu, aprovação explícita necessária).

## Alteração necessária

Ao lado da chamada existente de `startRetentionScheduler()` (hoje em `server.ts`, dentro do bloco
`if (process.env.NODE_ENV !== 'test') { ... server.listen(...) }`, por volta da linha 320-326),
adicionar:

```ts
import { startSlaScheduler } from "./src/services/slaScheduler.js";
// ...
if (process.env.NODE_ENV !== 'test') {
  startWebhookWorker();
  startRetentionScheduler();
  startSlaScheduler();   // <-- adicionar esta linha
  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
}
```

Import a adicionar junto aos outros no topo do arquivo (perto de `import { startRetentionScheduler }
from "./src/services/retentionScheduler.js";`):

```ts
import { startSlaScheduler } from "./src/services/slaScheduler.js";
```

Nenhuma outra alteração em `server.ts` é necessária — mesmo padrão de `startRetentionScheduler()`
(chamada fire-and-forget no boot, guardada pelo mesmo `NODE_ENV !== 'test'`, para não abrir conexão
Redis/registrar job durante a suíte de testes).

## Teste esperado

- Após o wiring, subir o servidor localmente com Postgres/Redis disponíveis e confirmar no log a
  linha `[SlaScheduler] Registered platform readiness sampling job`.
- Em até 5 minutos (ou disparando manualmente a próxima ocorrência do job na fila
  `platformSlaCheck` via API do BullMQ), confirmar `[SlaScheduler] Platform readiness sample
  recorded` e uma nova linha `Metric` (`name: platform_ready_check`) por tenant ativo.
- Suíte automatizada (`npm run test`) já cobre o módulo isoladamente
  (`src/services/slaScheduler.test.ts`) e não exige Redis/Postgres reais (tudo mockado).

## Validações rodadas nesta branch (antes do wiring)

- `npm run typecheck`: sem erros.
- `npm run lint`: 0 erros, 105 warnings pré-existentes (`no-explicit-any` em mocks de teste,
  catalogado em `TECHNICAL-DEBT-CHECKLIST.html`; os 2 novos warnings introduzidos pelo meu teste de
  `tenantRepository` seguem o mesmo padrão já aceito nos demais arquivos `*.test.ts` de
  `src/repositories/**`).
- `npm run test`: 363 passed | 1 skipped (364 total, 56 arquivos + 1 skip) — inclui os novos testes
  de `src/services/slaScheduler.test.ts` e
  `src/repositories/tenantRepository.listActiveTenantIds.test.ts`.
- `npm run build`: sucesso (`vite build` + `esbuild server.ts`), sem erros.

## Contexto adicional

Mesma dinâmica já resolvida para `.agents/handoffs/onda-4/10-para-00-wire-retention-scheduler.md`
(retenção de `CallLog`) — o Coordenador já aplicou aquele wiring seguindo exatamente este formato.
