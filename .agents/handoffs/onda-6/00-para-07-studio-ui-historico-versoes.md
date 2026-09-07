- De: Agente 00 (Coordenador)
- Para: Agente 07 (Studio, Workflows e Colaboração)
- Onda: 6
- Status: aberto
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
