- De: Agente 00 (Coordenador)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 6 (rodada 2)
- Status: resolvido
- Prioridade: alta

## Contexto

O Agente 04 implementou o lado do runtime (`src/services/workflowRuntimeService.ts`, exclusivo
dele) para três capacidades que só produzem efeito real quando `telephonyService.ts`/
`telephony.controller.ts` (seus, exclusivos) consomem o novo formato de `PreparedWorkflowTurn`.
Ele escreveu handoffs contrato detalhados — leia os três antes de começar:

1. `.agents/handoffs/onda-6/04-para-05-tool-pending-contrato.md` — nó `tool` no meio da chamada.
2. `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md` — MVP de voz nomeada do Twilio.
3. `.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md` — MVP de `human_handoff`
   (pode não existir ainda no momento em que você começar — o Agente 04 está trabalhando nisso em
   paralelo nesta mesma rodada; se ainda não existir, implemente os itens 1 e 2 primeiro e volte
   para o item 3 quando o handoff aparecer, ou verifique com o Coordenador).

## Tarefa

Em `src/services/telephonyService.ts` e `src/controllers/telephony.controller.ts`:

1. **`tool_pending`**: quando `prepared.mode === 'tool_pending'`, chame `resumeAfterTool` (importado
   de `workflowRuntimeService.ts`) com `await`, tratando o resultado recursivamente/em loop (pode
   devolver `tool_pending` de novo se houver outro `tool` em sequência) exatamente como trataria o
   retorno original de `prepareWorkflowTurn`. Decida a UX de TwiML durante o `await` (a chamada tem
   timeout máximo de 6s) — proposta do Agente 04: `<Pause>` curto antes do próximo `<Gather>`/
   `<Say>`, ou processar antes de responder ao webhook. Escolha o que for mais simples de
   implementar corretamente.
2. **`voiceOverride`**: propague `prepared.voiceOverride` de `telephonyService.ts` até
   `telephony.controller.ts` (ex.: incluído no retorno de `handleTurn`/`startCall`) e use-o em todo
   `gather.say(...)`/`twiml.say(...)` que hoje usa `{ language: 'pt-BR' }` fixo:
   ```ts
   const sayOptions = prepared.voiceOverride
     ? { language: prepared.voiceOverride.language ?? 'pt-BR', voice: prepared.voiceOverride.voice }
     : { language: 'pt-BR' };
   ```
3. **`transfer`** (`mode: 'transfer'`, quando o handoff do item 3 acima estiver disponível): gere
   TwiML real de transferência:
   ```ts
   twiml.say({ language: 'pt-BR' }, transferDetails.message);
   twiml.dial(
     { timeout: transferDetails.timeoutSec, record: transferDetails.record ? 'record-from-answer' : undefined },
     transferDetails.to
   );
   ```
   Documente honestamente (não implemente agora, a menos que seja trivial) o que acontece se a
   transferência não for atendida/falhar — TwiML `<Dial>` sem `action` simplesmente encerra a
   chamada após a tentativa; se quiser um comportamento melhor (retornar ao fluxo original), é uma
   melhoria de UX de telefonia que pode ficar para uma rodada futura — registre em handoff se não
   implementar agora, não deixe implícito.

## Teste esperado

- Um `tool` no meio da conversa efetivamente chama o endpoint configurado (não só no início da
  chamada) e o TwiML da resposta seguinte reflete `tool_result`.
- Um workflow com nó `voice` configurado para um nome Twilio reconhecido produz `<Say
  voice="Polly.Camila">` real; sem `voice` configurado (ou com `ElevenLabs`), mantém o `<Say>`
  padrão de hoje.
- Um workflow com `human_handoff` configurado com `fallbackNumber` real produz `<Say>` +
  `<Dial>` reais para esse número, com `timeout`/`record` corretos.

## Validação obrigatória antes de eu integrar

`npm run typecheck && npm run lint && npx vitest run && npm run build` — todos limpos. Trabalhe a
partir de `integracao/onda-6` (já contém o trabalho do Agente 04 da rodada 1: `resumeAfterTool`,
`WorkflowNode`, `voiceOverride`).

## Resolução

As 3 tarefas foram implementadas em `src/services/telephonyService.ts` e
`src/controllers/telephony.controller.ts` (meus arquivos exclusivos), em dois commits:

1. `feat(05): consume tool_pending mid-call continuation and voiceOverride TwiML` — tarefas 1 e 2,
   feitas imediatamente (o handoff do item 3, `04-para-05-transferDetails-contrato.md`, ainda não
   existia neste momento).
2. `feat(05): consume human_handoff transfer contract with real <Say> + <Dial>` — tarefa 3, feita
   depois que esperei (~1 min de polling) o handoff aparecer no branch do Agente 04
   (`agente/04-onda6r2-3129`, commit `a235e21`), que mergeei neste branch para ter os tipos reais
   em vez de adivinhar o contrato.

Detalhes de cada contrato/tarefa nas seções `## Resolução` de
`04-para-05-tool-pending-contrato.md`, `04-para-05-voiceOverride-contrato.md` e
`04-para-05-transferDetails-contrato.md`.

Validação final (após as 3 tarefas, com o merge do Agente 04 rodada 2 incluído):
`npm run typecheck && npm run lint && npx vitest run && npm run build` — typecheck/lint/build
limpos; `npx vitest run`: 616 passados / 4 falhos / 1 skip (621). As 4 falhas são pré-existentes,
introduzidas pelo próprio commit do Agente 04 que mergeei (human_handoff deixou de ser bloqueado, o
que quebrou 2 fixtures de Agente 08 em `__tests__/workflowRuntimeService.test.ts` +
`__tests__/workflowPublishGate.test.ts`, e 2 de Agente 07 em
`src/services/workflowVersioning.test.ts`, todas usando `human_handoff` como "exemplo de nó não
suportado") — já documentadas e endereçadas pelo próprio Agente 04 em
`04-para-07-human-handoff-fixture-desatualizada.md` e
`04-para-08-human-handoff-fixtures-desatualizadas.md` antes deste merge. Não editei nenhum desses 3
arquivos (fora da minha propriedade, AGENTS.md §11/§12). Nenhum teste de
`telephonyService.ts`/`telephony.controller.ts` está entre as falhas.

Handoff novo criado: `.agents/handoffs/onda-6/05-para-00-transfer-dial-outcome-followup.md`,
documentando a limitação conhecida e não implementada nesta rodada (TwiML `<Dial>` sem `action` não
retorna ao workflow original em caso de transferência sem resposta/falha).
