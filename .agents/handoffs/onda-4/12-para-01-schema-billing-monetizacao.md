- De: Agente 12 (Growth, Billing e Monetização de Uso)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados) — schema/migração são sua propriedade exclusiva
- Onda: 4
- Status: aberto
- Prioridade: alto

## Problema

Esta é a primeira execução do Agente 12 (criado nesta sessão — ver `AGENTS.md` §4 e
`ROADMAP.md` → "Fase 6: Growth, Billing e Monetização"). Toda a missão de billing real depende de
um model que ainda não existe: hoje não há `Plan`, `Wallet`/saldo, `Transaction`/histórico de
cobrança em `prisma/schema.prisma` — confirmado por busca no schema. `pages/Dashboard/Billing.tsx`
está no estado vazio honesto desde a Onda 2 (handoff `onda-2/02-para-00-billing-backend.md`)
precisamente por causa dessa lacuna.

Sem o schema, não há o que persistir — por isso este handoff é o primeiro passo real da missão,
antes de qualquer service/controller com lógica de verdade.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` (seu, exclusivo).
- `src/services/billingService.ts` (meu, já criado nesta execução como scaffold — todo export
  lança `BillingBackendNotReadyError` em vez de tocar tabela inexistente ou fabricar saldo/plano/
  histórico, `AGENTS.md` §14). As interfaces `WalletSummary`/`TransactionSummary`/`PlanOption`/
  `RecordTransactionInput` nesse arquivo espelham exatamente a proposta de schema abaixo — meu
  próximo passo, assim que este handoff for resolvido, é trocar cada função pela implementação
  real usando o Prisma Client gerado, sem precisar mudar a assinatura pública (logo sem quebrar
  futuros chamadores em `billing.controller.ts`/`Billing.tsx`).

## Alteração necessária

Proposta de schema (nomes/tipos ajustáveis à sua convenção — o que importa é a forma):

```prisma
model Plan {
  id              String   @id @default(uuid())
  slug            String   @unique
  name            String
  priceCents      Int
  currency        String   @default("BRL")
  billingInterval String   // "monthly" | "yearly" — catálogo global, não tenant-scoped
  active          Boolean  @default(true)
  wallets         Wallet[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// Uma linha por tenant — mesmo padrão de TenantAiConsent (tenantId @unique). balanceCents em
// centavos (nunca float) para não acumular erro de arredondamento em dinheiro real.
model Wallet {
  id               String        @id @default(uuid())
  tenantId         String        @unique
  tenant           Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  balanceCents     Int           @default(0)
  currency         String        @default("BRL")
  planId           String?
  plan             Plan?         @relation(fields: [planId], references: [id])
  planStatus       String        @default("inactive") // 'inactive'|'active'|'past_due'|'canceled'|'trialing'
  currentPeriodEnd DateTime?
  transactions     Transaction[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
}

// idempotencyKey é @unique e OBRIGATÓRIO (não opcional) — AGENTS.md §9 item 16 (que este agente
// introduziu) trata cobrança duplicada com a mesma gravidade do item 11 (replay de webhook).
// tenantId denormalizado (além de via walletId) para permitir listagem paginada sem join, mesmo
// padrão já usado em Metric (tenantId direto na linha de evento).
model Transaction {
  id                String   @id @default(uuid())
  walletId          String
  wallet            Wallet   @relation(fields: [walletId], references: [id], onDelete: Cascade)
  tenantId          String
  type              String
  amountCents       Int      // assinado: positivo = crédito, negativo = débito
  balanceAfterCents Int
  status            String
  description       String?
  externalReference String?  // ex.: id da transação no gateway de pagamento (Stripe), se houver
  idempotencyKey    String   @unique
  createdAt         DateTime @default(now())

  @@index([tenantId])
}
```

Adicionar `wallet Wallet?` e `plans Plan[]`/etc conforme necessário nas relações reversas de
`Tenant` (mesmo padrão de `aiConsent TenantAiConsent?`/`atlasGRCallResults AtlasGRCallResult[]`
já presentes no model `Tenant`).

`UsageRecord` (medição de uso — minutos de chamada, tokens de IA, armazenamento) e `Notification`
(sistema genérico de notificação) ficam para um handoff seguinte, depois que este primeiro core de
billing existir — não empacotei os quatro juntos para não represar toda a missão num único review
de schema grande.

## Teste esperado

Migração aplica limpo sobre o banco atual (puramente aditiva, sem alterar tabela existente).
`npx prisma generate` gera o client com os três models. Nenhum dado fabricado — `Wallet` só existe
quando criada explicitamente (ex.: no onboarding de um tenant, decisão de produto separada, fora
deste handoff).

## Contexto adicional

Bloqueador da missão do Agente 12 (não bloqueador de release — `Billing.tsx` já está no estado
vazio honesto, não há regressão em não resolver isso imediatamente). Assim que o schema existir,
retorno para implementar `billingService.ts` de verdade e abrir o próximo handoff (UsageRecord/
Notification).
