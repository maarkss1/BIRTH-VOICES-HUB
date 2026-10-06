- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados) — schema/migração são sua propriedade exclusiva
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

Implementando `.agents/handoffs/onda-5/00-para-05-webhooks-tenant-contrato.md` (webhooks
configuráveis por tenant, resolvendo `.agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md`).
Toda a feature depende de um model que ainda não existe: hoje não há `TenantWebhookEndpoint` em
`prisma/schema.prisma` (confirmado por busca no schema). `pages/Dashboard/Developers.tsx`
permanece no estado vazio real na aba "Webhooks" precisamente por essa lacuna (mitigação já
aplicada na Onda 2, sem fabricar dado).

Sem o schema, não há o que persistir — por isso este handoff é o primeiro passo real da missão,
antes de qualquer persistência de verdade. Segui exatamente o mesmo padrão de scaffold que o
Agente 12 usou para `Plan`/`Wallet`/`Transaction`
(`.agents/handoffs/onda-4/12-para-01-schema-billing-monetizacao.md`): já criei
`src/repositories/webhookEndpointRepository.ts` e `src/services/webhookEndpointService.ts` nesta
execução — toda função de persistência do repository lança `WebhookEndpointSchemaNotReadyError`
em vez de tocar uma tabela inexistente ou fabricar dado (`AGENTS.md` §14), mas já com a assinatura
final que o controller/rotas chamam. Assim que este handoff for resolvido, meu próximo passo é
trocar cada função do repository pela chamada real via `prisma.tenantWebhookEndpoint`, sem
precisar mudar nenhuma assinatura pública (logo sem quebrar `webhookEndpointService.ts`,
`webhookEndpoint.controller.ts` nem `webhook.service.ts#dispatch`).

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` (seu, exclusivo).
- `src/repositories/webhookEndpointRepository.ts` (meu, já criado nesta execução como scaffold —
  interface `TenantWebhookEndpointRecord` espelha exatamente a proposta de schema abaixo).
- `src/services/webhookEndpointService.ts` (meu, lógica de negócio real — geração/hash de
  segredo, limite de 5 endpoints ativos, resolução de eventos — já pronta, só chama o repository).

## Alteração necessária

Proposta de schema (nomes/tipos ajustáveis à sua convenção — o que importa é a forma, definida
pelo Coordenador em `00-para-05-webhooks-tenant-contrato.md`):

```prisma
// Um endpoint de webhook configurado por um tenant admin (Developers.tsx). secretHash é o único
// segredo persistido (SHA-256 hex do valor `whsec_...` mostrado em texto plano uma única vez na
// criação/regeneração) — nunca o texto plano. webhook.worker.ts usa secretHash diretamente como
// chave HMAC-SHA256 ao assinar cada entrega (ver comentário em
// webhookEndpointService.ts#hashWebhookSecret para o porquê disso ser seguro e verificável pelo
// receptor mesmo sem a plataforma nunca guardar o texto plano).
model TenantWebhookEndpoint {
  id       String @id @default(uuid())
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  url      String
  secretHash String // SHA-256 hex — nunca texto plano

  // Lista de tipos de evento assinados (ex.: ["call.completed", "lead.qualified"]) ou ["*"] para
  // todos. Json em vez de uma tabela separada de junção porque a cardinalidade é pequena (no
  // máximo dezenas de tipos de evento no catálogo) e não precisa ser consultável por SQL — o
  // filtro é feito em memória em webhookEndpointService.resolveActiveEndpointsForEvent, mesmo
  // padrão já usado por `APIKey.scopes`.
  events Json @default("[]")

  active Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  lastDeliveryAt     DateTime?
  lastDeliveryStatus String?

  @@index([tenantId])
}
```

Adicionar `webhookEndpoints TenantWebhookEndpoint[]` em `Tenant` (mesmo padrão de `apiKeys
APIKey[]`/`transactions Transaction[]` já presentes).

## Teste esperado

Migração aplica limpo sobre o banco atual (puramente aditiva, sem alterar tabela existente).
`npx prisma generate` gera o client com `prisma.tenantWebhookEndpoint`. Nenhum dado fabricado —
a tabela fica vazia até um tenant admin criar um endpoint de verdade via
`POST /api/developers/webhooks`.

## Contexto adicional

Não bloqueador de release (feature nova, onda 5 — roadmap pós-release). Bloqueador só da minha
própria missão desta onda: sem o schema, `webhookEndpointRepository.ts` continua lançando
`WebhookEndpointSchemaNotReadyError` e as rotas `POST/GET/DELETE /api/developers/webhooks`
respondem `503` em vez de persistir de verdade. Os testes que dependem de persistência real
(isolamento cross-tenant, limite de 5 endpoints, listagem nunca incluindo segredo) estão cobertos
hoje em `src/services/webhookEndpointService.test.ts` com o repository mockado (mesmo padrão de
`src/services/apiKeyService.test.ts`) — cobrem a lógica de negócio completa; a integração real com
Postgres só é possível depois deste handoff ser resolvido.
