- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 6 (rodada 2)
- Status: aberto
- Prioridade: alto

## Problema

`.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md` bloqueava `human_handoff` por
falta de uma decisão de produto: rotear "departamento -> número real" exigiria uma tabela de
lookup/mudança de schema. Revisando o próprio nó, o Coordenador encontrou um caminho mais estreito
que não precisa de nada disso
(`.agents/handoffs/onda-6/00-para-04-human-handoff-mvp.md`): `nodeRegistry.human_handoff.
defaultConfig` (`store/useStudioStore.ts`) já tem um campo `fallbackNumber` que é um **número de
telefone literal** (`'+5511999999999'`), não uma chave de lookup — o nó já carrega o destino real.

Implementei o lado do runtime (`src/services/workflowRuntimeService.ts`, meu arquivo exclusivo):
`human_handoff` deixou de ser bloqueado em `validateRuntimeCompatibility`/publish, e
`PreparedWorkflowTurn` ganhou `mode: 'transfer'` + `transferDetails`. **Não implementei o lado do
Twilio** — é seu domínio exclusivo (`telephony.controller.ts`, `telephonyService.ts`).

## Arquivo(s) envolvido(s)

- `src/services/workflowRuntimeService.ts` (meu, já implementado — leitura para você).
- `src/services/telephonyService.ts` / `src/controllers/telephony.controller.ts` (seus — precisam
  da alteração descrita abaixo).

## Contrato

### O que mudou em `PreparedWorkflowTurn`

`mode` agora é `'llm' | 'direct' | 'tool_pending' | 'transfer'` (era `'llm' | 'direct' |
'tool_pending'`), e há um novo campo:

```ts
transferDetails?: {
  to: string;          // número literal para discar — SEMPRE o fallbackNumber configurado no nó
  timeoutSec: number;  // ringTimeoutSec do nó, default 30 se ausente/inválido
  record: boolean;     // recordCall do nó (Studio grava como string 'true'/'false')
  message: string;     // transferMessage do nó, com um default genérico honesto se ausente
  department?: string; // department do nó — SÓ um rótulo, ver "Limitação conhecida" abaixo
}
```

Quando a caminhada síncrona do grafo (`advanceUntilInteraction`) alcança um nó `human_handoff` com
`fallbackNumber` configurado, `prepareWorkflowTurn`/`resumeAfterTool` retornam:

```ts
{
  state: WorkflowRuntimeState, // currentNodeId aponta para o nó human_handoff
  mode: 'transfer',
  transferDetails: { to, timeoutSec, record, message, department? },
  shouldEnd: false,
  // demais campos (directReply, systemInstruction, nextQuestion, preferredProvider) ausentes
}
```

`human_handoff` é um nó **terminal-de-turno** (como `prompt`/`question`/`tool`), mas **diferente de
`tool`, não existe função de retomada** (`resumeAfterHandoff` não existe) — o runtime não tem mais
nada para executar depois que uma ponte de telefonia real assume a chamada. Isso já reflete a
cardinalidade do próprio nó no Studio (`nodeRegistry.human_handoff.outputs === 0` —
`store/useStudioStore.ts`): ele não foi desenhado para voltar a rotear para o grafo.

### Nunca invento um número

Se `fallbackNumber` estiver ausente/vazio no nó, `mode: 'transfer'` **nunca** é produzido — o
runtime trata isso como uma falha, exatamente como um `tool` sem sucesso: registra um `logger.warn`,
grava `variables.handoff_ok = 'false'` / `variables.handoff_error = 'fallback_number_missing'` (mais
uma cópia por nó, `handoff_<nodeId>_ok`/`handoff_<nodeId>_error`, para múltiplos nós no mesmo
grafo), e continua a caminhada pela aresta de saída padrão do nó como se ele não existisse. Você
nunca vai ver `mode: 'transfer'` com `to` vazio ou inventado — se isso acontecer, é um bug no meu
lado, nunca um comportamento esperado do contrato.

### O que fazer em `telephony.controller.ts`/`telephonyService.ts`

Quando `prepared.mode === 'transfer'`:

1. Persista `prepared.state` imediatamente (como já faz para `'direct'`/`'tool_pending'`) —
   `currentNodeId` fica parado no nó `human_handoff`; não há retomada esperada depois disso.
