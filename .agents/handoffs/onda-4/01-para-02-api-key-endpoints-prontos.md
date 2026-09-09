- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 4
- Status: resolvido
- Prioridade: normal

## Problema
Resolvendo o handoff órfão `.agents/handoffs/onda-2/02-para-09-api-key-backend.md` (seu, roteado a
mim pelo Coordenador via `.agents/handoffs/onda-4/09-para-00-api-key-backend-fora-de-escopo.md`):
`pages/Dashboard/Developers.tsx`/`hooks/useDeveloperSettings.ts` (seus) hoje tratam "API Keys"
inteiramente client-side (`useState` local, nada enviado a um backend, rotulado como
"Pré-visualização de layout"). O backend real agora existe e pode substituir esse estado local.

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Developers.tsx`, `hooks/useDeveloperSettings.ts` (seus, não alterei).
- Backend novo (meu): `src/routes/apiKey.routes.ts`, `src/controllers/apiKey.controller.ts`,
  `src/services/apiKeyService.ts`, `src/repositories/apiKeyRepository.ts`.

## Alteração necessária
Trocar a seção "API Keys" de `useDeveloperSettings.ts`/`Developers.tsx` de estado local para os
três endpoints reais abaixo (cookies de sessão, mesma auth do resto do app; **somente `admin` do
tenant** — 403 para outros roles, mesmo padrão de `/api/billing/*`/`/api/users`):

**`POST /api/developers/keys`** — cria uma chave nova.
```json
// Request
{ "name": "CI Pipeline", "expiresAt": "2027-01-01T00:00:00.000Z" } // expiresAt opcional
// Response 201
{
  "apiKey": { "id": "...", "name": "CI Pipeline", "createdAt": "...", "expiresAt": "..." },
  "key": "bvhk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```
**IMPORTANTE (AGENTS.md §13):** o campo `key` (texto claro) só existe **nesta resposta**. O
backend nunca o persiste nem o devolve de novo — nem em `GET /api/developers/keys`, nem em
lugar nenhum. A UI precisa deixar isso explícito para o admin ("copie agora, esta chave não será
mostrada novamente"), removendo a mensagem atual de "Pré-visualização de layout".

**`GET /api/developers/keys`** — lista metadados, nunca a chave nem o hash.
```json
{
  "apiKeys": [
    { "id": "...", "name": "CI Pipeline", "createdAt": "...", "lastUsedAt": "2026-09-07T03:04:36.236Z", "expiresAt": null, "revoked": false, "revokedAt": null }
  ]
}
```

**`DELETE /api/developers/keys/:id`** (ou **`POST /api/developers/keys/:id/revoke`**, ambos
idênticos — escolha o que for mais natural para o cliente HTTP já em uso) — revoga
imediatamente. 404 se a chave não existir ou pertencer a outro tenant (nunca vaza existência
cross-tenant). Idempotente: revogar de novo uma chave já revogada retorna 200 sem erro.
```json
{ "success": true, "apiKey": { "id": "...", "revoked": true, "revokedAt": "..." } }
```

Erros de validação (`name` ausente/vazio, `expiresAt` mal formatado) voltam `400 { "error": "..." }`
via Zod (`createApiKeySchema`).

## Teste esperado
Uma chave criada na UI, copiada e usada como `Authorization: Bearer <chave>` em qualquer rota
autenticada do backend (ex.: `GET /api/audit-log`) funciona de fato — validei manualmente ponta a
ponta (registro → criação → `GET /api/developers/keys` sem hash/chave em claro → Bearer em rota
protegida → `lastUsedAt` atualizado → revogação → 401 imediato → segunda conta/tenant não vê nem
consegue revogar a chave do primeiro tenant → role não-admin recebe 403 ao tentar criar).

## Contexto adicional
Não bloqueador — a UI atual já é honesta sobre ser uma pré-visualização (mitigação da Onda 2), só
precisa passar a apontar para dado real. Rate limiting básico por chave (120 req/60s) já está
embutido no middleware de autenticação — nenhuma ação necessária no frontend para isso, mas um
`429 { "error": "..." }` é uma resposta possível em qualquer chamada autenticada via API key (não
relevante para o fluxo de gestão de chaves em si, que usa cookie de sessão, não a própria chave).

Webhooks configuráveis por tenant (a outra metade do pedido original em
`02-para-09-api-key-backend.md`) **não** foram implementados nesta passada — fora do escopo do que
me foi roteado. Ver `.agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md`.

## Resolução
`hooks/useDeveloperSettings.ts` e `pages/Dashboard/Developers.tsx` foram reescritos para consumir
os três endpoints reais no lugar do `useState` local anterior:

- **Listagem** (`GET /api/developers/keys`): carregada num `useEffect`, com estado
  `loading | error | ready` no mesmo padrão já usado em `Billing.tsx`/`Organization.tsx`
  (`Skeleton` no carregamento, `EmptyState` com botão "Tentar novamente" no erro, `EmptyState`
  textual na lista vazia). Gate de admin: `isAdmin = sessionUser?.role === 'admin'` (mesmo padrão
  de `Billing.tsx`/`Organization.tsx`) — não-admin vê `EmptyState` "Acesso restrito" e a página nem
  chama o fetch (o backend já devolveria 403, mas evitamos a chamada fadada ao fracasso).
- **Criação** (`POST /api/developers/keys`): o modal existente foi mantido, agora enviando `POST`
  de verdade. A resposta (`{ apiKey, key }`) alimenta um novo estado `createdKeyReveal` que exibe a
  chave em texto claro **uma única vez**, num banner âmbar destacado acima da lista, com botão de
  copiar e texto explícito "copie agora — por segurança, ela não será mostrada novamente em lugar
  nenhum"; o campo `key` nunca entra em nenhum estado que sobreviva a um refresh nem em
  `ApiKeyMetadata`. O admin fecha o banner manualmente ("Já copiei, fechar") — a chave não
  reaparece depois disso (o backend também nunca a devolve de novo, então não haveria como mesmo
  que quiséssemos). Erros de validação (400 do Zod) aparecem inline no modal.
- **Revogação** (`DELETE /api/developers/keys/:id`): o diálogo de confirmação existente passou a
  disparar o `DELETE` real; a lista é recarregada após sucesso. Como o backend retorna as chaves
  revogadas na listagem (não as remove), a linha passa a mostrar badge "Revogada"/"Ativa" e o botão
  de revogar fica desabilitado para uma chave já revogada — refletindo o comportamento idempotente
  do backend em vez de escondê-lo.
- Removida a distinção "LIVE/TEST" fabricada no nome (o backend usa um único prefixo real,
  `bvhk_live_`, sem essa semântica) e removidos "mostrar/ocultar chave" e "copiar" por linha da
  lista — não fazem mais sentido porque a listagem real nunca inclui o valor da chave, só metadados
  (`id`, `name`, `createdAt`, `lastUsedAt`, `expiresAt`, `revoked`, `revokedAt`).
- Removido o banner amarelo genérico de "Pré-visualização de layout" do topo da página (não é mais
  verdade para API Keys). A seção **Webhooks não foi tocada** — JSX e comportamento idênticos aos
  anteriores, incluindo seu próprio texto honesto já existente ("nenhum endpoint cadastrado" +
  botão "Adicionar Endpoint" desabilitado); ver
  `.agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md` (ainda sem dono).

### Validação manual ponta a ponta (smoke test real, não só unit/mocks)
Com Postgres local rodando e o build de produção (`dist/server.cjs`) de pé:
registro (`admin`) → `GET /api/developers/keys` vazio → `POST /api/developers/keys` (201, `key`
em texto claro só nesta resposta) → `Authorization: Bearer <key>` em `GET /api/audit-log` (200) →
`GET /api/developers/keys` (mostra metadados, sem `key`/hash) → `DELETE /api/developers/keys/:id`
(200, `revoked:true`) → mesma chave via Bearer agora dá 401 imediato → segundo `DELETE` na mesma
chave (idempotente, 200 sem erro). Contrato bate exatamente com o formato de resposta que a UI
espera (`apiKey.{id,name,createdAt,expiresAt}` + `key` na criação; `apiKeys[]` com os 7 campos de
metadados na listagem).

### Arquivos alterados
- `hooks/useDeveloperSettings.ts`
- `pages/Dashboard/Developers.tsx`

### Gate da Onda 4
`npm run typecheck`, `npm run lint` (0 erros, warnings pré-existentes em outros arquivos),
`npm run test` (404 passed, 1 skipped — pré-existente), `npm run test:e2e` (3/3, incluindo
`auth.spec.ts` contra Postgres real) e `npm run build` — todos passaram.
