- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

Apliquei `.agents/handoffs/onda-5/04-para-05-pass-agentid-to-workflow-runtime.md`: em
`src/services/telephonyService.ts` (meu, exclusivo), `startCall` e `startOutboundCall` agora
passam o terceiro argumento `agentId` para `initializeWorkflowRuntime(tenantId, initialVariables,
agentId?)`, conforme o novo parâmetro opcional aditivo em `workflowRuntimeService.ts` (Agente 04).

Isso quebrou uma asserção em `__tests__/telephonyService.test.ts` (seu, exclusivo — eu não
edito), porque ela usa `toHaveBeenCalledWith` com a lista exata de argumentos (Vitest falha
quando a chamada real tem mais argumentos do que os esperados, mesmo que os extras sejam
"corretos"):

```
FAIL  __tests__/telephonyService.test.ts > telephonyService.startCall > creates a phone session scoped to the resolved agent tenant
AssertionError: expected "vi.fn()" to be called with arguments: [ 'tenant-1', ObjectContaining{…} ]
Received:
  [ "tenant-1", { direction: "inbound", from: "+1000", to: "+15551234567" }, "agent-1" ]
```

Todos os demais 553 testes + 1 skipped passam normalmente; este é o único que quebra por causa da
minha mudança.

## Arquivo(s) envolvido(s)
- `__tests__/telephonyService.test.ts` (seu, exclusivo).

## Alteração necessária

Linha 173 (dentro de `describe('telephonyService.startCall')` → teste `'creates a phone session
scoped to the resolved agent tenant'`):

```diff
-    expect(mockInitializeWorkflow).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ direction: 'inbound' }));
+    expect(mockInitializeWorkflow).toHaveBeenCalledWith(
+      'tenant-1',
+      expect.objectContaining({ direction: 'inbound' }),
+      'agent-1',
+    );
```

`'agent-1'` é o `id` default retornado pela factory local `agent()` (linha ~69 do mesmo arquivo),
já usado nesse teste via `mockFindByPhone.mockResolvedValue(agent({ configuration: { greeting:
'Oi, tudo bem?' } }))`.

Não há nenhuma outra ocorrência de `mockInitializeWorkflow` com `toHaveBeenCalledWith` neste
arquivo (confirmado via grep) — o teste de `startOutboundCall` (se cobrir
`initializeWorkflowRuntime`) não faz essa asserção estrita hoje, então não deveria quebrar; vale
conferir se convém adicionar cobertura equivalente lá também, a critério seu.

## Teste esperado

Após o ajuste, `npx vitest run __tests__/telephonyService.test.ts` (ou a suíte completa) deve
passar com 0 falhas.

## Contexto adicional

Mudança de origem: `.agents/handoffs/onda-5/04-para-05-pass-agentid-to-workflow-runtime.md`
(resolvido). O parâmetro `agentId` é opcional e aditivo — comportamento de produção não muda para
chamadas que não usam nós `knowledge`; o único efeito colateral foi este teste com asserção de
argumentos exata.
