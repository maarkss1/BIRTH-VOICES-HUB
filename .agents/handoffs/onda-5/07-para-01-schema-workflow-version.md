- De: Agente 07 (Studio, Workflows e Colaboração)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Onda: 5
- Status: aberto
- Prioridade: alto

## Problema

Onda 5 pediu histórico navegável + rollback de publish para `Workflow`
(`.agents/handoffs/onda-5/00-para-07-workflow-versionamento-rollback.md`). `prisma/schema.prisma`
é exclusivo seu (`AGENTS.md` §11), então não posso adicionar o model dedicado — implementei o
comportamento real hoje usando o mecanismo genérico que já existe (`Workflow.metadata`, campo
Prisma `Json`), o mesmo padrão que o Agente 04 usou para `TenantAiConsent` via `Setting`
(`.agents/handoffs/onda-2/04-para-01-ai-consent-schema.md`, resolvido).

Isso funciona de verdade e é tenant-isolado por construção (o arquivo mora dentro da própria linha
`Workflow` do tenant, que já é filtrada por `tenantId` em todo o `workflowRepository.ts`), mas tem
os mesmos limites que a versão interina de `04` documentou: sem índice dedicado, sem paginação
real, o array de versões cresce sem limite dentro da mesma linha, e não é discoverable via `prisma
studio` como conceito de primeira classe.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` (seu domínio exclusivo).

## Alteração necessária

Quando houver janela para migração, o model pedido pelo handoff da Onda 5 (idêntico ao que já
implementei em `src/services/workflowService.ts` como `PublishedWorkflowVersion`/
`metadata.publishedVersions`):

```prisma
model WorkflowVersion {
  id          String   @id @default(uuid())
  workflowId  String
  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  version     Int
  nodes       Json
  edges       Json
  metadata    Json     @default("{}")
  publishedAt DateTime @default(now())
  publishedBy String?

  @@unique([workflowId, version])
  @@index([workflowId])
}
```

(`Workflow` precisa ganhar a relação inversa `versions WorkflowVersion[]`.)

Ao migrar, as funções que hoje leem/escrevem `metadata.publishedVersions` — todas em
`src/services/workflowService.ts`: `archivePublishedVersion` (helper interno), `publishWorkflow`,
`listWorkflowVersions`, `rollbackToVersion` — devem passar a ler/escrever a tabela dedicada em vez
do JSON inline, mantendo as mesmas assinaturas públicas (nenhum chamador —
`workflow.controller.ts`, futuras telas de Studio — precisaria mudar). Eu assumo essa migração
quando o schema existir; não é pedido que 01 mude meus arquivos.

## Teste esperado
- Migration aplica limpo em base vazia e em base com workflows/`metadata.publishedVersions`
  existentes (não precisa migrar dado retroativo do JSON para a tabela nova — a Onda 5 já deixou
  explícito que não fabricamos histórico retroativo; a partir da migração, `publishWorkflow`
  passa a arquivar na tabela nova e o JSON antigo fica congelado como está, sem ser lido pela
  nova implementação).
- `@@unique([workflowId, version])` rejeita duas linhas para o mesmo workflow+versão (constraint de
  banco, não só de aplicação).
- `onDelete: Cascade` remove as versões arquivadas quando o `Workflow` pai é removido (hoje
  `removeWorkflow` faz soft-delete via `deletedAt`, então isso só importa para uma exclusão física
  futura, mas o cascade deve estar correto desde já).

## Contexto adicional
Item `[07, schema com 01]` do `ROADMAP.md` Fase 5. Implementação atual (funcional, não fabricada)
em `src/services/workflowService.ts` — ver comentário no topo da interface
`PublishedWorkflowVersion` para o mapeamento campo-a-campo com este model proposto.
