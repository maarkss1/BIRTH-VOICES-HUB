- De: Agente 00 (Coordenador)
- Para: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Onda: 6 (rodada 2)
- Status: aberto
- Prioridade: normal

## Contexto

Enquanto revisava seu trabalho da rodada 1, encontrei um caminho para desbloquear `human_handoff`
sem precisar de decisão de produto (o registro "departamento → número real" que
`.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md` levantava como bloqueador):
`nodeRegistry.human_handoff.defaultConfig` (`store/useStudioStore.ts`) já tem um campo
`fallbackNumber` que é um **número de telefone literal** (`'+5511999999999'`), não um lookup. O
próprio nó já carrega o destino real da transferência — só falta o runtime resolver isso e o
Agente 05 discar.

## Tarefa

Em `src/services/workflowRuntimeService.ts` (seu, exclusivo):

- Remova `human_handoff` de `UNSUPPORTED_REASON`/adicione a `SUPPORTED_TYPES`.
- Estenda `PreparedWorkflowTurn` com um novo modo `mode: 'transfer'` (ao lado de `'llm' | 'direct'
  | 'tool_pending'`) e um campo `transferDetails?: { to: string; timeoutSec: number; record:
  boolean; message: string }`, resolvidos do nó `human_handoff` mais próximo alcançado:
  - `to` = `config.fallbackNumber` (string, obrigatório — se ausente/vazio, **não** produza
    `mode: 'transfer'`; trate como se o nó não tivesse destino configurado e siga para o fallback
    igual a um `tool` sem sucesso, logando um aviso — nunca invente um número).
  - `timeoutSec` = `config.ringTimeoutSec` (number; default 30 se ausente/inválido).
  - `record` = `config.recordCall === 'true'` (o Studio grava como string, não boolean — mesmo
    padrão de `toToolHeaders` para JSON-string vs. objeto).
  - `message` = `config.transferMessage` (string; default genérico honesto se ausente, ex.:
    "Aguarde um momento enquanto encaminho sua ligação.").
  - `department` (`config.department`) é só um rótulo/label nesta rodada — inclua-o em
    `transferDetails` se achar útil para log/observabilidade do lado do Agente 05, mas **não** o
    resolva para nenhum número (isso seguiria sendo uma feature separada de roteamento por PBX,
    fora de escopo — documente essa limitação, não a esconda).
- `human_handoff` é um nó terminal-de-turno (como `prompt`/`question`/`tool` — a caminhada síncrona
  para nele e devolve `mode: 'transfer'`), não passivo como `voice`.
- Documente o contrato final em `docs/patterns/workflow-execution-contract.md` §2/§3 e escreva um
  handoff `04-para-05-transferDetails-contrato.md` para o Agente 05 (mesmo padrão dos outros dois
  desta onda) — ele fará o `<Say>` + `<Dial>` real em `telephony.controller.ts` (fora do seu
  domínio).

## Teste esperado

Um workflow `start -> question -> human_handoff -> end` publicado: `prepareWorkflowTurn` avançado
até o `human_handoff` devolve `mode: 'transfer'` com `transferDetails.to` igual ao
`fallbackNumber` configurado. Nó `human_handoff` sem `fallbackNumber` configurado nunca produz
`mode: 'transfer'` com `to` vazio/inventado.

## Validação obrigatória antes de eu integrar

`npm run typecheck && npm run lint && npx vitest run && npm run build` — todos limpos. Esta tarefa
é independente das suas 3 tarefas da rodada 1 (já integradas em `integracao/onda-6`) — trabalhe a
partir dessa branch.
