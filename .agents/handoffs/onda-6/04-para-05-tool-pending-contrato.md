- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 6
- Status: resolvido
- Prioridade: alto

## Problema

`.agents/handoffs/onda-5/04-para-05-tool-node-async-continuation.md` (Onda 5) descrevia a
limitação: um nó `tool` alcançado no meio de uma chamada (fora do segmento `start -> ...
-> primeira interação`) nunca executava a chamada HTTP de verdade — `prepareWorkflowTurn` é
síncrono (chamado sem `await` por `telephonyService.ts`) e degradava direto para o fallback
(`tool_ok = 'false'`, `tool_error = 'tool_unavailable_mid_call'`).

O Coordenador decidiu, para a Onda 6
(`.agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md`, Tarefa 1), a **Opção B**:
continuação assíncrona explícita via um novo modo `tool_pending`, em vez de tornar
`prepareWorkflowTurn` `async` (o que quebraria ~3 asserções síncronas em
`__tests__/workflowRuntimeService.test.ts`, seu domínio de teste).

Implementei o lado do runtime (`src/services/workflowRuntimeService.ts`, meu arquivo exclusivo).
Este handoff descreve o contrato final para você consumir em `telephonyService.ts` — **eu não
alterei `telephonyService.ts`/`telephony.controller.ts`**, isso é seu domínio exclusivo.

## Arquivo(s) envolvido(s)

- `src/services/workflowRuntimeService.ts` (meu, já implementado — leitura para você).
- `src/services/telephonyService.ts` (seu — precisa da alteração descrita abaixo).

## Contrato

### O que mudou em `prepareWorkflowTurn`

`PreparedWorkflowTurn.mode` agora é `'llm' | 'direct' | 'tool_pending'` (era só `'llm' | 'direct'`).

Quando a caminhada síncrona do grafo (`advanceUntilInteraction`) alcança um nó `tool` — o que só
acontece fora do segmento inicial determinístico, já que esse segmento roda pelo caminho async em
`initializeWorkflowRuntime` — `prepareWorkflowTurn` retorna:

```ts
{
  state: WorkflowRuntimeState, // currentNodeId aponta para o nó `tool` pendente
  mode: 'tool_pending',
  shouldEnd: false,
  // demais campos (directReply, systemInstruction, nextQuestion, preferredProvider) ausentes
}
```

**Seu código atual em `handleTurn` (`telephonyService.ts` linha ~190) trata qualquer `mode !==
'direct'` como `'llm'`** — ou seja, hoje ele cairia no `else` e chamaria
`llmProviderGateway.processRequest` com `systemInstruction` indefinido. Isso é esperado e seguro
por enquanto (não quebra nada, apenas produz uma resposta genérica), mas não é o comportamento
desejado — é exatamente por isso que este handoff existe antes de você consumir o modo nesta
rodada seguinte.

### O que fazer em `telephonyService.ts`

Quando `prepared.mode === 'tool_pending'`:

1. **Não** chame o LLM Gateway.
2. Persista `prepared.state` imediatamente (como já faz hoje para `'direct'`) — ele contém
   `currentNodeId` apontando para o nó `tool` pendente, pronto para retomar.
3. Chame (com `await`, dentro do seu próprio fluxo assíncrono — `handleTurn` já é `async`):

```ts
import { resumeAfterTool, type WorkflowNode } from './workflowRuntimeService.js';

const pendingNode = prepared.state.nodes.find(
  (n): n is WorkflowNode => n.id === prepared.state.currentNodeId,
);
if (pendingNode) {
  const resumed = await resumeAfterTool(prepared.state, pendingNode);
  // trate `resumed` exatamente como trataria o retorno original de `prepareWorkflowTurn`:
  // `resumed.mode` pode ser 'llm', 'direct', ou novamente 'tool_pending' (se houver um
  // segundo nó `tool` em sequência — trate recursivamente/em loop).
}
```

4. `resumeAfterTool` nunca lança exceção não tratada — timeout/URL bloqueada/consentimento
   ausente degradam para o mesmo fallback (`tool_ok='false'`/`tool_error='<motivo>'`) que uma
   falha real no início da chamada já usa, e o grafo continua a partir daí.
5. Decida como o TwiML deve se comportar durante o `await` de `resumeAfterTool` (a chamada HTTP
   tem timeout máximo de 6s — `MAX_TOOL_TIMEOUT_MS` em `HttpToolExecutor.ts`) — isso é decisão sua
   de UX de telefonia (ex.: `<Pause>` antes do próximo `<Gather>`/`<Say>`, ou processar antes de
   responder ao webhook do Twilio). Não normatizo isso aqui porque é comportamento de TwiML, seu
   domínio.

### `WorkflowNode`

Exportei um alias público `WorkflowNode` (idêntico estruturalmente ao que já está em
`state.nodes: WorkflowNode[]`) especificamente para você referenciar o tipo do nó sem importar o
tipo interno `RuntimeNode`.

## Teste esperado

Já cobri no meu lado (`src/services/workflowRuntimeService.knowledgeTool.test.ts`): um workflow
`start -> question -> tool -> prompt` avançado com `prepareWorkflowTurn` até `tool_pending`, e então
`resumeAfterTool` chamando de verdade a URL configurada com uma variável coletada no `question`
anterior, continuando até o `prompt`/`end` seguinte.

Quando você implementar o consumo em `telephonyService.ts`, o teste esperado do seu lado é: um
turno de telefonia real que atravessa um `tool` no meio da conversa efetivamente chama o endpoint
configurado (não apenas no início da chamada) e a resposta seguinte reflete `tool_result`.

## Contexto adicional

- `applyToolFallback` (fallback de falha real — timeout, URL bloqueada, consentimento negado)
  continua exatamente igual; só deixou de ser acionado artificialmente só por o `tool` ter sido
  alcançado no meio da chamada.
- `docs/patterns/workflow-execution-contract.md` §2 (subseção `tool`) foi atualizado com este
  contrato.

## Resolução

Consumido em `telephonyService.ts` (`handleTurn`): um novo helper `resolvePreparedTurn` chama
`await resumeAfterTool(...)` em loop enquanto `mode === 'tool_pending'` (cobrindo cadeias de
múltiplos `tool` em sequência), com um limite defensivo (`MAX_TOOL_CHAIN_STEPS = 10`) e um fallback
honesto quando `state.currentNodeId` não resolve para o nó pendente — nunca trava o webhook do
Twilio nem loopa indefinidamente num grafo corrompido/cíclico. Testes co-localizados em
`src/services/telephonyService.toolPendingVoice.test.ts` (cadeia simples, cadeia de 2 `tool`s,
resolução para `'llm'`, nó pendente ausente, e o limite de segurança). `npm run typecheck && npm
run lint && npx vitest run && npm run build` limpos (ver commit `feat(05): consume tool_pending
mid-call continuation and voiceOverride TwiML`).
