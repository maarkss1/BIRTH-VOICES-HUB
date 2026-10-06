- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 5
- Status: resolvido
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

## Resolução

Aplicada exatamente a correção de uma linha sugerida em "Alteração necessária"
(`__tests__/telephonyService.test.ts`, teste `creates a phone session scoped to the resolved
agent tenant`, linha ~173): a asserção de igualdade exata de argumentos ganhou o terceiro
argumento posicional:

```ts
expect(mockInitializeWorkflow).toHaveBeenCalledWith(
  'tenant-1',
  expect.objectContaining({ direction: 'inbound' }),
  'agent-1',
);
```

Também aproveitei a sugestão discricionária do handoff ("vale conferir se convém adicionar
cobertura equivalente lá também") e adicionei a mesma asserção ao teste `records the greeting as
the first transcript turn and backfills the CallSid` de `describe('telephonyService.
startOutboundCall')`, já que a versão de `telephonyService.ts` em `agente/05-pass-agentid` também
passa `agent.id` como terceiro argumento em `startOutboundCall`:

```ts
expect(mockInitializeWorkflow).toHaveBeenCalledWith(
  'tenant-1',
  expect.objectContaining({ direction: 'outbound' }),
  'agent-1',
);
```

**Validação em duas branches**, seguindo o mesmo protocolo já estabelecido pelo handoff irmão
`.agents/handoffs/onda-5/07-para-08-publishgate-teste-assertion-desatualizada.md`:

1. **Nesta branch (`agente/08-fix-telephonyservice-agentid-assertion`, criada a partir de
   `origin/integracao/onda-5`, sem o merge de `agente/05-pass-agentid`)**: como esperado —
   diferente do que a asserção original desta tarefa presumia ("não quebra nada mesmo antes da
   mudança de 05 chegar") — as duas asserções com o terceiro argumento posicional `'agent-1'`
   **falham** isoladamente aqui, porque `toHaveBeenCalledWith` compara a lista de argumentos por
   igualdade estrutural completa (incluindo o comprimento do array), e `startCall`/
   `startOutboundCall` nesta branch ainda chamam `initializeWorkflowRuntime` com apenas 2
   argumentos (o terceiro `agentId` só existe após o merge de `agente/05-pass-agentid`). Isso é
   estruturalmente diferente do caso do Agente 07 (lá o `expect.objectContaining` tolera chaves
   extras no valor recebido, mas aqui é uma posição a mais na lista de argumentos, não uma chave
   extra em objeto — `objectContaining` não se aplica a arrays de argumentos). Evidência: `npx
   vitest run __tests__/telephonyService.test.ts` → `2 failed | 18 passed` nesta branch isolada;
   `npx vitest run` completo → `2 failed | 558 passed | 1 skipped`; `typecheck`, `lint` (0 erros,
   só os warnings `any` pré-existentes) e `build` ficam 100% verdes.
2. **Clone de verificação em `/tmp` com `origin/agente/05-pass-agentid` mesclada** (merge sem
   conflitos) **+ o mesmo patch de teste aplicado**: `npx vitest run
   __tests__/telephonyService.test.ts` → `20 passed`, confirmando que a correção é exatamente a
   necessária para o estado pós-merge (clone descartado depois, nenhuma mudança ficou fora deste
   worktree).

Ou seja: a correção está correta e é exatamente a solicitada; o gate 100% verde citado em "Teste
esperado" se confirma **na branch de integração após o merge de `agente/05-pass-agentid` junto
com esta branch** — não antes disso. Reportado ao coordenador para que o merge de ambas as
branches na integração seja tratado como uma unidade (não aprovar 08 sem 05, ou vice-versa, nesta
onda), corrigindo a expectativa de que o teste passaria isoladamente antes do merge de 05.
