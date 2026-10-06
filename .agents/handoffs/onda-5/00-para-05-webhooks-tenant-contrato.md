- De: Agente 00 (Coordenador)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

Resolve `.agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md` (ver `## Resolução`
lá para o histórico completo). Implementar webhooks configuráveis por tenant, substituindo o TODO
em `webhook.service.ts` e a aba "Webhooks" de `Developers.tsx` (hoje estado vazio real, sem
persistência). `webhook.service.ts`/`webhook.worker.ts` já são seus por `AGENTS.md` §11 — este é o
dono natural desta feature, não o Agente 01 (correção do handoff original, que sugeriu 01 sem
checar a matriz de propriedade).

**Não reinventar a infraestrutura de entrega que já existe**: fila BullMQ, retry exponencial
(`attempts: 5`, backoff exponencial de 2s), defesa SSRF (`isSafeWebhookUrl`), timeout de entrega de
5s, assinatura HMAC-SHA256 sobre o corpo exato enviado, header `x-birthvoices-signature`. Só a
**resolução do endpoint por tenant** e o **segredo por endpoint** são novos.

## Contrato (definido pelo Coordenador)

1. **Model Prisma `TenantWebhookEndpoint`** — **não é seu arquivo** (`prisma/schema.prisma` é
   exclusivo do Agente 01). Escreva um handoff `.agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md`
   propondo exatamente esta forma (mesmo padrão já usado por Agente 12 pedindo `Plan`/`Wallet`/
   `Transaction` a Agente 01): `id`, `tenantId` (FK, `onDelete: Cascade`), `url`, `secretHash`
   (SHA-256, nunca texto plano persistido), `events` (`Json`, lista de tipos de evento ex.
   `["call.completed", "lead.qualified"]` ou `["*"]` para todos), `active` (Boolean, default true),
   `createdAt`, `updatedAt`, `lastDeliveryAt` (DateTime?), `lastDeliveryStatus` (String?). Índice em
   `tenantId`. Você pode escrever o repository/service assumindo essa forma antes do schema
   existir de fato (mesmo padrão de scaffold já usado nesta wave), desde que o handoff exista.
2. **Limite**: máximo de 5 endpoints ativos por tenant — rejeitar criação além disso com erro
   claro, não falhar silenciosamente.
3. **Segredo**: gerado em `crypto.randomBytes(32)` na criação (mesmo padrão de tamanho de
   `apiKeyService.ts`), retornado em texto plano **uma única vez** na resposta de criação, nunca
   mais recuperável (só permite gerar um novo, invalidando o antigo). Prefixo sugerido `whsec_`
   para reconhecimento visual, mas a decisão de formato é sua.
4. **Rotas** (`src/routes/webhookEndpoint.routes.ts`, mesmo padrão de `apiKey.routes.ts`):
   `POST/GET/DELETE /developers/webhooks` (admin-only, `requireRole(['admin'])`, mesmo nível de
   autorização de billing/API keys), com rate limiter próprio via `src/middlewares/rateLimit.ts`
   (`createRateLimiter('webhookEndpoints', 20, 60)`, mesmo padrão já usado em `apiKey.routes.ts`).
5. **`webhookService.dispatch(tenantId, event, data, targetUrl?)`**: substituir o TODO — se
   `targetUrl` não for passado explicitamente (chamadas legadas continuam funcionando), buscar
   todos os `TenantWebhookEndpoint` ativos do tenant cujo `events` inclua o tipo do evento (ou
   `"*"`), enfileirar uma entrega por endpoint encontrado. `webhook.worker.ts`'s `signBody`
   precisa resolver o segredo por `endpointId` (passado no job), não mais um único
   `WEBHOOK_SIGNING_SECRET` global — que continua existindo só como fallback para o
   `WEBHOOK_URL`/`TEST_WEBHOOK_URL` de ambiente quando nenhum endpoint de tenant existir. Nunca
   lançar exceção que quebre a chamada de negócio que originou o evento (garantia já documentada,
   mantê-la).
6. **Frontend**: fora do seu escopo — Agente 02 conecta `Developers.tsx` numa próxima rodada, uma
   vez que as rotas existam. Documente o contrato de request/response (ou já sincronize
   `docs/api/openapi.yaml` você mesmo, já que webhooks é seu domínio) para ele ter uma fonte de
   verdade — deixe um handoff `.agents/handoffs/onda-5/05-para-02-webhooks-endpoints-prontos.md`
   quando terminar.

## Arquivo(s) envolvido(s)
- `.agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md` (novo, proposta de schema).
- `src/repositories/webhookEndpointRepository.ts` (novo).
- `src/services/webhookEndpointService.ts` (novo, CRUD + geração/hash de segredo).
- `src/services/webhook.service.ts` (editar `dispatch` — já seu).
- `src/services/webhook.worker.ts` (editar `signBody` — já seu).
- `src/controllers/webhookEndpoint.controller.ts`, `src/routes/webhookEndpoint.routes.ts` (novos).
- `src/routes/index.ts` (montar a nova rota — arquivo compartilhado, só adicionar import + `router.use`).

## Teste esperado
- Criar endpoint retorna segredo em texto plano uma única vez; listagem subsequente nunca inclui
  segredo nem hash.
- Isolamento cross-tenant: endpoint do tenant A nunca aparece pra tenant B, nunca recebe evento de
  outro tenant (`AGENTS.md` §15).
- `dispatch()` com um evento cujo tipo não está em `events` de nenhum endpoint não enfileira nada.
- Limite de 5 endpoints ativos por tenant é respeitado (6ª criação falha com erro claro).
- Assinatura verificável: HMAC recomputado do lado do "receptor" simulado no teste bate com o
  header enviado, usando o segredo daquele endpoint especificamente (não o de outro nem o global).

## Contexto adicional
Não bloqueador de release. Gate completo (`typecheck`, `lint`, `vitest`, `build`) deve passar antes
do push. Trabalhe em `agente/05-webhooks-tenant` a partir de `integracao/onda-5`.
