- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 00 (Coordenador)
- Onda: 6
- Status: aberto
- Prioridade: alto

## Problema

Resumo das 3 tarefas do ticket (`.agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md`)
e o único desvio real: a Tarefa 2 (desbloquear `voice`) tem um raio de impacto maior do que o
ticket antecipava — três fixtures de teste em `__tests__/**` (Agente 08) e um teste co-localizado
de `workflowService.ts` (Agente 07) usavam `voice` como "exemplo de nó não suportado" para testar o
gate de capacidade em si, e passam a falhar depois da minha mudança. Não editei nenhum desses
arquivos (não são meus) — documentei e apontei a correção de uma linha em handoffs dedicados.

## Arquivo(s) envolvido(s)

Meus (editados):
- `src/services/workflowRuntimeService.ts` — Tarefas 1 e 2.
- `src/services/workflowRuntimeService.knowledgeTool.test.ts` — testes das Tarefas 1 e 2.
- `src/controllers/knowledge.controller.ts` — Tarefa 3.
- `src/controllers/knowledge.controller.test.ts` (novo) — testes da Tarefa 3.
- `src/routes/agent.routes.ts` — nova rota da Tarefa 3.
- `docs/patterns/workflow-execution-contract.md` — atualizado (mesmo precedente da Onda 5: autor da
  mudança de runtime atualiza a doc).

Não editados (fora do meu domínio, apenas leitura/handoff):
- `__tests__/workflowRuntimeService.test.ts`, `__tests__/workflowPublishGate.test.ts` (Agente 08).
- `src/services/workflowVersioning.test.ts` (Agente 07, por co-localização).
- `src/services/telephonyService.ts`, `src/controllers/telephony.controller.ts` (Agente 05).

## Alteração necessária

Nenhuma de minha parte — as 3 tarefas do ticket estão implementadas e testadas. O que falta para o
gate da Onda 6 ficar 100% verde depende de outros agentes:

1. Agente 08 aplicar a correção descrita em
   `.agents/handoffs/onda-6/04-para-08-voice-node-fixtures-desatualizadas.md` (troca de `voice` por
   `human_handoff` em 2 testes).
2. Agente 07 aplicar a correção descrita em
   `.agents/handoffs/onda-6/04-para-07-voice-node-fixture-desatualizada.md` (mesma troca, 1
   arquivo, 2 testes).
3. Agente 05 consumir os dois contratos que deixei prontos
   (`04-para-05-tool-pending-contrato.md` e `04-para-05-voiceOverride-contrato.md`) — combinado
   pelo Coordenador para a próxima rodada da Onda 6, conforme o ticket original já previa.

## Teste esperado

Estado atual de `npx vitest run` na minha branch, isolada:

```
Test Files  3 failed | 75 passed | 1 skipped (79)
     Tests  4 failed | 573 passed | 1 skipped (578)
```

As 4 falhas são exatamente as 3 asserções de "voice como exemplo de nó não suportado" (2 em
`__tests__/workflowRuntimeService.test.ts`+`__tests__/workflowPublishGate.test.ts`, 2 em
`src/services/workflowVersioning.test.ts` — total 4 `it` blocks) descritas acima — nenhuma outra
falha, nenhuma flakiness. Todos os testes que eu escrevi/alterei (17 em
`workflowRuntimeService.knowledgeTool.test.ts`, 7 em `knowledge.controller.test.ts`) passam.

`npx prisma generate`, `npm run typecheck` e `npm run lint` (0 erros, só os 134 warnings de `any`
em mocks de teste já catalogados em `TECHNICAL-DEBT-CHECKLIST.html`, nenhum deles em arquivo meu) e
`npm run build` — todos limpos (evidência completa na mensagem final ao usuário/log da sessão).

## Contexto adicional

Nenhum dado fabricado (AGENTS.md §14): o mapeamento de voz Twilio (`KNOWN_TWILIO_VOICE_NAMES` em
`workflowRuntimeService.ts`) só reconhece nomes de voz Twilio/Polly/Google genuínos e documentados;
o padrão do Studio (ElevenLabs/`Rachel_pt_BR`) nunca produz um `voiceOverride` fabricado — o campo
fica ausente, como exigido. Nenhuma validação de segurança telefonia/RBAC/tenancy foi tocada.
Nenhuma migração/schema Prisma alterada.

Se preferir que eu mesmo aplique a correção nos 3 arquivos de teste de outros agentes (mudança
trivial de 1 linha cada) em vez de esperar 07/08, posso fazer mediante autorização explícita sua —
não fiz por conta própria porque `AGENTS.md` §12.1 é claro ("o agente que não é dono do arquivo não
faz a alteração").
