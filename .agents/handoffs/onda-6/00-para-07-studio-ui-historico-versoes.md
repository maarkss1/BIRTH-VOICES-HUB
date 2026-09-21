- De: Agente 00 (Coordenador)
- Para: Agente 07 (Studio, Workflows e Colaboração)
- Onda: 6
- Status: resolvido
- Prioridade: normal

## Contexto

Você mesmo registrou este item como backlog opcional da Onda 5
(`.agents/handoffs/onda-5/07-para-07-ui-historico-versoes-studio.md`). O backend já está pronto e
testado (`GET /workflow/:id/versions`, `POST /workflow/:id/versions/:version/rollback`,
`src/services/workflowVersioning.test.ts`). Esta onda formaliza a tarefa.

## Tarefa

Implemente exatamente o que seu próprio handoff já especificou:

- Painel novo "Histórico de Publicações" em `components/studio/panels/**` (seu domínio) — listando
  `GET /workflow/:id/versions` (versão, data, autor).
- Botão "Restaurar esta versão" chamando `POST /workflow/:id/versions/:version/rollback`, com
  confirmação explícita antes (ação destrutiva em produção — substitui o conteúdo ativo publicado).
- Superfície de erro 422 usando o mesmo componente de exibição de `issues[]` que `TopBar`/`Inspector`
  já usam para o publish normal — nunca falhe silenciosamente num rollback recusado pelo gate de
  runtime.
- Estado em `store/useStudioStore.ts` (seu) para a lista de versões + ação de rollback.
- Ponto de montagem em `pages/Dashboard/VoiceStudio.tsx` (seu).

## Teste esperado

- Painel lista versões reais do tenant/workflow atual, nunca de outro tenant/workflow (isolamento
  tenant — `AGENTS.md` §15).
- Rollback bem-sucedido atualiza o canvas para refletir o conteúdo restaurado.
- Rollback rejeitado (422) mostra as `issues` ao usuário, não falha silenciosamente.

## Validação obrigatória antes de eu integrar

`npm run typecheck && npm run lint && npx vitest run && npm run build` — todos limpos.

## Resolução

Implementado em `agente/07-onda6-1551` (3 commits: `a741b69`, `a41e957`, `0940368`):

- `components/studio/panels/VersionHistoryPanel.tsx` (novo): painel "Histórico de Publicações" —
  lista `GET /workflow/:id/versions` (versão, data, autor), estados explícitos de
  loading/erro/vazio (nunca fabrica linha), confirmação inline explícita ("Sim, restaurar" /
  "Cancelar") antes de `POST /workflow/:id/versions/:version/rollback`, e surge issues[] de um
  422 via `ValidationIssuesList` (mesmo componente reaproveitado do publish normal).
- `components/studio/panels/ValidationIssuesList.tsx` (novo, extraído de `BottomDrawer.tsx`): o
  componente de exibição de `issues[]` que já existia inline no publish normal, agora reutilizável
  e usado também pelo rollback rejeitado.
- `store/useStudioStore.ts`: `workflowId` (identidade da Workflow row, necessária pois as rotas
  de versão são escopadas por `:id`, diferente de GET/POST `/workflow`), estado do painel
  (`workflowVersions`/`versionHistoryState`/etc.) e do rollback
  (`rollbackState`/`rollbackIssues`/etc.), sempre buscando/mutando via os endpoints reais — nunca
  dado mockado permanente.
- `components/studio/panels/TopBar.tsx`: botão "Histórico" abre o painel.
- `components/studio/Canvas.tsx` / `pages/Dashboard/VoiceStudio.tsx`: fiação do botão (TopBar,
  dentro do Canvas) ao ponto de montagem do painel (VoiceStudio.tsx), via o store global.

Testes novos: `components/studio/panels/VersionHistoryPanel.test.tsx` e
`store/useStudioStore.versionHistory.test.ts` — cobrem lista escopada ao `workflowId` atual
(nunca mistura tenant/workflow), 404 limpando lista antiga em vez de manter dado obsoleto,
confirmação obrigatória antes do rollback, sucesso atualizando canvas + lista, e rejeição 422
surfaçada sem mutar o canvas.

Gate: `npm run typecheck && npm run lint && npx vitest run && npm run build` — todos limpos (580
testes passando, 1 skip pré-existente; lint 0 erros, warnings restantes são `any` em mocks já
catalogados em `TECHNICAL-DEBT-CHECKLIST.html`, nenhum nos arquivos tocados aqui).

Nenhum arquivo fora da propriedade do Agente 07 foi alterado; o backend
(`workflow.controller.ts`/`workflowService.ts`/rotas) já estava pronto e não precisou de mudança.
