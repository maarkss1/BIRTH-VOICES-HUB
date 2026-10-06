- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 00 (Coordenador)
- Onda: 6 (rodada 2)
- Status: resolvido
- Prioridade: normal

## Problema

Resumo de execução da tarefa em `.agents/handoffs/onda-6/00-para-04-human-handoff-mvp.md`:
desbloquear `human_handoff` no runtime como MVP que disca diretamente o `fallbackNumber` literal já
configurado no nó do Studio, sem lookup departamento->número e sem mudança de schema.

## O que foi feito

Em `src/services/workflowRuntimeService.ts` (meu, exclusivo):

- `human_handoff` removido de `UNSUPPORTED_REASON` e adicionado a `SUPPORTED_TYPES` — nenhum tipo
  de nó do Studio fica mais bloqueado pelo gate de capacidade do runtime.
- `PreparedWorkflowTurn.mode` ganhou `'transfer'` (ao lado de `'llm' | 'direct' | 'tool_pending'`) e
  um novo campo `transferDetails?: { to, timeoutSec, record, message, department? }`, resolvido do
  nó `human_handoff` mais próximo alcançado:
  - `to` = `config.fallbackNumber` — **obrigatório**; se ausente/vazio, `mode: 'transfer'` nunca é
    produzido. O nó degrada como um `tool` sem sucesso (log de aviso, `variables.handoff_ok =
    'false'` / `handoff_error = 'fallback_number_missing'`) e a caminhada continua pela aresta de
    saída padrão — nunca inventei um número.
  - `timeoutSec` = `config.ringTimeoutSec`, default 30.
  - `record` = truthy-parse de `config.recordCall` (Studio grava como string).
  - `message` = `config.transferMessage`, com default genérico honesto.
  - `department` = `config.department`, incluído só como rótulo/observabilidade — nunca resolvido
    para um número, exatamente como pedido no ticket.
- `human_handoff` é terminal-de-turno como `prompt`/`question`/`tool`: a caminhada síncrona
  (`advanceUntilInteraction`) para nele e devolve `mode: 'transfer'`. Diferente de `tool`, não há
  função de retomada — o nó tem `outputs: 0` no próprio registro do Studio.
- Refatorei o antigo helper `isToolPending` (usado em 6 pontos) para um `pendingInterruptTurn`
  unificado que cobre tanto `tool_pending` quanto `transfer` num só lugar, para garantir que um
  `human_handoff` alcançado logo depois de um `tool`/`question`/`prompt` nunca seja perdido em
  nenhum dos pontos de checagem.
- Ambos os caminhantes de grafo (`advanceUntilInteraction` síncrono e
  `advanceUntilInteractionAsync` do segmento inicial) tratam `human_handoff` de forma consistente:
  param quando há `fallbackNumber` válido, pulam com aviso quando não há.

Documentação: `docs/patterns/workflow-execution-contract.md` §2 (nova subseção `human_handoff`
execution semantics), §3 (tabela de config, novos marcadores §/§§) e §5 (cobertura de teste e nova
seção "Known cross-agent test debt (rodada 2)") atualizados.

Testes: 5 novos testes em `src/services/workflowRuntimeService.knowledgeTool.test.ts` (meu arquivo
co-localizado) cobrindo exatamente o cenário do ticket (`start -> question -> human_handoff ->
end`), defaults, o caso `fallbackNumber` ausente, o nó no segmento inicial, e uma cadeia `tool ->
human_handoff`. Também atualizei o teste que antes verificava "`human_handoff` continua bloqueado"
(agora testa o oposto: aceito no publish, degrada em runtime).

Handoff de saída para o Agente 05:
`.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md` (mesmo padrão dos dois contratos
da rodada 1).

## Desvio: 4 testes fora da minha propriedade quebraram de novo

`__tests__/workflowRuntimeService.test.ts`, `__tests__/workflowPublishGate.test.ts` (Agente 08) e
`src/services/workflowVersioning.test.ts` (Agente 07) usavam `human_handoff` como exemplo de
"qualquer nó não suportado" — exatamente o exemplo para o qual vocês trocaram esses fixtures na
rodada 1, quando `voice` deixou de servir para isso. Desbloquear `human_handoff` agora quebra os
mesmos 4 testes pela mesma razão estrutural: **não sobra mais nenhum tipo de nó real do Studio que
o runtime não execute**, então esse padrão de fixture não tem mais um alvo estável para apontar.

Escrevi dois handoffs sugerindo trocar o exemplo por um **tipo de nó sintético/inexistente**
(`'este_tipo_nao_existe' as unknown as NodeType`) em vez de outro nó de domínio real, para que o
teste pare de quebrar a cada onda que desbloqueia mais um tipo:

- `.agents/handoffs/onda-6/04-para-07-human-handoff-fixture-desatualizada.md`
- `.agents/handoffs/onda-6/04-para-08-human-handoff-fixtures-desatualizadas.md`

Não editei nenhum dos três arquivos (fora da minha propriedade, `AGENTS.md` §11/§12).

## Resultado da validação (gate)

- `npx prisma generate` — OK.
- `npm run typecheck` — limpo, 0 erros.
- `npm run lint` — 0 erros (134 warnings pré-existentes de `no-explicit-any` em mocks de teste de
  outros domínios, já catalogados em `TECHNICAL-DEBT-CHECKLIST.html`; nenhum warning novo em
  `workflowRuntimeService.ts` ou no meu arquivo de teste).
- `npx vitest run` — **596 passam, 4 falham** (exatamente os 4 testes descritos acima, em arquivos
  fora da minha propriedade). Todos os 22 testes do meu arquivo
  (`src/services/workflowRuntimeService.knowledgeTool.test.ts`) passam.
- `npm run build` — OK (frontend + servidor).

Não considero isso "gate verde" no sentido estrito pedido no ticket, mas também não posso corrigir
os 3 arquivos de teste (propriedade de 07/08) sem violar `AGENTS.md` §11/§12 — segui o protocolo de
conflito (produzir handoff acionável com problema, arquivo, alteração necessária e teste esperado)
em vez de editar arquivo alheio ou de esconder a quebra.

## Contexto adicional

Nenhum arquivo fora de `src/services/workflowRuntimeService.ts`,
`src/services/workflowRuntimeService.knowledgeTool.test.ts` e
`docs/patterns/workflow-execution-contract.md` foi editado (mais os handoffs em
`.agents/handoffs/onda-6/**`, que são novos arquivos meus).
