- De: Agente 02 (Produto, Navegação e UX)
- Para: Agente 09 (SDK, Contratos e Documentação de API)
- Onda: 2
- Status: resolvido (parcial — ver "## Resolução": API Keys resolvido; Webhooks configuráveis por
  tenant permanece em aberto, novo handoff aberto para o Coordenador)
- Prioridade: normal

## Problema
`pages/Dashboard/Developers.tsx` (via `hooks/useDeveloperSettings.ts`) apresenta uma tela de
"API Keys" e "Webhooks" totalmente client-side: chaves "criadas" só existem em `useState` local
(nunca enviadas a um backend), e a lista inicial vinha pré-carregada com duas chaves de exemplo
com formato idêntico a segredos reais (`pk_live_8g72hjksdfh839fj78hjs923xyz`,
`pk_test_1ab23cd45ef67gh89ij0klmnopqrst`), rotuladas "Production Key LIVE". A seção de
Webhooks mostrava um endpoint de exemplo fixo (`https://api.myapp.com/webhooks/voice`) com
status "200 OK" e "Última entrega: 2 min atrás" sempre fabricados, e o botão "Adicionar
Endpoint" não tinha nenhum handler.

`prisma/schema.prisma` já tem um model `APIKey` (comentado como "sem referências em src/ ou
lib/ hoje" — ver comentário perto da linha 211-222), mas nenhuma rota/controller/service o usa.

## Correção já aplicada nesta onda (mitigação, não solução definitiva)
- Removidas as duas chaves de exemplo com formato de segredo real (`INITIAL_KEYS` agora começa
  vazio em `hooks/useDeveloperSettings.ts`).
- Página rotulada explicitamente como "Pré-visualização de layout" com aviso de que nada aqui é
  reconhecido por uma API real.
- Botão "Adicionar Endpoint" desabilitado com tooltip explicando a limitação, em vez de um
  clique que não fazia nada.
- Webhook de exemplo fixo trocado por um estado vazio real + um botão "Simular envio de teste"
  (mantém a funcionalidade de teste local existente, mas sem fingir que há um endpoint real
  cadastrado).

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Developers.tsx`, `hooks/useDeveloperSettings.ts` (meus, já mitigados)
- `prisma/schema.prisma` (model `APIKey` já existe, dono: Agente 01)
- Precisaria de: rotas/controller/service para emitir, listar, revogar API keys reais, e um
  model + rotas para webhooks configurados pelo tenant — fora do meu escopo de arquivos.

## Alteração necessária
Implementar o backend real de API keys (usando o model `APIKey` já existente) e de webhooks
configuráveis, então trocar `useDeveloperSettings.ts` de estado local para chamadas reais a
`/api/developers/keys` (ou nome equivalente) — devolvo a tela para consumir dado real assim que
existir.

## Teste esperado
Uma chave criada na UI deve funcionar de fato como Bearer token em uma chamada autenticada; uma
chave revogada deve parar de autenticar imediatamente.

## Contexto adicional
Nenhuma chave real foi exposta — as duas chaves de exemplo removidas eram valores fixos gerados
para preencher a UI, nunca associados a nenhum sistema de autenticação real (confirmado: nenhum
middleware de auth lê `APIKey`).

## Resolução
Resolvido por: Agente 01 (Plataforma, Segurança, Tenancy e Dados), Onda roteada pelo Coordenador
via `.agents/handoffs/onda-4/09-para-00-api-key-backend-fora-de-escopo.md` (o handoff correto para
implementação de rotas/controller/service/schema é meu domínio, não do Agente 09).

**Parte de API Keys — resolvida:**
- `prisma/schema.prisma`: model `APIKey` corrigido (era schema morto, sem `tenantId`). Agora tem
  `tenantId` (FK `Tenant`, `onDelete: Cascade`, `@@index`), `createdByUserId` (FK `User`,
  `onDelete: SetNull`), `lastUsedAt`, `revokedAt`. Migração real aplicada:
  `prisma/migrations/20260907025549_fix_apikey_tenant_scope/`.
- Backend real implementado: `src/repositories/apiKeyRepository.ts`,
  `src/services/apiKeyService.ts`, `src/controllers/apiKey.controller.ts`,
  `src/routes/apiKey.routes.ts` — `POST/GET /api/developers/keys`,
  `DELETE /api/developers/keys/:id` e `POST /api/developers/keys/:id/revoke`. Admin-only
  (`requireRole(['admin'])`), tenant-scoped, com `writeAuditLog` em criação e revogação
  (`API_KEY_CREATE`/`API_KEY_REVOKE`).
- Chave em texto claro retornada **uma única vez** na resposta de criação; apenas `keyHash`
  (SHA-256) é persistido. Listagem nunca inclui hash nem chave em claro (`API_KEY_SAFE_SELECT`
  no repository nem sequer seleciona a coluna).
- `src/middlewares/index.ts` (`getAuthUser`) ganhou um caminho de autenticação alternativo:
  `Authorization: Bearer <api-key>` (prefixo `bvhk_live_`) resolve para o mesmo formato de
  `req.user`/`req.tenantId` que o JWT já produz (age em nome do usuário/role que criou a chave),
  então rotas existentes funcionam sem alteração. Chave revogada/expirada é checada ao vivo no
  banco a cada request — falha imediatamente, sem cache.
- Rate limiting básico por chave (120 req/60s, Redis, mesmo padrão increment+expire do limitador
  de IP em `server.ts`), aplicado apenas a requests autenticadas via API key.
- Testado de ponta a ponta manualmente contra o servidor real (registro → criação → listagem →
  autenticação via Bearer → `lastUsedAt` atualizado → revogação → 401 imediato → isolamento de
  tenant → 403 para role não-admin) e com testes automatizados
  (`src/repositories/apiKeyRepository.test.ts`, `src/services/apiKeyService.test.ts`,
  `src/middlewares/apiKeyAuth.test.ts`). `npm run typecheck`, `lint`, `test`, `build` e
  `npx prisma generate` verdes.
- Teste esperado deste handoff ("uma chave criada deve funcionar como Bearer token; uma chave
  revogada deve parar de autenticar imediatamente") confirmado manualmente (ver relatório da Onda).

**Parte de Webhooks configuráveis por tenant — permanece em aberto**, fora do escopo do pedido que
me foi roteado (só API Keys). Não implementada aqui para não inventar, sem decisão de produto,
esquema de assinatura/retry/endpoint de um novo domínio (webhooks) que tem página própria em
`hooks/useDeveloperSettings.ts`/`Developers.tsx`. Novo handoff aberto:
`.agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md`.

Handoffs novos criados para consumo do trabalho acima:
`.agents/handoffs/onda-4/01-para-02-api-key-endpoints-prontos.md` (Agente 02, consumir os
endpoints reais em `Developers.tsx`/`useDeveloperSettings.ts`) e
`.agents/handoffs/onda-4/01-para-09-api-key-openapi-sdk.md` (Agente 09, atualizar
`docs/api/openapi.yaml` e `packages/sdk/`).
