- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 12 (Growth, Billing e Monetização de Uso)
- Onda: 4
- Status: aberto
- Prioridade: alto

## Problema

Resolve `.agents/handoffs/onda-4/12-para-01-schema-billing-monetizacao.md`: o schema de billing
agora existe em `prisma/schema.prisma` e a migração real foi gerada e aplicada. `billingService.ts`
pode parar de lançar `BillingBackendNotReadyError` e usar o Prisma Client de verdade.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` (meu, exclusivo) — models `Plan`, `Wallet`, `Transaction` adicionados;
  `Tenant` ganhou `wallet Wallet?` e `transactions Transaction[]`.
- `prisma/migrations/20260907022547_add_billing_plan_wallet_transaction/migration.sql` — aplicada
  contra o Postgres de desenvolvimento local; puramente aditiva.
- `src/services/billingService.ts` (seu — não toquei) — as interfaces já batem campo a campo com o
  schema, ver mapeamento abaixo.

## Alteração necessária (para você, Agente 12)

Nenhuma mudança de schema pendente da sua parte. O que falta é sua implementação real:

1. `getWalletSummary(tenantId)` → `prisma.wallet.findUnique({ where: { tenantId }, include: { plan:
   true } })`, mapeando para `WalletSummary` (`plan.name` → `planName`, `plan.id` → `planId`,
   `currentPeriodEnd.toISOString()` etc.). Trate `wallet === null` como estado vazio explícito (não
   fabricar saldo zero "por padrão" sem essa ser uma decisão de produto deliberada — AGENTS.md §14).
2. `listTransactions(tenantId, pagination)` → `prisma.transaction.findMany({ where: { tenantId },
   orderBy: { createdAt: 'desc' }, skip, take })` + `prisma.transaction.count({ where: { tenantId }
   })`.
3. `listAvailablePlans()` → `prisma.plan.findMany({ where: { active: true } })`.
4. `recordTransaction(input)` → **use `idempotencyKey` como guarda de upsert** (ex.: tente
   `prisma.transaction.create` dentro de um `try/catch` verificando violação da constraint única de
   `idempotencyKey` — código `P2002` do Prisma — e, nesse caso, devolva a transação já existente em
   vez de lançar; ou use uma transação Prisma (`$transaction`) que lê a wallet, calcula
   `balanceAfterCents` e cria o registro atomicamente). Isso é o que fecha de fato o item 16 do
   AGENTS.md §9 (cobrança duplicada) — o tipo `RecordTransactionInput` já força `idempotencyKey`
   obrigatório, mas a obrigação de checar a constraint em tempo de execução é sua, na implementação.
5. `changePlan`/`canStartNewSession`: sem alteração de schema necessária para uma primeira versão
   (usam `Wallet.planId`/`planStatus`/`currentPeriodEnd` já existentes). Proration de verdade, se
   precisar de mais campos (ex. `currentPeriodStart`), abra um handoff novo para mim — não adicione
   campo ao schema você mesmo (AGENTS.md §11).

`Wallet` só deve ganhar uma linha por tenant quando você decidir o gatilho de criação (onboarding?
primeira transação?) — isso é decisão de produto sua, não fiz nenhum seed/backfill.

## Teste esperado

- `prisma.plan`, `prisma.wallet`, `prisma.transaction` disponíveis no client gerado (confirmado
  nesta execução via `npx prisma generate`).
- Teste de idempotência: chamar `recordTransaction` duas vezes com o mesmo `idempotencyKey` não deve
  criar duas linhas em `Transaction` nem alterar `Wallet.balanceCents` duas vezes.
- Teste de tenancy: `listTransactions`/`getWalletSummary` de um tenant nunca deve retornar linha de
  outro tenant (`tenantId` sempre vindo de `requireTenant`, nunca do payload do cliente — AGENTS.md
  §15).

## Contexto adicional

Validações completas rodadas nesta branch (`agente/01-schema-billing`) antes deste handoff:
`npm run typecheck`, `npm run lint`, `npm run test` (337 passed, 1 skipped), `npm run build` e
`npx prisma generate` — todos verdes. Nenhum arquivo fora do meu domínio foi alterado.

`UsageRecord`/`Notification` (mencionados no handoff original) ficam para um próximo handoff seu
para mim, quando você chegar nessa parte da missão — não empacotei aqui para não represar este
primeiro core de billing.
