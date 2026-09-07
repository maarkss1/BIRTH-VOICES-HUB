- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 6 (rodada 2)
- Status: aberto
- Prioridade: alto

## Problema

Por decisão do Coordenador (`.agents/handoffs/onda-6/00-para-04-human-handoff-mvp.md`), o nó
`human_handoff` deixou de ser bloqueado por `validateRuntimeCompatibility`/`publishWorkflow` nesta
rodada (MVP de discagem direta para o `fallbackNumber` literal do próprio nó — ver
`docs/patterns/workflow-execution-contract.md` §2, subseção `human_handoff`, e
`.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md`).

Dois testes seus em `__tests__/**` (propriedade exclusiva sua, `AGENTS.md` §11 — eu não editei)
já tinham sido atualizados na rodada 1 (`test(00): update voice-as-unsupported-example fixtures
ahead of Agente 04's Onda 6 merge`, seguindo
`.agents/handoffs/onda-6/04-para-08-voice-node-fixtures-desatualizadas.md`) para trocar o nó de
exemplo de "qualquer tipo ainda não suportado" de `voice` para `human_handoff` — exatamente porque
`voice` tinha acabado de se tornar executável. Com `human_handoff` agora também executável, o mesmo
problema se repete:

```
FAIL __tests__/workflowRuntimeService.test.ts > workflowRuntimeService capability gate >
  fails closed for Studio nodes that the production phone runtime cannot execute yet
FAIL __tests__/workflowPublishGate.test.ts > workflow publish production-runtime gate >
  refuses a visually valid graph containing a node the phone runtime cannot execute
```

Rodei `npx vitest run` após minha mudança e confirmei exatamente essas 2 falhas em `__tests__/**`
(mais 2 equivalentes em `src/services/workflowVersioning.test.ts`, de propriedade do Agente 07 —
ver o handoff irmão `.agents/handoffs/onda-6/04-para-07-human-handoff-fixture-desatualizada.md`).

Não é uma regressão no gate em si — o gate de capacidade continua funcionando corretamente; o
problema é estrutural agora: **não existe mais nenhum tipo de nó real do Studio que o runtime não
execute** (`start`, `llm`, `prompt`, `question`, `condition`, `switch`, `memory`, `end`,
`knowledge`, `tool`, `voice`, `human_handoff` — toda a união `NodeType` de `lib/studio/types.ts`).
Qualquer exemplo baseado num tipo de nó real de domínio corre o risco de ser desbloqueado numa onda
futura e quebrar de novo — foi exatamente o que aconteceu duas vezes seguidas nestes mesmos dois
arquivos (rodada 1: `voice` -> `human_handoff`; rodada 2: `human_handoff` quebrou de novo).

## Arquivo(s) envolvido(s)

- `__tests__/workflowRuntimeService.test.ts` (linhas ~63-79 na versão pré-rodada-2).
- `__tests__/workflowPublishGate.test.ts` (linhas ~88-112 na versão pré-rodada-2).

## Alteração necessária

Sugestão para quebrar o ciclo: em vez de trocar para outro nó de domínio real, usar um **tipo de nó
sintético/inexistente**, que testa diretamente o branch `!type ||
!SUPPORTED_TYPES.has(type as RuntimeNodeType)` de `validateRuntimeCompatibility` sem depender do
status de nenhuma feature real (e sem precisar ser atualizado de novo a cada onda que desbloqueia
mais um tipo de nó):

Em `__tests__/workflowRuntimeService.test.ts`:

```diff
- node('handoff-1', 'human_handoff', { department: 'vendas' }),
+ node('bogus-1', 'este_tipo_nao_existe' as unknown as NodeType, {}),
  node('end-1', 'end'),
];
- const edges = [edge('e1', 'start-1', 'handoff-1'), edge('e2', 'handoff-1', 'end-1')];
+ const edges = [edge('e1', 'start-1', 'bogus-1'), edge('e2', 'bogus-1', 'end-1')];

  const issues = validateRuntimeCompatibility(nodes, edges);

  expect(issues).toEqual(expect.arrayContaining([
-   expect.objectContaining({ id: 'err-runtime-unsupported-handoff-1', type: 'error' }),
+   expect.objectContaining({ id: 'err-runtime-unsupported-bogus-1', type: 'error' }),
  ]));
```

Em `__tests__/workflowPublishGate.test.ts`, o mesmo padrão (troca de `handoff-1`/`human_handoff`
por `bogus-1`/`'este_tipo_nao_existe' as unknown as NodeType`, e o `id` esperado de
`err-runtime-unsupported-handoff-1` para `err-runtime-unsupported-bogus-1`).

O cast `as unknown as NodeType` é o mesmo padrão já usado noutros pontos desses arquivos de teste
(ex.: `as unknown as NonNullable<Workflow>`) para forçar um valor fora da união de tipos justamente
no teste que verifica esse caso.

Já apliquei o equivalente conceitual no meu próprio arquivo de teste
(`src/services/workflowRuntimeService.knowledgeTool.test.ts`) — troquei o teste que antes verificava
"`human_handoff` continua bloqueado" por um que verifica o oposto (aceito no publish, degrada com
segurança em runtime quando falta `fallbackNumber`), já que esse comportamento é meu de verdade
testar, diferente do vosso teste genérico de "tipo desconhecido".

## Teste esperado

Após a troca, `npx vitest run __tests__/workflowRuntimeService.test.ts
__tests__/workflowPublishGate.test.ts` volta a passar 100%, continuando a provar exatamente a mesma
coisa (o gate de capacidade rejeita um nó ainda não suportado), agora com um exemplo que não pode
mais ficar desatualizado por uma feature futura.

## Contexto adicional

Não fabriquei nem escondi essa quebra — documentei em
`docs/patterns/workflow-execution-contract.md` §5 ("Known cross-agent test debt (rodada 2)") e no
meu resumo para o Coordenador
(`.agents/handoffs/onda-6/04-para-00-resumo-rodada-2.md`) que `npx vitest run` não fica 100% verde
no meu lado até este handoff (e o `04-para-07-*` irmão, para
`src/services/workflowVersioning.test.ts`) serem resolvidos pelos donos dos respectivos arquivos.
