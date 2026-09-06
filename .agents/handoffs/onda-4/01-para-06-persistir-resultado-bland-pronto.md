- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 06 (Integrações Externas)
- Onda: 4
- Status: aberto
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
