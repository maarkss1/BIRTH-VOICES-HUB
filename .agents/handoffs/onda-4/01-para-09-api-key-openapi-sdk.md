- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 09 (SDK, Contratos e Documentação de API)
- Onda: 4
- Status: resolvido
- Prioridade: normal

## Problema
Resolvendo `.agents/handoffs/onda-4/09-para-00-api-key-backend-fora-de-escopo.md` (seu): você
sinalizou "assim que essa implementação existir, eu atualizo `docs/api/openapi.yaml` e regenero
`packages/sdk/`". A implementação existe agora — 4 endpoints novos, admin-only, tenant-scoped.

## Arquivo(s) envolvido(s)
- `docs/api/openapi.yaml`, `packages/sdk/**` (seus, não alterei).
- Backend novo (meu, referência): `src/routes/apiKey.routes.ts`,
  `src/controllers/apiKey.controller.ts`, `src/services/apiKeyService.ts`,
  `src/repositories/apiKeyRepository.ts`, `src/validators/index.ts` (schema `createApiKeySchema`).

## Alteração necessária
Documentar/gerar SDK para:

- `POST /api/developers/keys` — body `{ name: string (obrigatório, 1-200 chars), expiresAt?: string
  (ISO 8601) }`; 201 com `{ apiKey: { id, name, createdAt, expiresAt }, key: string }`; 400 em
  validação; 401/403 auth/role. **`key` é o segredo em texto claro, presente única e exclusivamente
  nesta resposta** — vale a pena um comentário explícito no schema OpenAPI avisando o consumidor da
  API de que não há como recuperá-lo depois.
- `GET /api/developers/keys` — 200 com `{ apiKeys: Array<{ id, name, createdAt, lastUsedAt: string
  | null, expiresAt: string | null, revoked: boolean, revokedAt: string | null }> }`. Nunca inclui
  hash ou chave em claro.
- `DELETE /api/developers/keys/{id}` e `POST /api/developers/keys/{id}/revoke` — mesmo
  comportamento (aliases): 200 com `{ success: true, apiKey: {...} }` (mesma forma de item de
  `GET`), 404 se a chave não existe ou pertence a outro tenant.
- Todos os quatro: `requireTenant` + `requireRole(['admin'])` — documentar como
  `security: [{ cookieAuth: [] }]` (ou o esquema equivalente já usado por `/api/billing/*`/`/api/users`
  no seu OpenAPI atual) com nota de que é admin-only.
- Além da autenticação por cookie/JWT já documentada em outras rotas, vale registrar no OpenAPI que
  a API agora aceita globalmente `Authorization: Bearer <api-key>` (prefixo `bvhk_live_`) como
  esquema de autenticação alternativo para qualquer rota autenticada — não é exclusivo destes 4
  endpoints, é um segundo `securityScheme` a nível de documento
  (`src/middlewares/index.ts#getAuthUser` resolve os dois caminhos para o mesmo `req.user`).

## Teste esperado
`packages/sdk/` gerado compila e um cliente TypeScript consegue chamar os 4 endpoints com
tipagem correta; nenhuma referência a `keyHash` ou a um campo "chave" fora da resposta de criação.

## Contexto adicional
Não bloqueador. Testes automatizados cobrindo o backend:
`src/repositories/apiKeyRepository.test.ts`, `src/services/apiKeyService.test.ts`,
`src/middlewares/apiKeyAuth.test.ts`. Validação manual ponta a ponta documentada no relatório da
Onda (registro → criação → listagem → autenticação Bearer → revogação → isolamento de tenant →
gate de role).

## Resolução
Documentados os 4 endpoints de API Keys em `docs/api/openapi.yaml`, exatamente como
especificado neste handoff:

- `POST /developers/keys` — request `{ name, expiresAt? }`; `201` com
  `{ apiKey: { id, name, createdAt, expiresAt }, key }`; comentário explícito no schema e na
  descrição do endpoint avisando que `key` (texto claro) só existe nesta resposta e nunca mais é
  recuperável; `400`/`401`/`403` documentados.
- `GET /developers/keys` — `200` com `{ apiKeys: ApiKeyMetadata[] }` (novo schema
  `ApiKeyMetadata`: `id, name, createdAt, lastUsedAt, expiresAt, revoked, revokedAt` — sem
  `keyHash` nem chave em claro).
- `DELETE /developers/keys/{id}` e `POST /developers/keys/{id}/revoke` — documentados como
  aliases idênticos (`200` com `{ success: true, apiKey: ApiKeyMetadata }`, `404` se a chave não
  existe/pertence a outro tenant), cada um remetendo ao outro na descrição.
- Novo `securityScheme` `apiKeyAuth` (`type: http, scheme: bearer`) em `components.securitySchemes`,
  documentado como alternativa global — adicionado a `security:` no nível do documento junto de
  `bearerAuth` (lista de duas entradas = OR, não AND) — cobrindo o pedido de registrar
  `Authorization: Bearer bvhk_live_...` como segundo esquema de autenticação válido para qualquer
  rota, não só estes 4 endpoints. Não existia `cookieAuth` no spec atual, então segui a alternativa
  já prevista no pedido ("ou o esquema equivalente já usado por `/billing/*`/`/users`"): esses
  endpoints usam a `security` padrão do documento (sem override por operação), e é isso que os 4
  endpoints de API Keys também fazem.

Aproveitei a mesma passada (auditoria já cobre onda atual) para documentar os dois outros grupos
sinalizados como pendentes desde a última auditoria — `billing.routes.ts` e
`notification.routes.ts` — com o mesmo rigor (ver relatório final do agente para detalhes:
schemas `WalletSummary`/`TransactionSummary`/`PlanOption`/`NotificationSummary`, paginação
`page`/`pageSize`/`total`/`totalPages` no padrão já usado por `GET /audit-log`).

`packages/sdk/` regenerado via `npm run generate` (swagger-typescript-api) a partir do OpenAPI
atualizado — `packages/sdk/src/Api.ts` ganhou os métodos e tipos dos três domínios, compila limpo
(`tsc --noEmit` dentro do pacote e `npm run build` do pacote, ambos sem erro). Nenhuma referência a
`keyHash` fora de um comentário de documentação, e `key?: string` aparece exatamente uma vez (na
resposta de criação) — teste esperado deste handoff confirmado.

Validações na raiz do monorepo após a mudança: `npm run typecheck` (limpo), `npm run lint` (0
erros, 123 warnings pré-existentes de `@typescript-eslint/no-explicit-any` em arquivos de teste,
nenhum novo), `npm run build` (sucesso, `vite build` + bundle do servidor).

Arquivos alterados: `docs/api/openapi.yaml`, `packages/sdk/src/Api.ts`. Nenhuma rota/controller,
`prisma/schema.prisma` ou arquivo fora do domínio deste agente foi tocado.
