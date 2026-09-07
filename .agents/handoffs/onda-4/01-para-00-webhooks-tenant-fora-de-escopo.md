- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Coordenador (00)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema
`.agents/handoffs/onda-2/02-para-09-api-key-backend.md` pedia duas coisas: (1) backend real de API
Keys e (2) "webhooks configuráveis por tenant" para substituir o endpoint de exemplo fixo que
`pages/Dashboard/Developers.tsx` mostrava na aba "Webhooks". A missão que me foi roteada (ver
`.agents/handoffs/onda-4/09-para-00-api-key-backend-fora-de-escopo.md` e o prompt de execução desta
onda) cobria explicitamente só "API Keys" — implementei a parte (1) por completo (ver
`## Resolução` em `02-para-09-api-key-backend.md`). A parte (2) permanece sem dono e sem
implementação.

Não implementei (2) por conta própria porque é um domínio novo com decisões de produto/segurança
que não foram pedidas nem definidas: schema de assinatura HMAC do payload (mesmo padrão de
`WEBHOOK_SIGNING_SECRET`/`x-birthvoices-signature` já usado para webhooks *emitidos* pela
plataforma, ou um segredo por-endpoint-configurado-pelo-tenant?), política de retry/backoff em
falha de entrega, limite de endpoints por tenant, e um novo model Prisma
(`TenantWebhookEndpoint` ou similar — schema owner sou eu, mas a forma depende de decisões que
ainda não foram tomadas). Implementar isso sem esse contrato definido seria inventar
comportamento não pedido (AGENTS.md §19 pede correção imediata de problemas *dentro do escopo*, não
expansão de escopo por conta própria para um domínio sem dono claro).

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Developers.tsx`, `hooks/useDeveloperSettings.ts` (Agente 02) — aba "Webhooks"
  hoje com estado vazio real + botão "Simular envio de teste" (mitigação já aplicada na Onda 2,
  não fabrica mais dado, mas não persiste nada real).
- Precisaria de: novo model Prisma para endpoints de webhook por tenant (meu, `prisma/schema.prisma`,
  se/quando a forma for decidida), rotas/controller/service novos (dono a definir — mesmo padrão
  desta missão de API Keys: naturalmente Agente 01 por tocar autenticação/segredos, mas é uma
  atribuição explícita do Coordenador, não presumida por mim).

## Alteração necessária
O Coordenador precisa decidir: (a) atribuir esta implementação a um agente (candidato natural:
Agente 01, mesmo raciocínio usado para API Keys — mas confirmar explicitamente, não presumir) numa
próxima onda, definindo antes o contrato mínimo (esquema de assinatura, retry, limite por tenant);
ou (b) formalmente adiar para o roadmap pós-release (`ROADMAP.md`) se não for prioridade para o
release atual.

## Teste esperado
N/A neste handoff (coordenação/atribuição). Quando implementado: um endpoint de webhook cadastrado
por um tenant recebe uma entrega real e assinada quando o evento correspondente ocorre; endpoints
de um tenant nunca recebem eventos de outro tenant (mesmo requisito de isolamento de
`AGENTS.md` §15).

## Contexto adicional
Não bloqueador para o release atual — a aba "Webhooks" já não fabrica dado (mitigação da Onda 2
permanece válida). Registrado aqui só para o pedido original não ficar "perdido" quando
`02-para-09-api-key-backend.md` for lido como resolvido (a resolução cobre API Keys, não
Webhooks).

## Resolução (Coordenador, Onda 5)

Decisão: **(a)** — atribuído nesta onda, contrato mínimo definido abaixo. Dono: **Agente 01**
(schema + backend, mesmo raciocínio já usado para API Keys) seguido por **Agente 02** (conectar
`pages/Dashboard/Developers.tsx` ao dado real). Ver task específica em
`.agents/handoffs/onda-5/00-para-01-webhooks-tenant-contrato.md`.

Contrato definido a partir da infraestrutura que **já existe** (`webhook.service.ts` +
`webhook.worker.ts`, com fila BullMQ, retry exponencial de 5 tentativas e defesa SSRF já
implementadas — não reinventar nenhuma dessas partes):

1. **Assinatura**: secreto **por endpoint** (não o `WEBHOOK_SIGNING_SECRET` global de deployment,
   que fica como fallback só para o `WEBHOOK_URL`/`TEST_WEBHOOK_URL` de ambiente enquanto nenhum
   endpoint de tenant existir). Gerado na criação do endpoint, retornado em texto plano **uma única
   vez** (mesmo padrão de `apiKeyService.ts`), nunca reexibido depois — só seu hash é persistido.
   HMAC-SHA256 sobre o corpo exato enviado, mesmo header `x-birthvoices-signature` já documentado.
2. **Retry/backoff**: já resolvido — reusar exatamente `attempts: 5` / backoff exponencial de
   `webhook.service.ts`, sem mudança.
3. **Limite por tenant**: máximo de 5 endpoints ativos por tenant.
4. **Model Prisma** (`TenantWebhookEndpoint` ou nome equivalente, dono: Agente 01): `id`,
   `tenantId` (FK), `url`, `secretHash`, `events` (`Json`, lista de tipos de evento assinados ou
   `["*"]` para todos), `active`, `createdAt`, `lastDeliveryAt`, `lastDeliveryStatus`.
5. **Resolução em `webhookService.dispatch`**: substituir o TODO existente — para um dado
   `tenantId`, buscar todos os `TenantWebhookEndpoint` ativos e cujo `events` inclua o tipo do
   evento (ou `"*"`), enfileirar uma entrega por endpoint. Nunca quebrar a chamada de negócio que
   originou o evento (mesma garantia de "never throws" já documentada).
