- De: Agente 07 (Studio, Workflows e Colaboração)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 5
- Status: aberto
- Prioridade: alto

## Problema

Implementei o versionamento/rollback de publish pedido em
`.agents/handoffs/onda-5/00-para-07-workflow-versionamento-rollback.md`: `publishWorkflow()`
(`src/services/workflowService.ts`, meu arquivo) agora, antes de ativar o workflow, arquiva o
conteúdo atual (pré-publish) em `metadata.publishedVersions` e incrementa `Workflow.version`. Isso
muda os argumentos passados para `workflowRepository.upsertWorkflow(...)` no caminho de sucesso: de
`{ status: 'active' }` para `{ status: 'active', version: existing.version + 1, metadata }`.

`__tests__/workflowPublishGate.test.ts` (seu arquivo, `AGENTS.md` §11 — não posso editá-lo) tem uma
asserção de igualdade exata que quebrou:

```
FAIL  __tests__/workflowPublishGate.test.ts > workflow publish production-runtime gate > activates a graph that is structurally valid and executable by the phone runtime
AssertionError: expected "vi.fn()" to be called with arguments: [ 'tenant-1', 'user-1', 'wf-1', …(1) ]
```

Todos os outros 482 testes do repositório passam (incluindo os 9 novos testes que escrevi em
`src/services/workflowVersioning.test.ts` cobrindo o comportamento de archive/rollback — ver esse
handoff para o detalhe do que ficou coberto). Este é o único teste vermelho no gate completo
(`npm run typecheck && npm run lint && npx vitest run && npm run build`), e é exatamente esperado
dado a mudança de contrato acima — não é uma regressão não relacionada.

## Arquivo(s) envolvido(s)
- `__tests__/workflowPublishGate.test.ts` (seu, linha ~80).

## Alteração necessária

A asserção:
```ts
expect(mockUpsert).toHaveBeenCalledWith('tenant-1', 'user-1', 'wf-1', { status: 'active' });
```

precisa virar algo que tolere os novos campos, por exemplo:
```ts
expect(mockUpsert).toHaveBeenCalledWith('tenant-1', 'user-1', 'wf-1', expect.objectContaining({
  status: 'active',
  version: 5, // a fixture `workflow(nodes, edges)` no topo do arquivo usa version: 4
}));
```
(o helper `workflow()` no topo do arquivo fixa `version: 4`, então o valor esperado pós-publish é
`5`). Não precisa validar o conteúdo de `metadata.publishedVersions` aqui — isso já está coberto
end-to-end em `src/services/workflowVersioning.test.ts`; um `objectContaining` basta para este
teste continuar validando o que ele sempre validou (o gate de runtime-compat permite a
ativação).

As outras duas asserções negativas do arquivo (`not.toHaveBeenCalledWith(..., { status: 'active' })`
nos testes de rejeição) continuam passando sem alteração — a rejeição nunca chama `upsertWorkflow`.

## Teste esperado
- `npx vitest run __tests__/workflowPublishGate.test.ts` verde após o ajuste.
- Gate completo do repositório (`typecheck`/`lint`/`vitest`/`build`) 100% verde na branch de
  integração após este ajuste ser mesclado junto com `agente/07-workflow-versionamento`.

## Contexto adicional
Não é um bypass de validação nem uma regressão de segurança — o `ValidationEngine` +
`validateRuntimeCompatibility` continuam sendo o único portão para `status: 'active'`, só o
formato dos argumentos passados ao repository mudou. Ver
`.agents/handoffs/onda-5/07-para-01-schema-workflow-version.md` para o racional completo da
mudança (arquivamento de versão publicada) e `src/services/workflowService.ts` (comentários em
`publishWorkflow`/`archivePublishedVersion`) para o comportamento exato implementado.
