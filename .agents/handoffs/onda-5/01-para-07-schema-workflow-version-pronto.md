- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 07 (Studio, Workflows e Colaboração)
- Onda: 5
- Status: aberto
- Prioridade: alto

## Problema

Resolve `.agents/handoffs/onda-5/07-para-01-schema-workflow-version.md`. O model
`WorkflowVersion` foi adicionado a `prisma/schema.prisma` seguindo exatamente a forma que você
propôs (mesmos nomes de campo, mesmos tipos, `@@unique([workflowId, version])`,
`onDelete: Cascade`), com a relação inversa `versions WorkflowVersion[]` adicionada em `Workflow`.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` — model `WorkflowVersion` adicionado (logo após `Workflow`), campo
  `versions` adicionado em `Workflow`.
- `prisma/migrations/20260907140000_add_webhook_endpoint_and_workflow_version/migration.sql` —
  migration real, puramente aditiva (`CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT`, nenhum
  `DROP`/`ALTER` destrutivo em tabela existente, sem tocar `Workflow.metadata` nem nenhuma linha
  já existente). Cobre `WorkflowVersion` e, no mesmo commit, `TenantWebhookEndpoint` (pedido
  independente do Agente 05 — não há relação entre os dois models, só compartilham o commit por
  conveniência de janela de migração).

Observação sobre o ambiente: não havia Postgres nem Docker disponíveis neste worktree para rodar
`prisma migrate dev` de verdade contra um banco vivo — a migration foi escrita manualmente
seguindo byte a byte o padrão das migrations já existentes (mesmo estilo de
`20260907022547_add_billing_plan_wallet_transaction/migration.sql`, incluindo o índice
`WorkflowVersion_workflowId_idx` e o unique composto `WorkflowVersion_workflowId_version_key`,
nomeados no mesmo padrão que Prisma geraria). `npx prisma validate` e `npx prisma generate`
passaram limpos — `prisma.workflowVersion` já existe no client gerado
(`node_modules/.prisma/client/index.d.ts`) — mas a migration em si não foi aplicada contra um
banco real nesta execução. Antes do primeiro `prisma migrate deploy` real (Cloud Run ou
homologação), rode `npx prisma migrate status` contra um banco vivo para confirmar que ela aplica
limpo tanto em base vazia quanto em base com `Workflow.metadata.publishedVersions` já populado
(a migration não toca `metadata` de forma alguma, então isso deve ser um no-op, mas confirme); se
algo divergir do esperado, é bloqueador — não prossiga sem corrigir.

## Alteração necessária

Confirmando exatamente o que seu handoff original já previa: agora que o schema existe, migrar
`src/services/workflowService.ts` (seu, exclusivo — eu não o editei nesta execução) para ler/
escrever `prisma.workflowVersion` em vez de `metadata.publishedVersions`, nas funções
`archivePublishedVersion` (helper interno), `publishWorkflow`, `listWorkflowVersions` e
`rollbackToVersion` — mantendo as mesmas assinaturas públicas que `workflow.controller.ts` já
consome, como você mesmo descreveu no handoff original. Sem backfill retroativo do JSON antigo
(conforme já combinado): a partir desta migração a tabela nova é a fonte de verdade para novas
publicações; `metadata.publishedVersions` já existente fica congelado, sem ser lido pela nova
implementação.

## Teste esperado

- `src/services/workflowVersioning.test.ts` (já existente) continua cobrindo o comportamento,
  agora contra `prisma.workflowVersion` em vez do mock de `metadata` — ajuste os mocks conforme
  necessário, sem mudar assinatura pública.
- `@@unique([workflowId, version])` rejeita duas linhas para o mesmo workflow+versão como
  constraint de banco (não só de aplicação) — vale testar tentando publicar a mesma versão duas
  vezes em paralelo/race, não só sequencialmente.
- `onDelete: Cascade` remove versões arquivadas quando o `Workflow` pai é removido fisicamente
  (hoje `removeWorkflow` faz soft-delete via `deletedAt`, então isso é best-effort para uma
  exclusão física futura, conforme você já registrou no handoff original).

## Contexto adicional

`Tenant` também ganhou a relação `webhookEndpoints TenantWebhookEndpoint[]` no mesmo commit — não
afeta seu domínio, é o pedido paralelo e independente do Agente 05
(`.agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md`), citado aqui só para
transparência do que mudou em `prisma/schema.prisma` neste commit único.

Gate completo rodado nesta branch (`agente/01-schema-webhooks-workflow-version`) antes deste
handoff: `npm run typecheck`, `npm run lint` (0 erros, warnings pré-existentes de `any` em mocks
de teste, já catalogados em `TECHNICAL-DEBT-CHECKLIST.html`), `npx vitest run` (474 passed, 1
skipped, 0 failed — inclui `src/services/workflowVersioning.test.ts` passando contra a
implementação interina atual, que ainda não foi migrada para a tabela nova), `npm run build` —
todos verdes.
