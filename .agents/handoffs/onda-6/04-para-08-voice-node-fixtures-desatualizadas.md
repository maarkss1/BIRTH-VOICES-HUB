- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 6
- Status: aberto
- Prioridade: alto

## Problema

Por decisão do Coordenador (`.agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md`,
Tarefa 2), o nó `voice` deixou de ser bloqueado por `validateRuntimeCompatibility`/
`publishWorkflow` nesta onda (MVP de TTS nomeado do Twilio — ver
`docs/patterns/workflow-execution-contract.md` §2, subseção `voice`, e
`.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`).

Dois testes seus em `__tests__/**` (propriedade exclusiva sua, `AGENTS.md` §11 — eu não editei)
usavam um nó `voice` puramente como exemplo de "qualquer tipo de nó ainda não suportado pelo
runtime" para testar o mecanismo genérico do gate de capacidade. Com `voice` agora executável, essas
duas asserções passam a falhar — não por regressão no comportamento que elas realmente testam (o
gate de capacidade continua funcionando; só o exemplo escolhido ficou desatualizado).

Rodei `npx vitest run` após minha mudança e confirmei exatamente essas 2 falhas (nenhuma outra em
`__tests__/**`):

```
FAIL __tests__/workflowRuntimeService.test.ts > workflowRuntimeService capability gate >
  fails closed for Studio nodes that the production phone runtime cannot execute yet
FAIL __tests__/workflowPublishGate.test.ts > workflow publish production-runtime gate >
  refuses a visually valid graph containing a node the phone runtime cannot execute
```

## Arquivo(s) envolvido(s)

- `__tests__/workflowRuntimeService.test.ts` (linhas ~63-76 na versão pré-Onda-6).
- `__tests__/workflowPublishGate.test.ts` (linhas ~88-109 na versão pré-Onda-6).

## Alteração necessária

Troque o nó de exemplo de `voice` para `human_handoff`, que **continua bloqueado** nesta onda (não
tem MVP equivalente — precisa de bridge de telefonia real, ver
`.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md`).

Em `__tests__/workflowRuntimeService.test.ts`:

```diff
- node('voice-1', 'voice', { provider: 'ElevenLabs', voiceId: 'voice-x' }),
+ node('handoff-1', 'human_handoff', { department: 'vendas' }),
  node('end-1', 'end'),
];
- const edges = [edge('e1', 'start-1', 'voice-1'), edge('e2', 'voice-1', 'end-1')];
+ const edges = [edge('e1', 'start-1', 'handoff-1'), edge('e2', 'handoff-1', 'end-1')];

  const issues = validateRuntimeCompatibility(nodes, edges);

  expect(issues).toEqual(expect.arrayContaining([
-   expect.objectContaining({ id: 'err-runtime-unsupported-voice-1', type: 'error' }),
+   expect.objectContaining({ id: 'err-runtime-unsupported-handoff-1', type: 'error' }),
  ]));
```

Em `__tests__/workflowPublishGate.test.ts`, o mesmo padrão (troca de `voice-1`/`voice` por
`handoff-1`/`human_handoff` com `{ department: 'vendas' }`, e o `id` esperado de
`err-runtime-unsupported-voice-1` para `err-runtime-unsupported-handoff-1`).

Já apliquei exatamente essa mesma troca no meu próprio arquivo de teste
(`src/services/workflowRuntimeService.knowledgeTool.test.ts`) como referência de padrão, se ajudar.

## Teste esperado

Após a troca, `npx vitest run __tests__/workflowRuntimeService.test.ts
__tests__/workflowPublishGate.test.ts` volta a passar 100%, continuando a provar exatamente a
mesma coisa (o gate de capacidade rejeita um nó ainda não suportado), só que com um exemplo que
continua sendo verdade.

## Contexto adicional

Não fabriquei nem escondi essa quebra — documentei em
`.agents/handoffs/onda-6/04-para-00-resumo-e-desvios.md` que `npx vitest run` não fica 100% verde
no meu lado até este handoff (e o `04-para-07-*` irmão, para
`src/services/workflowVersioning.test.ts`) serem resolvidos pelos donos dos respectivos arquivos.
