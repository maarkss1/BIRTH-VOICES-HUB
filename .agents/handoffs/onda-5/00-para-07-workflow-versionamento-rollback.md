- De: Agente 00 (Coordenador)
- Para: Agente 07 (Studio, Workflows e Colaboração)
- Onda: 5
- Status: aberto
- Prioridade: alta (item do `ROADMAP.md` Fase 5)

## Problema

`Workflow.version` hoje é só um contador (`Int`, incrementado a cada publish) na MESMA linha —
publicar sobrescreve `nodes`/`edges` em produção. Não existe histórico navegável: uma vez na versão
5, não há como ver ou restaurar o que a versão 3 continha. Note que a parte "chamada em andamento
não pode quebrar ao republicar" **já está resolvida** — `telephonyService.ts`
(`PhoneSessionMetadata.workflow`, campo `Immutable runtime snapshot selected when the call
starts`) já tira um snapshot imutável no início de cada chamada, então uma republicação em
paralelo já não afeta chamadas em curso. O gap real é **histórico + rollback**.

## Escopo desta rodada

1. **Model Prisma `WorkflowVersion`** — **não é seu arquivo** (`prisma/schema.prisma` é exclusivo
   do Agente 01); escreva um handoff `.agents/handoffs/onda-5/07-para-01-schema-workflow-version.md`
   propondo: `id`, `workflowId` (FK, `onDelete: Cascade`), `version` (Int — mesmo número que estava
   em `Workflow.version` no momento daquele publish), `nodes` (Json), `edges` (Json), `metadata`
   (Json), `publishedAt` (DateTime), `publishedBy` (String? — userId). Índice em
   `[workflowId, version]` único (nunca duas linhas para o mesmo workflow+versão). Pode escrever
   `workflowService.ts` assumindo essa forma antes do schema existir de fato (scaffold), desde que
   o handoff exista.
2. **`publishWorkflow()`** (seu, `workflowService.ts`): antes de sobrescrever `Workflow.nodes`/
   `edges` com o novo conteúdo, criar uma linha `WorkflowVersion` arquivando o conteúdo **atual**
   (pré-publish) com o número de versão atual, só então incrementar `Workflow.version` e aplicar o
   novo conteúdo. Isso preserva every published version a partir de agora — não precisa
   retroativamente reconstruir versões já perdidas antes desta mudança (não fabricar histórico que
   não existe).
3. **Rollback**: nova função (`workflowService.rollbackToVersion(workflowId, tenantId, version)`)
   que busca a `WorkflowVersion` alvo, aplica seu `nodes`/`edges` como o conteúdo atual do
   `Workflow`, e publica isso como uma **versão nova** (nunca reescreve o número de versão antigo —
   rollback é "republicar conteúdo antigo como versão nova", preserva histórico linear e auditável,
   nunca reescreve o passado). Passa pelos mesmos dois gates de `publishWorkflow()`
   (`ValidationEngine` + `validateRuntimeCompatibility`) — um rollback para uma versão que hoje
   falharia o gate de capacidade do runtime (ex.: usava um tipo de nó que era suportado antes e não
   é mais) deve ser recusado com erro claro, nunca aplicado silenciosamente quebrado.
4. **Rota/controller** (`src/controllers/workflow.controller.ts`, seu): `GET
   /workflow/:id/versions` (lista, admin ou dono do workflow), `POST
   /workflow/:id/versions/:version/rollback`.
5. **UI**: fora do escopo desta rodada — se quiser, deixe um handoff pra você mesmo ou pra Agente
   02 sobre onde a lista de versões/botão de rollback deveria aparecer no Studio (provavelmente um
   painel novo, não um dos já existentes) — implementar isso é opcional aqui, o essencial é o
   backend.

## Arquivo(s) envolvido(s)
- `.agents/handoffs/onda-5/07-para-01-schema-workflow-version.md` (novo, proposta de schema).
- `src/services/workflowService.ts` (seu).
- `src/controllers/workflow.controller.ts` (seu).
- `src/routes/workflow.routes.ts` — confirme propriedade antes de editar; se não for explicitamente
  sua, só adicione as duas rotas seguindo o padrão já existente no arquivo, sem reestruturar nada
  mais.

## Teste esperado
- Publicar duas vezes seguidas cria uma `WorkflowVersion` para a versão anterior a cada publish,
  nunca duplica nem pula números.
- `rollbackToVersion` para uma versão que não existe (workflow errado, número inexistente, ou de
  outro tenant) falha com 404, nunca vaza conteúdo de outro tenant.
- Rollback para uma versão que hoje falha `validateRuntimeCompatibility` é recusado (422, mesmo
  formato de erro do publish normal).
- Uma chamada telefônica já em andamento numa versão anterior ao rollback continua funcionando sem
  interrupção (comportamento já garantido pelo snapshot de sessão, só confirmar que nada nesta
  mudança o quebra).

## Contexto adicional
Item `[07, schema com 01]` do `ROADMAP.md` Fase 5. Gate completo (`typecheck`, `lint`, `vitest`,
`build`) antes do push. Trabalhe em `agente/07-workflow-versionamento` a partir de
`integracao/onda-5`.
