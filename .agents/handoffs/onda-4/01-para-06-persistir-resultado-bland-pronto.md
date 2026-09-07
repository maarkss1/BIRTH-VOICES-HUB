- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 06 (Integrações Externas)
- Onda: 4
- Status: resolvido
- Prioridade: normal

## Problema
Resolvendo `.agents/handoffs/onda-1/06-para-01-persistir-resultado-bland.md`: o model que você
sugeriu para persistir o resultado do callback da Bland AI agora existe em `prisma/schema.prisma`
como `AtlasGRCallResult`, com migração real aplicada
(`prisma/migrations/20260906153010_add_atlasgr_call_result/`), e o repository já está escrito em
`src/repositories/atlasGRCallResultRepository.ts` (com testes em
`src/repositories/atlasGRCallResultRepository.test.ts`). Não toquei em
`src/features/prospecting/routes/atlasgr.routes.ts` nem em `voice.service.ts` — ambos seus.

## Decisão de produto que você levantou (`tenantId`)
Optei por deixar `tenantId` **opcional** (`String?`, com relação `Tenant?` /
`onDelete: SetNull`), em vez de preencher automaticamente com `ATLASGR_TENANT_ID` ou qualquer outra
associação inferida. Motivo: `ATLASGR_TENANT_ID` resolve um tenant real no momento do *disparo* da
ligação (para o gate de consentimento de IA), mas esse identificador nunca é enviado à Bland AI
como metadata da chamada e nunca volta no payload do callback de resultado — não há, hoje, nenhum
jeito de confirmar a partir do callback em si que aquele resultado pertence àquele tenant. Uma
linha com `tenantId: null` aqui é a representação correta de "esta integração não tem sinal de
tenant verificável por chamada", não um bug a esconder. O comentário completo está no model, em
`prisma/schema.prisma`.

Isso não te impede de popular `tenantId` de forma best-effort se você achar que vale a pena (ex.:
passar `process.env.ATLASGR_TENANT_ID` ao chamar o repository) — só não é uma exigência do schema,
e documentei a limitação para não fingirmos uma garantia que não existe.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` (meu, já publicado) — model `AtlasGRCallResult` + `Tenant.atlasGRCallResults`.
- `src/repositories/atlasGRCallResultRepository.ts` (meu, já publicado, novo arquivo).
- `src/features/prospecting/routes/atlasgr.routes.ts` (seu) — falta chamar o repository.

## Alteração necessária (no seu handler, quando você tiver janela)
No handler `router.post('/webhooks/bland/:token', ...)`, depois que
`beginBlandCallbackProcessing(callId)` retornar um estado diferente de `'duplicate'`/`'in_progress'`
(ou seja, no mesmo trecho onde hoje você monta `forwardPayload` e faz o `fetch` para o AtlasGR),
persista o resultado antes ou depois do encaminhamento — sugiro antes, para não perder o dado se o
`fetch` falhar:

```ts
import { upsertAtlasGRCallResult } from '../../../repositories/atlasGRCallResultRepository.js';

