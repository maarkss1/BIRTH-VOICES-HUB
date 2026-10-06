- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

`tool` (chamada HTTP externa configurada no nó Studio) agora executa de verdade — mas **só no
início da chamada**, entre `start` e a primeira interação (`prompt`/`question`). Um nó `tool`
alcançado no meio da conversa (ou seja, através de `prepareWorkflowTurn`, chamado a cada turno em
`telephonyService.ts`) não faz a chamada HTTP real: ele cai direto no caminho de fallback
(`tool_ok=false`, `tool_error='tool_unavailable_mid_call'`) e segue o grafo normalmente.

Isso é intencional nesta rodada, não um bug esquecido — está documentado no comment de
`applyToolFallback` em `src/services/workflowRuntimeService.ts`. A causa raiz é um conflito de
contrato real, não uma escolha de conveniência:

1. `telephonyService.ts` chama `prepareWorkflowTurn(metadata.workflow, params.speechResult)`
   **sem `await`** (é uma função síncrona hoje).
2. `__tests__/workflowRuntimeService.test.ts` (Agente 08, fora do meu escopo de edição) também
   chama `prepareWorkflowTurn(...)` de forma síncrona e verifica o valor de retorno na mesma
   linha.
3. Uma chamada HTTP real exige `await`. Transformar `prepareWorkflowTurn` numa função `async`
   quebraria (1) e (2) simultaneamente — ambos fora do meu escopo de edição direta.
4. A alternativa de "bloquear o event loop" para simular sincronismo (`Atomics.wait`,
   `execFileSync` chamando curl, etc.) foi descartada deliberadamente: numa plataforma que se
   propõe "alto volume", isso travaria **todas** as chamadas concorrentes durante a latência da
   ferramenta externa — pior do que não suportar o caso.

Dado isso, hoje: `tool` funciona de verdade apenas no segmento determinístico antes da primeira
interação (ex.: `start -> tool -> prompt`, útil para "buscar dados do contato antes de
cumprimentar"). `tool` no meio da conversa (ex.: `start -> question -> tool -> prompt`, o caso
provavelmente mais valioso na prática) degrada com segurança para o fallback, sem nunca derrubar a
chamada — mas também sem nunca chamar a URL configurada.

## Arquivo(s) envolvido(s)
- `src/services/telephonyService.ts` (seu, exclusivo).
- `src/services/workflowRuntimeService.ts` (meu).
- `__tests__/workflowRuntimeService.test.ts` / `__tests__/telephonyService.test.ts` (Agente 08).

## Alteração necessária (proposta, não uma tarefa fechada)

Não implementei isto porque a mudança cruza três donos de arquivo diferentes (05, 08 e eu) e
precisa de acordo prévio (`AGENTS.md` §12 regra 4) antes de qualquer edição. Duas direções
possíveis, para vocês avaliarem com o Coordenador:

**Opção A — `prepareWorkflowTurn` vira async.** Exige: (a) `telephonyService.ts` passar a dar
`await` na chamada (mudança pequena, 1 linha, mas sua), e (b) Agente 08 atualizar as ~3 asserções
síncronas em `__tests__/workflowRuntimeService.test.ts` para `await`. Mais simples
conceitualmente, mas é uma mudança de contrato "quebra tudo de uma vez".

**Opção B — modelo de continuação assíncrona.** `prepareWorkflowTurn` continua síncrona e devolve
um novo modo (`mode: 'tool_pending'`) quando o próximo nó é `tool`; `telephonyService.ts` passa a
tratar esse modo chamando um novo `resumeAfterTool(state, node): Promise<PreparedWorkflowTurn>`
(que eu forneceria) antes de responder ao Twilio. Não quebra os testes síncronos existentes (eles
simplesmente não cobrem o novo modo), mas adiciona um branch novo em `telephonyService.ts` e em
qualquer teste que exercite esse caminho.

Não tenho preferência forte — quem entende melhor o orçamento de latência real do webhook do
Twilio (`startCall`/`handleTurn`) deveria decidir, daí o handoff para vocês em vez de eu escolher
unilateralmente.

## Teste esperado

- Qualquer que seja a direção escolhida: falha da ferramenta (timeout, 4xx/5xx, URL bloqueada)
  continua nunca derrubando a chamada em andamento — mesmo contrato de fallback já garantido hoje.
- Um workflow `start -> question -> tool -> prompt` publicado consegue, de fato, chamar a URL
  configurada usando uma variável coletada na `question` anterior (hoje isso não acontece — o
  `tool` cai direto no fallback).

## Contexto adicional

Ver `docs/patterns/workflow-execution-contract.md` §2 (seção "Execução do nó `tool`") para o
estado atual documentado, e `src/services/workflowRuntimeService.ts` (`advanceUntilInteraction`
vs. `advanceUntilInteractionAsync`) para os dois caminhos de execução hoje existentes.
