- De: Agente 07 (Studio, Workflows e Colaboração)
- Para: Agente 07 (backlog própria fila — próxima rodada de Studio)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

O backend de versionamento/rollback (`GET /workflow/:id/versions`,
`POST /workflow/:id/versions/:version/rollback` — ver
`.agents/handoffs/onda-5/00-para-07-workflow-versionamento-rollback.md`) está pronto, mas não tem
UI no Studio ainda. Fora de escopo explicitamente marcado como opcional para esta rodada.

## Arquivo(s) envolvido(s)
- `components/studio/panels/**` (meu) — provavelmente um painel novo, não um dos existentes
  (`Inspector`, `Layers`, `TestSimulator`, `BottomDrawer`) já que "histórico de versões
  publicadas" é conceitualmente distinto de "histórico de rascunhos" (`getWorkflowHistory`/
  `restoreWorkflowVersion`, que já tem alguma superfície de UI ligada a `metadata.history`).
- `store/useStudioStore.ts` (meu) — precisa de estado para a lista de versões + ação de rollback.
- `pages/Dashboard/VoiceStudio.tsx` (meu) — ponto de montagem do painel novo.

## Alteração necessária
- Painel "Histórico de Publicações" listando `GET /workflow/:id/versions` (versão, data,
  autor), com botão "Restaurar esta versão" chamando
  `POST /workflow/:id/versions/:version/rollback`.
- Superfície clara de erro 422 (mesmo formato de `issues[]` do publish normal) quando o rollback é
  recusado pelo gate de runtime — reusar o mesmo componente de exibição de issues que o
  `TopBar`/`Inspector` já usam para publish.
- Confirmação explícita antes do rollback (ação destrutiva em produção — substitui o conteúdo
  ativo, mesmo que preserve histórico).

## Teste esperado
- Painel lista versões reais do tenant atual, nunca de outro tenant/workflow.
- Rollback bem-sucedido atualiza o canvas para refletir o conteúdo restaurado.
- Rollback rejeitado (422) mostra as `issues` ao usuário, não falha silenciosamente.

## Contexto adicional
Backend já testado em `src/services/workflowVersioning.test.ts`. Sem bloqueador — pode ser pego em
qualquer rodada futura de Studio.