// ... dentro do handler, com `data`/`callId`/`variables`/`forwardPayload` já calculados:
await upsertAtlasGRCallResult({
  callId,
  status: data.status ?? null,
  completed: forwardPayload.completed,
  callLength: forwardPayload.call_length || null,
  leadId: asString(variables.lead_id) || null, // hoje provavelmente sempre vazio, ver nota abaixo
  // tenantId: process.env.ATLASGR_TENANT_ID?.trim() || null, // opcional, ver decisão acima
});
```

`upsertAtlasGRCallResult` já é idempotente por `callId` (constraint `@unique`), então mesmo se você
chamar em toda redelivery (inclusive as que a lógica do Redis já filtrou como `duplicate` antes de
chegar aqui, se algum dia você decidir chamar em outro ponto do fluxo) não duplica linha — só
atualiza a existente. Não precisa de try/catch dedicado: se a persistência falhar, deixe o erro
propagar como qualquer outra falha inesperada do handler (hoje cai no `catch` que já existe em
volta do bloco de forward).

Nota sobre `leadId`: hoje `variables.lead_id` provavelmente vem sempre vazio, porque
`triggerOutboundCall` (seu arquivo) não envia `lead_id` como metadata/variable para a Bland AI no
payload de disparo — o campo existe no model e no repository pensando num cenário futuro onde você
decida enviá-lo. Não é bloqueador; só documentando por que ele vai ficar `null` na prática por
enquanto.

## Teste esperado
- Callback de resultado da Bland AI persiste uma linha consultável por `callId`.
- Redelivery do mesmo `callId` (inclusive após o TTL do Redis expirar) não duplica registro —
  `upsertAtlasGRCallResult` atualiza a linha existente.
- Nenhuma chamada real de teste automatizado precisa de banco: o repository é mockável do mesmo
  jeito que os demais em `src/repositories/**` (ver `atlasGRCallResultRepository.test.ts` como
  referência de como mockar `prisma.atlasGRCallResult`).

## Contexto adicional
Não bloqueador — o Redis (`beginBlandCallbackProcessing`/`completeBlandCallbackProcessing`) já
resolve o risco real de disparo duplicado de ligação; isso fecha só o gap de auditoria/consulta
histórica que seu handoff original apontou. `prisma generate` já foi rodado nesta onda; o client
TypeScript (`prisma.atlasGRCallResult`) já está disponível para você importar via
`../../../repositories/atlasGRCallResultRepository.js` sem precisar rodar nada.

Validações rodadas nesta onda por mim (saída real): `npm run typecheck` (0 erros), `npm run lint`
(0 erros), `npm run test` (53 arquivos, 332 testes passando, 1 skip, 0 falhas), `npm run build`
(build de produção completo), `npx prisma generate` (client gerado com sucesso).

## Resolução

Chamada real de `upsertAtlasGRCallResult` inserida no handler
`router.post('/webhooks/bland/:token', ...)` em
`src/features/prospecting/routes/atlasgr.routes.ts`, logo após o bloco de `forwardPayload` (que já
extrai `call_id`/`status`/`completed`/`call_length`) e **antes** do `try { fetch(...) }` que
encaminha o resultado ao AtlasGR — exatamente como sugerido, para não perder o dado de auditoria
mesmo se o encaminhamento ao CRM falhar. A posição garante que:
- a chamada só acontece depois de `validateBlandCallbackToken` (autenticação do callback) e depois
  de `beginBlandCallbackProcessing` já ter retornado um estado diferente de `duplicate`/
  `in_progress` (ambos retornam antes de chegar a este ponto) — nunca persiste um callback não
  autenticado ou já processado/duplicado;
- é **fire-and-forget com log**, não bloqueante: `upsertAtlasGRCallResult(...).catch((error) =>
  logger.error(...))` — mesmo padrão de `src/services/audit.ts`
  (`auditQueue.add(...).catch((err) => logger.error(...))`). Uma falha de persistência nunca
  derruba nem atrasa a resposta HTTP ao Bland AI (o `fetch` de encaminhamento ao AtlasGR roda em
  paralelo, sem `await` na persistência), e o erro nunca é escondido — sempre logado via `pino`
  com `callId` e mensagem do erro.

Campos passados: `callId`, `status: data.status ?? null`, `completed: forwardPayload.completed`,
`callLength: forwardPayload.call_length || null`, `leadId: asString(variables.lead_id) || null` e
`tenantId: process.env.ATLASGR_TENANT_ID?.trim() || null` (melhor esforço, conforme sugerido —
documentado inline por que não é uma garantia verificável por chamada, remetendo ao comentário do
model em `prisma/schema.prisma`).

### Arquivos alterados
- `src/features/prospecting/routes/atlasgr.routes.ts` — import de `upsertAtlasGRCallResult` e
  chamada fire-and-forget-com-log no handler do callback da Bland AI.
- `src/features/prospecting/routes/atlasgr.routes.test.ts` — mock de
  `../../../repositories/atlasGRCallResultRepository.js` (evita hit real em Prisma nos testes de
  rota) e 3 novos testes: (1) o resultado é persistido com os campos corretos ao processar um
  callback válido; (2) `tenantId`/`leadId` são propagados quando `ATLASGR_TENANT_ID` está
  configurado e `variables.lead_id` vem no payload; (3) uma falha na persistência não derruba a
  resposta 200 ao Bland AI; (4) callback `duplicate` não chama `upsertAtlasGRCallResult`.
- Nenhum arquivo fora do domínio do Agente 06 foi tocado (`prisma/schema.prisma` e
  `src/repositories/atlasGRCallResultRepository.ts` permanecem exclusivamente do Agente 01, não
  alterados).

### Validações (saída real, nesta remediação)
- `npm run typecheck` → 0 erros.
- `npm run lint` → 0 erros, 92 warnings pré-existentes (`@typescript-eslint/no-explicit-any` em
  mocks de teste já catalogados em `TECHNICAL-DEBT-CHECKLIST.html`); nenhum warning novo nos
  arquivos alterados.
- `npm run test` → 53 arquivos de teste passando, 335 testes passando (332 pré-existentes + 3 novos
  neste handoff), 1 skip (pré-existente), 0 falhas.
- `npm run test:contracts` → 1 arquivo, 1 teste passando (`contracts/health.contract.test.ts`).
- `npm run build` → build de produção completo (`vite build` + bundle `esbuild` de `server.ts`),
  sem erros.

Status final: `resolvido`.
