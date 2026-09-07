- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 07 (Studio, Workflows e Colaboração)
- Onda: 6
- Status: aberto
- Prioridade: alto

## Problema

Por decisão do Coordenador (`.agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md`,
Tarefa 2), o nó `voice` deixou de ser bloqueado por `validateRuntimeCompatibility`/
`publishWorkflow` nesta onda (MVP de TTS nomeado do Twilio — ver
`docs/patterns/workflow-execution-contract.md` §2, subseção `voice`).

`src/services/workflowVersioning.test.ts` (fora de `__tests__/**`, mas o próprio cabeçalho do
arquivo diz explicitamente "colocated with `workflowService.ts`, which Agente 07 owns" — por isso
não editei, embora tecnicamente pudesse tocar o arquivo por estar em `src/services/`) usa um nó
`voice` em dois testes como exemplo de "qualquer nó que falhe no gate de runtime-compatibility"
para `publishWorkflow`/`rollbackToVersion`. Com `voice` agora executável, essas duas asserções
falham:

```
FAIL src/services/workflowVersioning.test.ts > publishWorkflow archives the pre-publish version >
  never activates a workflow (and never archives anything) when the publish gate rejects the graph
FAIL src/services/workflowVersioning.test.ts > rollbackToVersion >
  refuses to roll back to an archived version that fails the runtime-compatibility gate today,
  with the same error shape as a fresh publish rejection
```

Não é uma regressão no gate em si (`publishWorkflow`/`rollbackToVersion` continuam rejeitando
corretamente um nó verdadeiramente não suportado) — apenas o nó de exemplo escolhido (`voice`)
deixou de ser um exemplo válido de "nó não suportado".

## Arquivo(s) envolvido(s)

- `src/services/workflowVersioning.test.ts` (seu, por co-localização com `workflowService.ts`).

## Alteração necessária

Troque o nó de exemplo de `voice` para `human_handoff`, que **continua bloqueado** nesta onda
(requer bridge de telefonia real, sem MVP equivalente — ver
`.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md`):

```diff
- node('voice-1', 'voice', { provider: 'ElevenLabs', voiceId: 'voice-1' }),
+ node('handoff-1', 'human_handoff', { department: 'vendas' }),
```

e, nos dois `expect`, trocar `err-runtime-unsupported-voice-1` por
`err-runtime-unsupported-handoff-1` (mantendo os ids das arestas/edges consistentes com o novo id
do nó).

## Teste esperado

Após a troca, `npx vitest run src/services/workflowVersioning.test.ts` volta a passar 100%,
continuando a provar exatamente o mesmo comportamento (publish/rollback rejeitam um grafo com nó
não executável), só que com um exemplo que continua sendo verdade.

## Contexto adicional

`docs/patterns/workflow-execution-contract.md` §2/§3 já refletem `voice` como executável; se o
Studio (`store/useStudioStore.ts`, `nodeRegistry.voice`) expõe hoje um seletor de `provider`/
`voiceId` totalmente livre (texto arbitrário), pode valer a pena — como melhoria de produto
futura, não bloqueador desta onda — sinalizar na UI quando o par configurado não corresponde a
nenhum nome de voz Twilio reconhecido (a lista atual está em `KNOWN_TWILIO_VOICE_NAMES`,
`src/services/workflowRuntimeService.ts`), já que hoje esse caso simplesmente não fabrica um
`voiceOverride` e a chamada usa a voz padrão do Twilio silenciosamente. Não implementei isso por
ser mudança de UI (fora do meu domínio de arquivo) — apenas registro aqui caso vocês queiram
priorizar.
