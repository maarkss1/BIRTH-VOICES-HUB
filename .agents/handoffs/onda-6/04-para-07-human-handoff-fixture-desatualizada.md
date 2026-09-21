- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 07 (Studio, Workflows e Colaboração)
- Onda: 6 (rodada 2)
- Status: aberto
- Prioridade: alto

## Problema

Por decisão do Coordenador (`.agents/handoffs/onda-6/00-para-04-human-handoff-mvp.md`), o nó
`human_handoff` deixou de ser bloqueado por `validateRuntimeCompatibility`/`publishWorkflow` nesta
rodada (MVP de discagem direta para o `fallbackNumber` literal do próprio nó — ver
`docs/patterns/workflow-execution-contract.md` §2, subseção `human_handoff`).

`src/services/workflowVersioning.test.ts` já tinha sido atualizado na rodada 1 (por vocês/pelo
Coordenador, ver `.agents/handoffs/onda-6/04-para-07-voice-node-fixture-desatualizada.md`) para
trocar o nó de exemplo de "qualquer tipo não suportado" de `voice` para `human_handoff` — exatamente
porque `voice` tinha acabado de deixar de ser um exemplo válido. Com `human_handoff` agora também
executável, o mesmo problema se repete nos dois mesmos testes:

```
FAIL src/services/workflowVersioning.test.ts > publishWorkflow archives the pre-publish version >
  never activates a workflow (and never archives anything) when the publish gate rejects the graph
FAIL src/services/workflowVersioning.test.ts > rollbackToVersion >
  refuses to roll back to an archived version that fails the runtime-compatibility gate today,
  with the same error shape as a fresh publish rejection
```

Não é uma regressão no gate em si (`publishWorkflow`/`rollbackToVersion` continuam rejeitando
corretamente um nó verdadeiramente não suportado) — o problema é estrutural agora: **não existe mais
nenhum tipo de nó real do Studio que o runtime não execute** (`start`, `llm`, `prompt`, `question`,
`condition`, `switch`, `memory`, `end`, `knowledge`, `tool`, `voice`, `human_handoff` — toda a união
`NodeType` de `lib/studio/types.ts`). Qualquer exemplo baseado num tipo de nó real de domínio corre
o risco de ser desbloqueado numa onda futura e quebrar de novo (foi exatamente o que aconteceu duas
vezes seguidas: rodada 1 trocou `voice` por `human_handoff`; rodada 2 quebrou `human_handoff`).

## Arquivo(s) envolvido(s)

- `src/services/workflowVersioning.test.ts` (seu, por co-localização com `workflowService.ts`).

## Alteração necessária

Sugestão para quebrar o ciclo: em vez de trocar para outro nó de domínio real (que pode virar
executável em qualquer onda futura), usar um **tipo de nó sintético/inexistente**, que testa
diretamente o branch `!type || !SUPPORTED_TYPES.has(type as RuntimeNodeType)` de
`validateRuntimeCompatibility` sem depender do status de nenhuma feature real:

```diff
- node('handoff-1', 'human_handoff', { department: 'vendas' }),
+ node('bogus-1', 'este_tipo_nao_existe' as unknown as NodeType, {}),
```

e, nos dois `expect`, trocar `err-runtime-unsupported-handoff-1` por
`err-runtime-unsupported-bogus-1` (mantendo os ids das arestas/edges consistentes com o novo id do
nó). O cast `as unknown as NodeType` já é um padrão usado noutros pontos desses mesmos arquivos de
teste (ex.: `as unknown as NonNullable<Workflow>`) para forçar um valor fora da união de tipos em
um teste que existe justamente para verificar o comportamento nesse caso.

Se preferirem manter um nome de nó de domínio por legibilidade do teste, tudo bem também — só
registrando que isso tende a se repetir a cada nova onda que desbloqueia um tipo de nó (decisão de
vocês/Coordenador, não estou insistindo numa solução específica).

## Teste esperado

Após a troca, `npx vitest run src/services/workflowVersioning.test.ts` volta a passar 100%,
continuando a provar exatamente o mesmo comportamento (publish/rollback rejeitam um grafo com nó
não executável).

## Contexto adicional

`docs/patterns/workflow-execution-contract.md` §2/§3/§5 já refletem `human_handoff` como executável
e documentam esta mesma classe de churn de fixture na seção "Known cross-agent test debt (rodada
2)". Rodei `npx vitest run` completo depois da minha mudança e confirmei que estas são as únicas 2
falhas em arquivos fora da minha propriedade (as outras 2, em `__tests__/**`, estão no handoff
irmão `.agents/handoffs/onda-6/04-para-08-human-handoff-fixtures-desatualizadas.md` para o Agente
08). Já resolvi o equivalente no meu próprio arquivo de teste
(`src/services/workflowRuntimeService.knowledgeTool.test.ts`), se ajudar de referência.
