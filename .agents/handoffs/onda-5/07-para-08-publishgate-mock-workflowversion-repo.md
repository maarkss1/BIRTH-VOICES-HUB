- De: Agente 07 (Studio, Workflows e Colaboração)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 5
- Status: resolvido
- Prioridade: alto

## Problema

Resolvi `.agents/handoffs/onda-5/01-para-07-schema-workflow-version-pronto.md`: agora que o Agente
01 criou o model Prisma `WorkflowVersion` (tabela real, `@@unique([workflowId, version])`),
`publishWorkflow()`/`listWorkflowVersions()`/`rollbackToVersion()` em `src/services/
workflowService.ts` (meu arquivo) trocaram o mecanismo interino em
`Workflow.metadata.publishedVersions` por chamadas reais a `prisma.workflowVersion` — através de
três funções novas que adicionei em `src/repositories/workflowRepository.ts` (também meu, ver
AGENTS.md §11 "repositories que não sejam exclusivos de outro agente"): `createWorkflowVersion`,
`findWorkflowVersionsForWorkflow`, `findWorkflowVersion`, mais um helper `isUniqueConstraintViolation`
(mesmo padrão já usado em `billingRepository.isUniqueConstraintViolation`).

`__tests__/workflowPublishGate.test.ts` (seu arquivo, não posso editá-lo — AGENTS.md §11) faz
`vi.mock('../src/repositories/workflowRepository.js', ...)` com uma lista fixa de exports
(`findWorkflowForTenant`, `findActiveWorkflowForTenant`, `upsertWorkflow`, `deleteWorkflow`). Como
o módulo mockado não inclui os dois novos exports que `publishWorkflow` agora chama internamente
(via o helper `archivePublishedVersion`), o teste do caminho de sucesso quebra:

```
FAIL  __tests__/workflowPublishGate.test.ts > workflow publish production-runtime gate > activates a graph that is structurally valid and executable by the phone runtime
Error: [vitest] No "isUniqueConstraintViolation" export is defined on the "../src/repositories/workflowRepository.js" mock. Did you forget to return it from "vi.mock"?
 ❯ archivePublishedVersion src/services/workflowService.ts:130:28
 ❯ Module.publishWorkflow src/services/workflowService.ts:223:9
 ❯ __tests__/workflowPublishGate.test.ts:78:5
```

Este é exatamente o mesmo tipo de conflito já resolvido em
`.agents/handoffs/onda-5/07-para-08-publishgate-teste-assertion-desatualizada.md` (mudança de
contrato em `workflowService.ts`/`workflowRepository.ts` obrigando o mock deste arquivo a
acompanhar) — desta vez o gap é nos exports mockados, não numa asserção de valor. Todos os outros
testes do repositório passam: `npx vitest run` → `1 failed | 556 passed | 1 skipped` (558 total)
nesta branch isolada; os dois outros testes deste mesmo arquivo (`refuses a visually valid
graph...`, `refuses a non-deterministic parallel fan-out...`) continuam verdes porque ambos
rejeitam antes de chegar em `archivePublishedVersion` (a validação falha primeiro).

## Arquivo(s) envolvido(s)

- `__tests__/workflowPublishGate.test.ts` (seu, linhas 3-8: bloco `vi.mock`).

## Alteração necessária

Adicionar os dois exports que faltam ao mock (mesmo padrão que `src/services/
workflowVersioning.test.ts`, meu arquivo, já usa — posso servir de referência):

```ts
vi.mock('../src/repositories/workflowRepository.js', () => ({
  findWorkflowForTenant: vi.fn(),
  findActiveWorkflowForTenant: vi.fn(),
  upsertWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  createWorkflowVersion: vi.fn(),
  isUniqueConstraintViolation: vi.fn(() => false),
}));
```

Não é necessário mockar `findWorkflowVersionsForWorkflow`/`findWorkflowVersion` neste arquivo —
`publishWorkflow` (o único caminho que este arquivo testa) não os chama, só
`rollbackToVersion`/`listWorkflowVersions` chamam, e este arquivo cobre apenas o publish gate.
`createWorkflowVersion: vi.fn()` sem `mockResolvedValue` já resolve `undefined` por padrão, o que é
suficiente — o teste não faz asserção sobre o retorno dessa chamada, só sobre o `upsertWorkflow`
final. `isUniqueConstraintViolation: vi.fn(() => false)` garante que o `catch` em
`archivePublishedVersion` sempre re-lança em vez de engolir silenciosamente, caso algum erro
inesperado apareça no futuro (mantém o teste honesto).

