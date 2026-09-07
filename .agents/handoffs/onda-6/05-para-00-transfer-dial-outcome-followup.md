- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 00 (Coordenador) / roadmap
- Onda: 6 (rodada 2)
- Status: aberto
- Prioridade: normal

## Problema

Consumindo `.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md` (`mode: 'transfer'` /
`TransferDetails`), implementei em `telephony.controller.ts` o `<Say>` + `<Dial>` real para
`human_handoff`:

```ts
twiml.say(sayOptions, result.reply);
twiml.dial(dialOptionsFor(result.transferDetails), result.transferDetails.to);
```

Sem um atributo `action` no `<Dial>`, o Twilio simplesmente encerra o `<Response>` assim que a
tentativa de discagem termina — atendida-e-desligada, sem resposta, ocupado ou falha se comportam
todos da mesma forma (a `<Response>` acaba). Como `human_handoff` é um nó terminal-de-turno sem
função de retomada (`resumeAfterTool` não se aplica a ele — ver o contrato acima), o runtime
(`workflowRuntimeService.ts`, Agente 04) também não tem hoje nenhum jeito de saber ou reagir ao
resultado real da transferência.

Isso é honesto e documentado (o ticket original,
`.agents/handoffs/onda-6/00-para-05-consumir-contratos-onda6.md`, tarefa 3, já antecipava esse
caso e pediu para não implementar a melhoria agora "a menos que seja trivial" — não é trivial:
precisa de uma rota nova + estado de retomada). Registro aqui para não deixar implícito.

## Arquivo(s) envolvido(s)

- `src/controllers/telephony.controller.ts` (Agente 05) — onde o `<Dial>` é emitido hoje.
- Possivelmente `src/services/telephonyService.ts` (Agente 05) e
  `src/services/workflowRuntimeService.ts` (Agente 04, se o runtime precisar aprender a retomar o
  grafo depois de uma transferência mal sucedida).

## Alteração necessária (proposta, não implementada)

Se isso virar prioridade de produto:

1. Adicionar `action` ao `<Dial>` apontando para uma nova rota (ex.:
   `/api/telephony/twilio/dial-status?sessionId=...`), com o Twilio enviando `DialCallStatus`
   (`completed`, `no-answer`, `busy`, `failed`, `canceled`) e `DialCallDuration` de volta.
2. Decidir o comportamento de produto para cada status — provavelmente: `completed` encerra a
   sessão normalmente (o humano atendeu); `no-answer`/`busy`/`failed`/`canceled` deveriam voltar
   para o fluxo original (ex.: uma mensagem de fallback + encerrar, ou retomar o grafo a partir de
   alguma aresta alternativa do próprio nó `human_handoff` — hoje ele tem `outputs === 0` no
   Studio, então isso também exigiria uma decisão de produto sobre se o nó ganha uma segunda saída
   "transferência falhou").
3. Se a decisão for "retomar o grafo", `workflowRuntimeService.ts` precisaria de uma função irmã de
   `resumeAfterTool` para `human_handoff` (hoje deliberadamente inexistente, conforme o contrato).
4. Registrar o resultado real da transferência no `CallLog`/telemetria (hoje `endCall` só vê o
   `CallStatus` do Twilio para a chamada como um todo, não o resultado específico do `<Dial>`
   interno).

## Teste esperado

Nenhum ainda — é uma proposta de extensão futura, não uma correção pendente. Se implementada,
precisaria de testes cobrindo os 5 valores de `DialCallStatus` e a decisão de produto escolhida
para cada um.

## Contexto adicional

Nenhuma obrigação de LGPD/segurança fica pendente por não implementar isso agora — a transferência
já disca o número real configurado no nó (`fallbackNumber`), com `timeout`/`record` corretos; o que
falta é só o retorno ao fluxo original / observabilidade fina do resultado da chamada bridged, uma
melhoria de UX de telefonia, não um bloqueador de segurança.
