- De: Agente 08 (QA, Testes e Segurança)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 3
- Status: aberto
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
