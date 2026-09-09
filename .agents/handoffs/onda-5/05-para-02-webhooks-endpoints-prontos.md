- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

Resolve `.agents/handoffs/onda-5/00-para-05-webhooks-tenant-contrato.md` item 6. O backend de
webhooks configuráveis por tenant está pronto ponta a ponta: schema real (
`.agents/handoffs/onda-5/01-para-05-schema-webhook-endpoint-pronto.md`), repository persistindo de
verdade via `prisma.tenantWebhookEndpoint`, service, controller e rotas. As rotas
`POST/GET/DELETE /api/developers/webhooks` e `POST /api/developers/webhooks/:id/regenerate-secret`
não respondem mais `503` — persistem de verdade. A aba "Webhooks" de `pages/Dashboard/Developers.tsx`
(hoje estado vazio real, sem chamada de API) pode ser conectada.

## Arquivo(s) envolvido(s)

- `pages/Dashboard/Developers.tsx` — seu arquivo, aba "Webhooks" a conectar às rotas abaixo.
- (Referência, não seu arquivo) `src/routes/webhookEndpoint.routes.ts`,
  `src/controllers/webhookEndpoint.controller.ts`, `src/services/webhookEndpointService.ts`,
  `src/repositories/webhookEndpointRepository.ts`.

## Contrato de request/response

Autorização: mesma exigida por chaves de API — `requireTenant` + `requireRole(['admin'])`
(cookie de sessão do dashboard já autenticado serve; role diferente de `admin` recebe `403`).
Rate limit: 20 requisições/60s por IP nessas rotas (`createRateLimiter('webhookEndpoints', 20, 60)`)
— um `429` é esperado sob uso abusivo, trate como qualquer outro rate limit já tratado no
dashboard.

### `POST /api/developers/webhooks`
Cria um endpoint. Body:
```json
{ "url": "https://exemplo.com/hooks/birthvoices", "events": ["call.completed", "lead.qualified"] }
```
- `url`: obrigatório, deve ser HTTPS público (rejeita IP privado/reservado — mesma validação de
  `callbackUrl` em `/api/voice/outbound`). Em `NODE_ENV !== 'production'`, HTTP também é aceito
  (ambiente de teste local).
- `events`: obrigatório, 1 a 20 strings não vazias. Use `["*"]` para assinar todos os tipos de
  evento.

Resposta `201`:
```json
{
  "webhookEndpoint": {
    "id": "uuid",
    "url": "https://exemplo.com/hooks/birthvoices",
    "events": ["call.completed", "lead.qualified"],
    "active": true,
    "createdAt": "2026-09-07T12:00:00.000Z"
  },
  "secret": "whsec_..."
}
```
**`secret` só aparece nesta resposta (e na de regenerate-secret) — nunca mais é recuperável.**
A UI precisa mostrar esse valor uma única vez com aviso claro de "copie agora, não será exibido de
novo" (mesmo padrão que a UI de API Keys já deveria seguir, se existir precedente em
`Developers.tsx`).

Erros:
- `400` — `url`/`events` inválidos (`{ "error": "<mensagem>" }`, mensagem já pronta para exibir).
- `409` — limite de 5 endpoints ativos por tenant atingido (`{ "error": "Limite de 5 endpoints de
  webhook ativos por tenant atingido. Remova ou desative um endpoint existente antes de criar
  outro." }`). Não existe endpoint de "desativar" separado hoje — a única forma de reduzir a
  contagem ativa é `DELETE`.

### `GET /api/developers/webhooks`
Lista todos os endpoints do tenant (ativos e inativos). Resposta `200`:
```json
{
  "webhookEndpoints": [
    {
      "id": "uuid",
      "url": "https://exemplo.com/hooks/birthvoices",
      "events": ["call.completed", "lead.qualified"],
      "active": true,
      "createdAt": "2026-09-07T12:00:00.000Z",
      "updatedAt": "2026-09-07T12:00:00.000Z",
      "lastDeliveryAt": "2026-09-07T12:05:00.000Z",
      "lastDeliveryStatus": "delivered"
    }
  ]
}
```
- `lastDeliveryAt`/`lastDeliveryStatus` são `null` até a primeira tentativa de entrega.
  `lastDeliveryStatus` observado hoje: `"delivered"` ou `"failed"` (bookkeeping best-effort de
  `webhook.worker.ts`).
- **Nunca** inclui `secret` nem `secretHash` — não há campo para isso na resposta em nenhuma
  circunstância.

### `DELETE /api/developers/webhooks/:id`
Resposta `200`: `{ "success": true }`. `404` (`{ "error": "Endpoint de webhook não encontrado." }`)
se o `id` não existir **ou** pertencer a outro tenant (lookup é tenant-scoped — nunca revela se o
recurso existe em outro tenant).

### `POST /api/developers/webhooks/:id/regenerate-secret`
Invalida o segredo atual e gera um novo, retornado em texto plano uma única vez — mesmo shape da
resposta de criação (`webhookEndpoint` + `secret`). Não recebe body. `404` nas mesmas condições do
DELETE.

## Teste esperado

- Fluxo de criação exibe o `secret` uma única vez com aviso de "não será mostrado novamente" e não
  o persiste em nenhum estado que sobreviva a um reload (nem `localStorage`).
- Lista renderiza estado vazio real quando `webhookEndpoints` vem `[]` (nunca dado fabricado —
  AGENTS.md §14).
- Erros `400`/`409`/`404`/`429` da API são exibidos ao usuário com a mensagem retornada pelo
  backend, não uma mensagem genérica.

## Contexto adicional

Catálogo de tipos de evento disponíveis para popular um seletor de `events` na UI (se desejar UX
melhor que um campo de texto livre) ainda não tem uma rota dedicada de "listar tipos de evento
suportados" — hoje o único evento realmente disparado pela plataforma via `webhookService.dispatch`
é o de callback de chamada outbound (`callbackUrl`), mas o contrato de `events` já é genérico o
suficiente para qualquer string futura. Se precisar desse catálogo como endpoint formal, abra
handoff para mim (05) — não é bloqueador para conectar create/list/delete/regenerate hoje.

Gate completo rodado nesta branch (`agente/05-webhooks-persistencia-real`) antes deste handoff:
`npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build` — ver commit para o resultado
exato.
