- De: Agente 00 (Coordenador)
- Para: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Onda: 5
- Status: aberto
- Prioridade: alta (maior gap de produto identificado em `ROADMAP.md` Fase 5)

## Problema

`src/services/workflowRuntimeService.ts` hoje só executa `start`, `llm`, `prompt`, `question`,
`condition`, `switch`, `memory`, `end` (`SUPPORTED_TYPES`) — os outros 4 tipos (`voice`,
`knowledge`, `tool`, `human_handoff`) ficam bloqueados em `publishWorkflow()`
(`UNSUPPORTED_REASON`), então um workflow que os usa nunca pode ser publicado. Ver
`docs/patterns/workflow-execution-contract.md` §2 para o contrato completo já formalizado.

**Nota de propriedade**: `workflowRuntimeService.ts` não estava formalmente atribuído no
`AGENTS.md` §11 até agora — acabei de formalizá-lo como seu (junto de `lib/voice-runtime/**`),
já que estender os tipos de nó é fundamentalmente trabalho de IA/Gateway. `telephonyService.ts`
(quem consome este arquivo para chamadas reais) continua exclusivo do Agente 05 — você não o edita.

## Escopo desta rodada: apenas `knowledge` e `tool`

Os outros dois (`voice`, `human_handoff`) dependem de mudanças reais na ponte de telefonia
(`telephonyService.ts`/Twilio, arquivo do Agente 05) — fora do seu escopo de edição direta. Não os
desbloqueie nesta rodada; se tiver uma proposta de design de como a interface entre os dois deveria
funcionar, registre como handoff `.agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md`
em vez de implementar.

### `knowledge`
Já existe infraestrutura sua para reaproveitar: `lib/voice-runtime/intelligence/
KnowledgeConfidenceEngine.ts` (`evaluateKnowledge(query, knowledge)`) e
`addKnowledgeDocumentHandler`/`Agent.config.knowledge` (array de documentos por agente, já
tenant-scoped via `updateAgentConfig(agentId, tenantId, ...)`). Não é uma busca vetorial real hoje
(é confiança por palavra-chave) — não fabricar uma capacidade de RAG melhor do que o motor
realmente tem; documentar honestamente a limitação atual (`AGENTS.md` §14) em vez de prometer
"busca semântica" que não existe.
- Adicionar `'knowledge'` a `SUPPORTED_TYPES`.
- No turno de execução, resolver `node.data.config.database` (hoje um nome de string livre — ver
  tabela em `docs/patterns/workflow-execution-contract.md` §3) contra os documentos de
  `Agent.config.knowledge` do agente/tenant da sessão, rodar `evaluateKnowledge`, injetar o
  resultado (ou "nenhum resultado com confiança suficiente", nunca fabricar um resultado) no
  próximo prompt/contexto do LLM.
- Atualizar `docs/patterns/workflow-execution-contract.md` §2 para refletir que `knowledge` saiu
  da lista de bloqueados, com a limitação de "confiança por palavra-chave, não RAG vetorial"
  documentada explicitamente ali.

### `tool`
Chamada de ferramenta HTTP externa (`node.data.config.method`/`endpoint`/`headers`/`bodyPayload`/
`timeoutMs`/`retryLimit`) — precisa da mesma defesa SSRF já estabelecida em
`webhook.worker.ts`/`src/validators/index.ts` (reusar `isPrivateOrReservedHost` de lá, nunca
reimplementar a lógica de allow/deny de IP). Timeout obrigatório (nunca esperar indefinidamente
numa chamada ao vivo). Falha da ferramenta (timeout, 4xx/5xx, URL bloqueada) não pode derrubar a
chamada telefônica em andamento — precisa de um caminho de fallback (variável de erro exposta pro
próximo nó `condition`, ou uma mensagem padrão), nunca uma exceção não tratada até
`telephonyService.ts`.
- Adicionar `'tool'` a `SUPPORTED_TYPES`.
- Atualizar `docs/patterns/workflow-execution-contract.md` §2 para refletir que `tool` saiu da
  lista de bloqueados, com a política de timeout/allowlist documentada.

## Arquivo(s) envolvido(s)
- `src/services/workflowRuntimeService.ts` (seu, ver nota de propriedade acima).
- `lib/voice-runtime/**` (seu).
- `src/validators/index.ts` — **não é seu** (dono a confirmar via `AGENTS.md` §11); reusar a
  função exportada, não editar o arquivo. Se precisar de algo novo lá, handoff, não edição direta.
- `docs/patterns/workflow-execution-contract.md` — **não é seu** (Agente 09, `docs/patterns/**`);
  se atualizar, deixe um handoff pedindo revisão/sincronia, ou confirme com Agente 09 se pode
  editar diretamente por já ser o autor técnico da mudança que o documento descreve (mesmo padrão
  já usado quando Agente 09 documentou o contrato original a pedido de Agente 07 na Onda 2).

## Teste esperado
- `validateRuntimeCompatibility` não rejeita mais um grafo que usa `knowledge`/`tool` (só
  `voice`/`human_handoff` continuam bloqueados).
- Execução de `knowledge`: com documento cadastrado e query correspondente, o resultado entra no
  contexto do LLM; sem correspondência com confiança suficiente, nenhum resultado fabricado é
  injetado.
- Execução de `tool`: URL privada/reservada é recusada antes da chamada (mesmo teste de
  `isSafeWebhookUrl`); timeout excedido não trava o turno; falha da ferramenta é recuperável (não
  derruba a sessão).
- Testes de tenant-isolation: dados de `knowledge` de um tenant nunca aparecem em execução de
  outro tenant.

## Contexto adicional
Item `[04]` do `ROADMAP.md` Fase 5, identificado como o maior gap de produto atual. Gate completo
(`typecheck`, `lint`, `vitest`, `build`) antes do push. Trabalhe em
`agente/04-motor-execucao-knowledge-tool` a partir de `integracao/onda-5`.
