- De: Agente 08 (QA, Testes e Segurança)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 3
- Status: resolvido
- Prioridade: normal

## Problema

Ao atualizar `__tests__/outboundCallService.test.ts` para refletir o contrato atual de
`initiateOutboundCall` (uso exclusivo de
`sessionRepository.createOutboundPhoneSessionIfNoneInFlight`), notei que
`sessionRepository.findActiveOutboundSessionToNumber` não tem mais nenhum chamador em `src/`
além da própria definição. Parece ser código morto deixado para trás pela migração para a
transação `Serializable` (ver `.agents/handoffs/onda-1/05-para-08-outboundCallService-test-update.md`).

Confirmado com:
```bash
grep -rln "findActiveOutboundSessionToNumber" --include=*.ts . | grep -v node_modules
# ./src/repositories/sessionRepository.ts (definição)
# __tests__/outboundCallService.test.ts (mock antigo, já removido nesta onda)
```

Não é um bloqueador de segurança/tenancy — apenas dívida técnica (função exportada sem uso real).

## Arquivo(s) envolvido(s)
- `src/repositories/sessionRepository.ts` (função `findActiveOutboundSessionToNumber`)

## Alteração necessária
Avaliar remoção da função (ou documentar por que deve permanecer, se houver uso planejado). Se
removida, confirmar que nenhum outro consumidor futuro (ex.: dashboard de telefonia) dependia dela
antes de apagar.

## Teste esperado
Se removida: `npm run typecheck` e `npm run test` continuam verdes sem nenhuma alteração em
`__tests__/**` (o arquivo de teste já não referencia mais essa função).

## Contexto adicional
Não é meu escopo alterar `src/repositories/**` fora de teste; registrando como handoff em vez de
editar diretamente.

## Resolução

Confirmado novamente com `grep -rn "findActiveOutboundSessionToNumber" .` (excluindo
`node_modules`/`.git`): o único chamador real era a própria definição; as demais ocorrências são
comentários (um comentário em `__tests__/outboundCallService.test.ts` explicando por que a função
não é mais mockada, e menções em `docs/release/PRODUCTION-READINESS.md` e nos próprios handoffs de
onda 1/3) — nenhum consumidor futuro real (dashboard de telefonia, endpoint de inspeção de status
etc.) foi encontrado referenciando-a em `src/`, `pages/`, `components/` ou `packages/`.

Decisão: removida a função `findActiveOutboundSessionToNumber` de
`src/repositories/sessionRepository.ts` (era um resquício da migração para a checagem
"check-then-act" transacional em `createOutboundPhoneSessionIfNoneInFlight`, que já cobre o caso de
uso real — evitar chamada dupla para o mesmo número — de forma atômica). O comentário que a
acompanhava especulava um "future status-inspection endpoint" que não existe hoje; manter função
morta exportada de um repository de domínio sensível (sessão de chamada) só aumenta a superfície
para reintrodução acidental do bug de race condition que a nova transação corrigiu, caso alguém a
redescubra e use por engano no caminho de discagem.

Validação:
- `npm run typecheck` — verde, sem erros.
- `npm run lint` — verde (0 erros; os únicos warnings restantes são pré-existentes, de `any` em
  arquivos de teste/mocks já catalogados em `TECHNICAL-DEBT-CHECKLIST.html`, não relacionados a esta
  mudança).
- `npm run test` — 333 passed | 1 skipped (52 arquivos), incluindo
  `__tests__/outboundCallService.test.ts`, sem qualquer alteração em `__tests__/**` (conforme
  esperado pelo handoff).
- `npm run build` — verde (frontend Vite + bundle `dist/server.cjs`).

Nenhum arquivo em `__tests__/**` foi tocado.
