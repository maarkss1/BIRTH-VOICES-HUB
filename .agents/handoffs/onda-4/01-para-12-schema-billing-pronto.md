- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 12 (Growth, Billing e Monetização de Uso)
- Onda: 4
- Status: resolvido
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

## Resolução

Implementado de verdade, Prisma real, sem fabricar dado (AGENTS.md §14):

- `src/repositories/billingRepository.ts` (novo) — único ponto de acesso Prisma do domínio de
  billing (Clean Architecture, AGENTS.md §2): `findWalletByTenant` (com `include: { plan: true }`),
  `findTransactionsForTenant` (paginado), `findActivePlans`, `findPlanById`, `upsertWalletPlan`,
  `findTransactionByIdempotencyKey`, e `createTransactionAtomic` — este último faz
  `prisma.$transaction` lendo a wallet, calculando `balanceAfterCents` e criando a `Transaction`
  atomicamente com a atualização de `Wallet.balanceCents`, deixando o erro `P2002` (violação da
  constraint única de `idempotencyKey`) propagar para a camada de serviço.
- `src/services/billingService.ts` — todas as 6 funções implementadas contra o Prisma Client real,
  `BillingBackendNotReadyError` removido:
  - `getWalletSummary(tenantId)` → `Promise<WalletSummary | null>` (assinatura ajustada para
    `| null` — decisão desta execução: `wallet === null` é estado vazio explícito, nunca saldo
    zero fabricado, exatamente como sugerido no item 1 acima).
  - `listTransactions`/`listAvailablePlans` → leituras diretas via repository, mapeadas para os
    DTOs já existentes.
  - `changePlan` → funciona de verdade para `effectiveAt: 'immediate'` (troca `planId`/
    `planStatus: 'active'`/`currentPeriodEnd`, criando a `Wallet` no primeiro plano se ainda não
    existir). Proração/`next_cycle` **não implementado** — `ProrationNotSupportedError` explícita
    em vez de aplicar imediato silenciosamente; documentado no código como limitação que depende
    de `Wallet.currentPeriodStart` (novo handoff a você se/quando isso for priorizado).
  - `recordTransaction` → idempotente por `idempotencyKey` exatamente como pedido no item 4: tenta
    `createTransactionAtomic`, captura `P2002` (`Prisma.PrismaClientKnownRequestError`) e retorna a
    transação já existente via `findTransactionByIdempotencyKey` em vez de lançar erro ou duplicar
    saldo; qualquer outro erro (incluindo tenant sem wallet, ou P2002 sem linha correspondente
    encontrada — estado inesperado) propaga.
  - `canStartNewSession` → implementado (wallet inexistente, `planStatus` fora de
    `active`/`trialing`, ou `balanceCents <= 0` bloqueiam), **não chamado de nenhum outro lugar**
    ainda — handoff futuro para o Agente 05, como já estava documentado no arquivo.
- `src/controllers/billing.controller.ts` + `src/routes/billing.routes.ts` (novos, meus) —
  `GET /api/billing/summary`, `GET /api/billing/transactions`, `GET /api/billing/plans`,
  `POST /api/billing/change-plan`; leitura/escrita de saldo e troca de plano exigem
  `requireTenant` + `requireRole(['admin'])` (mesmo nível de `GET /users`/`GET /audit-log`); o
  catálogo de planos (`GET /billing/plans`) só exige `requireTenant` por não ser dado
  tenant-específico. Montado em `src/routes/index.ts`. `POST /billing/change-plan` grava
  `writeAuditLog(..., 'BILLING_PLAN_CHANGED', ...)`.
- `pages/Dashboard/Billing.tsx` — conectado aos 4 endpoints acima, com os mesmos padrões de
  loading (`Skeleton`)/empty (`EmptyState`)/error (`EmptyState` + botão "Tentar novamente") já
  usados em `Organization.tsx` (AGENTS.md §14); usuário não-admin vê "Acesso restrito" em vez de
  página vazia; troca de plano com estado de erro inline.
- `src/validators/index.ts` — adicionado `changePlanSchema` (zod) para o `POST /change-plan`.
- `src/services/billingService.test.ts` (novo, colocated — `__tests__/**` é exclusivo do Agente 08,
  então segui o padrão já usado por `auditLogService.test.ts`) — 17 testes cobrindo os 6 exports,
  com foco em idempotência de `recordTransaction`: chamada dupla com a mesma `idempotencyKey`
  simulando `P2002` retorna a transação existente sem recriar linha nem duplicar saldo; também
  cobre wallet inexistente, plano inexistente/inativo, `next_cycle` rejeitado, e as 4 combinações
  de `canStartNewSession`.

Validações executadas nesta branch: `npm run typecheck` (limpo), `npm run lint` (0 erros, 103
warnings pré-existentes de `any` em mocks de teste — mesma categoria já documentada em
`TECHNICAL-DEBT-CHECKLIST.html`, nada novo introduzido), `npm run test` (354 passed, 1 skipped —
todos os 55 arquivos de teste, incluindo os 17 novos), `npm run build` (Vite + esbuild, verde).

Limitação documentada (não corrigida nesta execução, por decisão de escopo — ver classe "Backlog
só é aceitável para... mudanças que exigem dono diferente", AGENTS.md §19): proração completa de
troca de plano fica para depois; `changePlan` só suporta `effectiveAt: 'immediate'`.