2. Fale `transferDetails.message` (ex.: via `<Say>`, honrando `prepared.voiceOverride` se presente
   — ver `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`) e então faça o
   `<Dial timeout={transferDetails.timeoutSec} record={transferDetails.record ? 'record-from-answer'
   : undefined}>{transferDetails.to}</Dial>` real (ou o equivalente na sua API do Twilio SDK) — essa
   parte é inteiramente sua, eu não implementei nada de TwiML.
3. `transferDetails.department`, quando presente, é **só um rótulo** — use-o para log/observabilidade
   do lado da telefonia (ex.: metadata do `CallLog`, span de telemetria) se achar útil, mas **nunca**
   o resolva para um número de telefone ou linha de PBX diferente do `to` já fornecido.
4. Decida como o `CallLog`/estado de chamada deve registrar o resultado da transferência (atendida,
   sem resposta, ocupado, etc.) — isso é seu domínio de telefonia; o runtime não sabe o resultado
   real do `<Dial>` porque `human_handoff` não tem retomada.

## Limitação conhecida: departamento não roteia para número

`department` (rótulo livre no Studio, ex.: `"Suporte Técnico"`) **não** é resolvido para nenhum
número/linha de PBX específico nesta rodada — esse continua sendo o roteamento por departamento que
`.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md` original propunha e que
permanece fora de escopo (exigiria uma tabela "departamento -> número" e uma decisão de produto
sobre como ela é gerenciada). Esta MVP disca sempre o mesmo `fallbackNumber` do nó, independente do
valor de `department`. Se isso virar prioridade de produto, abra um handoff descrevendo o caso de
uso — não escondo essa limitação, só não a resolvo aqui.

## Limitação conhecida: segmento inicial da chamada

Se um `human_handoff` estiver no segmento inicial do grafo (`start -> human_handoff -> ...`, antes
da primeira `prompt`/`question`), `initializeWorkflowRuntime` para a caminhada nele corretamente
(nunca inventa uma transferência nem a descarta silenciosamente), mas retorna só um
`WorkflowRuntimeState`, não um `PreparedWorkflowTurn` — não há canal para expor `mode: 'transfer'`
nesse ponto ainda (mesma limitação já documentada para a saudação inicial do nó `voice`). O
`currentNodeId` fica corretamente apontando para o nó, então a **próxima** chamada a
`prepareWorkflowTurn` já re-sinaliza `mode: 'transfer'` normalmente. Se isso for um problema de
produto real (ex.: um workflow legítimo quer transferir já na saudação, sem nenhuma
`prompt`/`question` antes), é uma extensão pequena — só falta expor via `getWorkflowOpeningQuestion`
ou uma função irmã, mesma observação já feita para `voiceOverride`.

## Teste esperado

Já cobri no meu lado (`src/services/workflowRuntimeService.knowledgeTool.test.ts`, describe
`'human_handoff node execution'`): um workflow `start -> question -> human_handoff -> end` avançado
com `prepareWorkflowTurn` até o `human_handoff` retorna `mode: 'transfer'` com `transferDetails.to`
igual ao `fallbackNumber` configurado e os defaults corretos para `ringTimeoutSec`/`recordCall`/
`transferMessage`; um `human_handoff` sem `fallbackNumber` nunca produz `mode: 'transfer'` (degrada
como um `tool` sem sucesso); um `human_handoff` no segmento inicial pausa corretamente e a próxima
chamada re-sinaliza `'transfer'`; e uma cadeia `tool -> human_handoff` faz `resumeAfterTool`
retornar `mode: 'transfer'` assim que a chamada do tool termina.

Quando você implementar o consumo em `telephony.controller.ts`, o teste esperado do seu lado é: um
workflow publicado com um `human_handoff` configurado com `fallbackNumber` real produz um
`<Dial>` real para esse número num turno de telefonia real (não apenas no início da chamada); sem
`fallbackNumber` configurado, o TwiML mantém o comportamento padrão (segue para o próximo nó do
grafo) em vez de tentar discar algo.

## Contexto adicional

- `docs/patterns/workflow-execution-contract.md` §2 (subseção `human_handoff`) e §3 (tabela de
  config) foram atualizados com este contrato.
- Este handoff segue o mesmo padrão dos dois outros desta onda
  (`04-para-05-tool-pending-contrato.md`, `04-para-05-voiceOverride-contrato.md`) — o campo
  `Status` deles é a fonte da verdade sobre se `telephonyService.ts` já consome cada contrato.
