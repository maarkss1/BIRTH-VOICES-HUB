- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

`voice` e `human_handoff` continuam na lista `UNSUPPORTED_REASON` de
`src/services/workflowRuntimeService.ts` — fora do escopo desta rodada (ver
`.agents/handoffs/onda-5/00-para-04-motor-execucao-knowledge-tool.md`, que explicitamente pediu
para eu **não** desbloquear esses dois e registrar uma proposta de design em vez de implementar).
Ambos dependem de `telephonyService.ts`/`telephony.controller.ts` (seus, exclusivos) porque a
única forma de agir sobre eles é gerando TwiML diferente do `<Say>`/`<Gather>` padrão hoje
produzido em `telephony.controller.ts`.

## Arquivo(s) envolvido(s)
- `src/services/telephonyService.ts`, `src/controllers/telephony.controller.ts` (seus).
- `src/services/workflowRuntimeService.ts` (meu — hoje devolve `mode: 'llm' | 'direct'`).
- `lib/voice-runtime/providers/ElevenLabsProvider.ts`, `TwilioProvider.ts` (meus, já existem).

## Alteração necessária (proposta de design, não implementação)

### `voice` (seleção de voz/TTS)

Hoje `telephony.controller.ts` sempre usa `twiml.say({ language: 'pt-BR' }, texto)` — a voz padrão
do Twilio, não a voz/estabilidade/clareza configurada no nó `voice` do Studio
(`provider`/`voiceId`/`stability`/`clarity`/`speechRate` — ver
`docs/patterns/workflow-execution-contract.md` §3).

Duas rotas possíveis:

1. **TTS do próprio Twilio com voz nomeada**: `twiml.say({ voice: '<voz Polly/Amazon>',
   language: 'pt-BR' }, texto)`. Simples, sem custo extra de provedor, mas não usa
   `ElevenLabsProvider.ts` (que já existe em `lib/voice-runtime/providers/`) nem respeita
   `stability`/`clarity`/`speechRate` do nó — cobre só parte da configuração.
2. **Áudio pré-gerado via ElevenLabs + `<Play>`**: `ElevenLabsProvider.ts` sintetiza o áudio da
   resposta (usando `voiceId`/`stability`/`clarity`/`speechRate` reais do nó), o runtime devolve a
   URL/buffer do áudio gerado em vez de texto puro, e `telephony.controller.ts` usa `twiml.play(url)`
   no lugar de `twiml.say(...)`. Cobre a configuração completa do nó, mas adiciona latência de
   síntese (mitigável com cache por texto+voz) e exige um destino público/assinado para o áudio
   (provavelmente `src/infrastructure/objectStorage.ts`, do Agente 06) antes do `<Play>`.

Do lado do runtime, eu proporia estender `PreparedWorkflowTurn` com um campo opcional
`voiceOverride?: { provider: RuntimeProvider; voiceId: string; stability?: number; clarity?:
number; speechRate?: number }` extraído do nó `voice` mais próximo antes da próxima interação —
puramente aditivo, sem quebrar o contrato atual. A decisão de qual das duas rotas acima seguir (e
como orquestrar objectStorage/cache) é sua, dado que a geração de TwiML e o pipeline de áudio de
produção são seus.

### `human_handoff` (transferência para humano)

Hoje não existe nenhum caminho de `<Dial>` para um número humano real. O nó `human_handoff`
(`department`/`fallbackNumber`/`ringTimeoutSec`/`recordCall`/`transferMessage`) precisaria que
`telephony.controller.ts`, ao ver `mode: 'transfer'` (novo modo proposto em
`PreparedWorkflowTurn`), gere:

```
twiml.say({ language: 'pt-BR' }, transferMessage);
twiml.dial({ timeout: ringTimeoutSec, record: recordCall ? 'record-from-answer' : undefined },
  numeroResolvidoPeloDepartment);
```

Pontos em aberto que só vocês (ou o Coordenador, cruzando com Produto/02) conseguem decidir:

- **Resolução de `department` -> número real**: hoje não existe um cadastro de departamento ->
  ramal/número no schema (`prisma/schema.prisma`, Agente 01). Precisaria de handoff adicional para
  01 se a direção escolhida exigir um novo campo/tabela.
- **O que acontece se a transferência falhar/não atender** (`fallbackNumber` cobre isso, mas o
  comportamento de retorno ao fluxo original — se houver — precisa ser definido: a ligação termina,
  ou volta para o workflow?).
- **`recordCall`** cruza com a política de retenção/consentimento de gravação que já existe para
  `CallLog` (sua responsabilidade, `AGENTS.md` §16).

Do lado do runtime, a mesma extensão de `PreparedWorkflowTurn` (`mode: 'transfer'` com os campos
do nó já resolvidos/validados) é o que eu forneceria; a orquestração de `<Dial>` e a decisão de
schema ficam com vocês/01.

## Teste esperado

Nenhum teste esperado nesta rodada — este handoff é uma proposta de design para uma rodada futura,
não uma tarefa com critério de aceite fechado. Quando a direção for decidida, o dono do lado do
runtime (`PreparedWorkflowTurn`, `advanceUntilInteraction`) sou eu; abram um handoff de volta
(`05-para-04-...`) descrevendo o contrato final acordado antes de eu implementar, seguindo o mesmo
padrão usado para `knowledge`/`tool` nesta rodada.

## Contexto adicional

Ver `docs/patterns/workflow-execution-contract.md` §2/§3 para a tabela de campos de `voice` e
`human_handoff`, e `.agents/handoffs/onda-5/00-para-04-motor-execucao-knowledge-tool.md` para a
tarefa original que definiu o escopo desta rodada como apenas `knowledge`/`tool`.
