- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

Resolve `.agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md`. O model
`TenantWebhookEndpoint` foi adicionado a `prisma/schema.prisma` seguindo exatamente a forma que
você propôs (mesmos nomes de campo, mesmos tipos, `events` como `Json @default("[]")`,
`secretHash` como único segredo persistido, `@@index([tenantId])`), com a relação inversa
`webhookEndpoints TenantWebhookEndpoint[]` adicionada em `Tenant`, no mesmo padrão de `apiKeys
APIKey[]`.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` — model `TenantWebhookEndpoint` adicionado (linhas após `APIKey`), campo
  `webhookEndpoints` adicionado em `Tenant`.
- `prisma/migrations/20260907140000_add_webhook_endpoint_and_workflow_version/migration.sql` —
  migration real, puramente aditiva (`CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT`, nenhum
  `DROP`/`ALTER` destrutivo em tabela existente). Cobre `TenantWebhookEndpoint` e, no mesmo
  commit, `WorkflowVersion` (pedido independente do Agente 07 — não há relação entre os dois
  models, só compartilham o commit por conveniência de janela de migração).

Observação sobre o ambiente: não havia Postgres nem Docker disponíveis neste worktree para rodar
`prisma migrate dev` de verdade contra um banco vivo — a migration foi escrita manualmente
seguindo byte a byte o padrão das migrations já existentes (`CREATE TABLE ... JSONB NOT NULL
DEFAULT '[]'`, nomes de constraint `<Model>_pkey`/`<Model>_<campo>_fkey`/`<Model>_<campo>_idx`,
mesmo estilo de `20260907022547_add_billing_plan_wallet_transaction/migration.sql`). `npx prisma
validate` e `npx prisma generate` passaram limpos — `prisma.tenantWebhookEndpoint` já existe no
client gerado (`node_modules/.prisma/client/index.d.ts`) — mas a migration em si não foi aplicada
contra um banco real nesta execução. Antes do primeiro `prisma migrate deploy` real (Cloud Run ou
homologação), rode `npx prisma migrate status` contra um banco vivo para confirmar que ela aplica
limpo; se algo divergir do esperado, é bloqueador — não prossiga sem corrigir.

## Alteração necessária

Agora que o schema existe, o próximo passo é seu, não meu (`src/repositories/webhookEndpointRepository.ts`
e `src/services/webhookEndpointService.ts` são seus, exclusivos — eu não os editei nesta
execução): trocar cada função do repository que hoje lança `WebhookEndpointSchemaNotReadyError`
pela chamada real via `prisma.tenantWebhookEndpoint`, mantendo as mesmas assinaturas públicas que
`webhookEndpointService.ts`/`webhookEndpoint.controller.ts`/`webhook.service.ts#dispatch` já
consomem — pelo seu próprio handoff original, isso não deveria exigir mudança de assinatura.

## Teste esperado

- `src/services/webhookEndpointService.test.ts` (já existente, com repository mockado) continua
  passando sem alteração de assinatura.
- Nova cobertura de integração real com `prisma.tenantWebhookEndpoint` (isolamento cross-tenant,
  limite de 5 endpoints ativos, listagem nunca incluindo `secretHash`) contra o schema agora
  disponível.
- Rotas `POST/GET/DELETE /api/developers/webhooks` deixam de responder `503`
  (`WebhookEndpointSchemaNotReadyError`) e passam a persistir de verdade.

## Contexto adicional

`Workflow` também ganhou a relação inversa `versions WorkflowVersion[]` no mesmo commit — não
afeta seu domínio, é o pedido paralelo e independente do Agente 07
(`.agents/handoffs/onda-5/07-para-01-schema-workflow-version.md`), citado aqui só para
transparência do que mudou em `prisma/schema.prisma` neste commit único.

Gate completo rodado nesta branch (`agente/01-schema-webhooks-workflow-version`) antes deste
handoff: `npm run typecheck`, `npm run lint` (0 erros, warnings pré-existentes de `any` em mocks
de teste, já catalogados em `TECHNICAL-DEBT-CHECKLIST.html`), `npx vitest run` (474 passed, 1
skipped, 0 failed), `npm run build` — todos verdes.
