- De: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 5
- Status: resolvido
- Prioridade: normal

## Problema

`initializeWorkflowRuntime(tenantId, initialVariables, agentId?)` (`src/services/
workflowRuntimeService.ts`) agora aceita um terceiro parâmetro opcional `agentId`, usado para
carregar `Agent.configuration.knowledge` (tenant-scoped via `agentRepository.getAgent(agentId,
tenantId)`) e alimentar a execução real do nó `knowledge` (ver
`docs/patterns/workflow-execution-contract.md` §2 e §3).

`telephonyService.ts` (seu arquivo, fora do meu escopo de edição) chama esta função em dois
lugares e **não passa `agentId` em nenhum dos dois**, embora o `Agent` já resolvido esteja em
escopo nos dois pontos:

- `startCall` (linha ~80): `initializeWorkflowRuntime(agent.tenantId, {...})` — `agent.id`
  disponível.
- `startOutboundCall` (linha ~150): `initializeWorkflowRuntime(session.tenantId, {...})` —
  `agent.id` disponível (mesmo `agent` resolvido logo acima via
  `agentRepository.findAgentById(session.agentId)`).

Sem esse terceiro argumento, `knowledge` continua **honestamente funcional mas sempre sem
documentos** em produção: `applyKnowledgeNode` roda normalmente, mas com zero documentos
disponíveis, então toda consulta cai no caminho "nenhum resultado com confiança suficiente" (nunca
um crash, nunca um resultado fabricado — ver `AGENTS.md` §14). A funcionalidade só fica realmente
"viva" (usando os documentos reais cadastrados via `addKnowledgeDocumentHandler`) depois que este
handoff for aplicado.

## Arquivo(s) envolvido(s)
- `src/services/telephonyService.ts` (seu, exclusivo — eu não edito).
- `src/services/workflowRuntimeService.ts` (meu — já pronto, não precisa de mudança adicional).

## Alteração necessária

Duas mudanças de uma linha cada, puramente aditivas (o parâmetro já é opcional, então nada quebra
se você decidir não aplicar isso nesta rodada):

```diff
-  const workflow = await initializeWorkflowRuntime(agent.tenantId, {
+  const workflow = await initializeWorkflowRuntime(agent.tenantId, {
     direction: 'inbound',
     from: params.from,
     to: params.to,
-  });
+  }, agent.id);
```

(em `startCall`, e o equivalente em `startOutboundCall` usando o `agent` já resolvido ali).

## Teste esperado

- Um workflow ativo com um nó `knowledge` cujo agente da sessão tem
  `Agent.configuration.knowledge` populado passa a retornar o snippet real (não mais "nenhum
  resultado") quando a query do usuário casa com uma palavra-chave cadastrada.
- Isolamento de tenant continua garantido — `agentRepository.getAgent` já falha fechado
  (retorna `null`) se `agent.id` não pertencer a `agent.tenantId`/`session.tenantId`, então não há
  novo risco de vazamento introduzido por esta mudança.
- Testes existentes de `telephonyService.test.ts` (mock de `initializeWorkflowRuntime`) não
  precisam mudar — o mock não valida argumentos por padrão a menos que você adicione uma
  asserção nova.

## Contexto adicional

Ver `.agents/handoffs/onda-5/00-para-04-motor-execucao-knowledge-tool.md` (tarefa original) e
`docs/patterns/workflow-execution-contract.md` §2/§3 (contrato atualizado nesta rodada). Prioridade
`normal`, não `bloqueador`: sem esta mudança o runtime não fabrica nada e não quebra nenhuma
chamada — apenas não usa a base de conhecimento real ainda.

## Resolução

Aplicadas as duas mudanças de uma linha exatamente como propostas, em `src/services/
telephonyService.ts`:

- `startCall` (agora em torno da linha 80): `initializeWorkflowRuntime(agent.tenantId, { ... },
  agent.id)` — `agent` já resolvido via `resolveAgent(params.to)` no topo da função.
- `startOutboundCall` (agora em torno da linha 150): `initializeWorkflowRuntime(session.tenantId,
  { ... }, agent.id)` — `agent` já resolvido via `agentRepository.findAgentById(session.agentId)`
  logo acima.

Nenhum outro comportamento alterado; o parâmetro é opcional e puramente aditivo. Gate completo
(`typecheck`, `lint`, `vitest run`, `build`) executado na branch `agente/05-pass-agentid` após a
mudança — ver resumo do Agente 05 no handoff de conclusão da Onda 5 / mensagem final da sessão para
o resultado detalhado. `__tests__/telephonyService.test.ts` (propriedade do Agente 08) não precisou
de nenhuma alteração — o mock de `initializeWorkflowRuntime` não valida argumentos por padrão, como
previsto neste handoff.
