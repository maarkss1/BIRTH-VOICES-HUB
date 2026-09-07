- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 6
- Status: aberto
- Prioridade: normal

## Problema

`.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md` propôs duas opções para
desbloquear o nó `voice` do Studio. O Coordenador decidiu, para a Onda 6
(`.agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md`, Tarefa 2), a **Opção 1**: TTS
nomeado do próprio Twilio (`Polly.<Nome>`/`Google.<nome>` via `<Say voice="...">`), não
ElevenLabs+`<Play>`. É um MVP — cobre menos configuração (ignora `stability`/`clarity`/
`speechRate`), mas não introduz `objectStorage.ts`/cache/latência de síntese extra nesta rodada.

Implementei o lado do runtime (`src/services/workflowRuntimeService.ts`, meu arquivo exclusivo):
`voice` deixou de ser bloqueado em `validateRuntimeCompatibility`/publish, e
`PreparedWorkflowTurn` ganhou um campo `voiceOverride`. **Não implementei o lado do Twilio** — é
seu domínio exclusivo (`telephony.controller.ts`).

## Arquivo(s) envolvido(s)

- `src/services/workflowRuntimeService.ts` (meu, já implementado — leitura para você).
- `src/controllers/telephony.controller.ts` (seu — precisa da alteração descrita abaixo).

## Contrato

`PreparedWorkflowTurn` (retornado por `prepareWorkflowTurn` e `resumeAfterTool`) ganhou:

```ts
voiceOverride?: { voice: string; language?: string };
```

- **Presente** apenas quando o nó `voice` mais próximo já atravessado no grafo tinha
  `provider`/`voiceId` reconhecidos como um nome de voz Twilio/Polly/Google já válido e
  documentado (ex.: `provider: 'Twilio', voiceId: 'Camila'` → `{ voice: 'Polly.Camila' }`). Nunca
  fabrico um mapeamento — se o `voiceId` configurado não estiver na tabela conhecida (o padrão do
  Studio, `provider: 'ElevenLabs', voiceId: 'Rachel_pt_BR'`, **não está**), o campo vem ausente.
- **Ausente** (undefined) sempre que não há um nó `voice` reconhecível no caminho, ou quando o
  mapeamento não é conhecido — nesse caso, use o comportamento atual (voz padrão fixa do Twilio),
  exatamente como hoje.
- `voice` é sempre uma string pronta para o atributo `voice` do TwiML `<Say>` (ex.:
  `"Polly.Camila"`, `"Polly.Vitoria"`, `"Google.pt-BR-Standard-A"`).
- `language`, quando presente, é o valor bruto configurado no nó `voice` (ex.: `"pt-BR"`) — mapeie
  para o atributo `language` do `<Say>` se fizer sentido no seu fluxo; se ausente, mantenha o que
  você já usa hoje (`{ language: 'pt-BR' }` fixo em `telephony.controller.ts`).

### O que fazer em `telephony.controller.ts`

Em cada `gather.say(...)`/`twiml.say(...)` que hoje usa `{ language: 'pt-BR' }` fixo, quando você
tiver um `PreparedWorkflowTurn`/`voiceOverride` disponível (após consumir o resultado de
`prepareWorkflowTurn`/`resumeAfterTool` em `telephonyService.ts` e propagá-lo até o controller):

```ts
const sayOptions = prepared.voiceOverride
  ? { language: prepared.voiceOverride.language ?? 'pt-BR', voice: prepared.voiceOverride.voice }
  : { language: 'pt-BR' };

gather.say(sayOptions, texto);
```

Decida você como propagar `voiceOverride` de `telephonyService.ts` até o controller (ex.: incluí-lo
no retorno de `handleTurn`/`startCall`) — não normatizo a forma exata porque isso já é o seu
contrato interno de `telephonyService.ts` ↔ `telephony.controller.ts`.

### Limitação conhecida: saudação inicial

`getWorkflowOpeningQuestion` (usado na saudação de abertura da chamada) retorna só uma `string`,
não um `PreparedWorkflowTurn` — não adicionei `voiceOverride` a esse caminho porque o ticket desta
rodada só pedia a extensão de `PreparedWorkflowTurn`. Se um nó `voice` estiver no segmento inicial
(`start -> voice -> ...`), a saudação de abertura ainda sai com a voz padrão do Twilio; apenas
turnos subsequentes (via `prepareWorkflowTurn`/`resumeAfterTool`) carregam `voiceOverride`. Se isso
for um problema de produto, abra um handoff descrevendo o caso de uso — é uma extensão pequena
(`initializeWorkflowRuntime` já grava o override resolvido em `state.variables` internamente; só
falta expor via `getWorkflowOpeningQuestion` ou uma função irmã).

## Teste esperado

Já cobri no meu lado (`src/services/workflowRuntimeService.knowledgeTool.test.ts`): um `voice` node
com `provider: 'Twilio', voiceId: 'Polly.Camila'` resolve `voiceOverride = { voice: 'Polly.Camila',
language: 'pt-BR' }`; o padrão do Studio (`ElevenLabs`/`Rachel_pt_BR`) nunca fabrica um
`voiceOverride`; o nó é passivo (nunca bloqueia sua própria aresta de saída).

Quando você consumir o campo em `telephony.controller.ts`, o teste esperado do seu lado é: um
workflow publicado com um nó `voice` configurado para um nome Twilio reconhecido produz um
`<Say voice="Polly.Camila">` real no TwiML de um turno subsequente; sem `voice` configurado (ou com
`ElevenLabs`), o TwiML mantém o `<Say>` padrão de hoje.

## Contexto adicional

`docs/patterns/workflow-execution-contract.md` §2 (subseção `voice`) e §3 (tabela de config) foram
atualizados com este contrato, incluindo a lista de nomes de voz reconhecidos hoje
(`KNOWN_TWILIO_VOICE_NAMES` em `workflowRuntimeService.ts`) — se o produto quiser reconhecer mais
vozes Twilio, é só estender essa tabela (nunca adivinhar um nome não documentado).