Nenhuma asserção de valor precisa mudar desta vez — `expect(mockUpsert).toHaveBeenCalledWith(...,
expect.objectContaining({ status: 'active', version: 5 }))` continua correto, já que
`publishWorkflow` não passa mais `metadata` para `upsertWorkflow` (isso saiu do fluxo, foi
substituído pela escrita em `WorkflowVersion`), e `objectContaining` já tolera a ausência dessa
chave.

## Teste esperado

- `npx vitest run __tests__/workflowPublishGate.test.ts` → 3 passed, após o ajuste do mock.
- Gate completo do repositório (`typecheck`/`lint`/`vitest`/`build`) 100% verde na branch de
  integração após este ajuste ser mesclado junto com
  `agente/07-workflow-version-persistencia-real`. Nesta branch isolada (sem o merge de 07), o gate
  fica `1 failed | 556 passed | 1 skipped`, typecheck/lint/build 100% verdes — não é uma regressão
  não relacionada, é exatamente esperado pela mesma razão documentada no handoff anterior (o mock
  precisa acompanhar o contrato real do repository, que só existe após o merge das duas branches).

## Contexto adicional

Não é bypass de validação nem regressão de segurança/tenancy — `ValidationEngine` +
`validateRuntimeCompatibility` continuam sendo o único portão para `status: 'active'`; só a forma
como o conteúdo pré-publish é arquivado mudou (tabela `WorkflowVersion` real em vez de JSON inline
em `Workflow.metadata`). Ver `src/services/workflowService.ts` (comentários em `publishWorkflow`/
`archivePublishedVersion`/`toPublishedWorkflowVersion`) e `src/repositories/workflowRepository.ts`
(seção "WorkflowVersion (publish/rollback archive)") para o comportamento exato implementado, e
`src/services/workflowVersioning.test.ts` (meu arquivo, reescrito nesta mesma mudança) para a
cobertura completa do novo mecanismo, incluindo o caminho de corrida do `P2002` (duas publicações
concorrentes arquivando a mesma versão).

## Resolução

Aplicada exatamente a correção sugerida em "Alteração necessária"
(`__tests__/workflowPublishGate.test.ts`, linhas 3-8): os dois exports que faltavam foram
adicionados ao `vi.mock('../src/repositories/workflowRepository.js', ...)`:

```ts
vi.mock('../src/repositories/workflowRepository.js', () => ({
  findWorkflowForTenant: vi.fn(),
  findActiveWorkflowForTenant: vi.fn(),
  upsertWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  createWorkflowVersion: vi.fn(),
  isUniqueConstraintViolation: vi.fn(() => false),
}));
```

Nenhuma asserção de valor foi tocada, como o handoff previa.

**Validação**: diferente do handoff irmão sobre `telephonyService.test.ts`, esta correção
**não depende de nenhum código real de `agente/07-workflow-version-persistencia-real` estar
mesclado** — `vi.mock` substitui o módulo inteiro por um mock isolado, então a lista de exports do
mock só precisa acompanhar o que o `workflowService.ts` *desta branch* (`integracao/onda-5`, sem o
merge de 07) já importa/chama de `workflowRepository.js`. Rodando isoladamente nesta branch:

- `npx vitest run __tests__/workflowPublishGate.test.ts` → **3 passed** (0 falhas), não `1 failed`
  como o texto de "Teste esperado" do handoff original previa para o cenário pré-merge — essa
  previsão parece ter reaproveitado por engano os números do estado *anterior ao fix* (idênticos
  aos citados em "## Problema"). Corrigindo o registro: com o fix aplicado, o arquivo já fica 100%
  verde mesmo antes do merge de `agente/07-workflow-version-persistencia-real`.
- `npx vitest run` completo (toda a suíte) → `2 failed | 558 passed | 1 skipped`; os 2 únicos
  vermelhos são as duas asserções de `agentId` em `telephonyService.test.ts`, cobertas pelo handoff
  irmão `05-para-08-telephonyService-test-agentid-arg.md` (essas sim dependem do merge de
  `agente/05-pass-agentid`, por serem sobre comportamento de runtime real, não sobre exports de
  mock).
- `typecheck`, `lint` (0 erros, só warnings `any` pré-existentes) e `build` 100% verdes.

Ou seja: esta correção específica já deixa `workflowPublishGate.test.ts` verde imediatamente,
independentemente da ordem de merge com `agente/07-workflow-version-persistencia-real` — só o gate
completo do repositório (as duas outras asserções de `agentId`) permanece pendente do merge de
`agente/05-pass-agentid`, como documentado no handoff irmão.
