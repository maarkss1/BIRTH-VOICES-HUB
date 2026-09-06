- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 00 (Coordenador — dono de `server.ts`)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema
Em resposta a `.agents/handoffs/onda-4/11-para-01-supervisor-role-rbac.md`, criei um mecanismo de
`Permission` real (não mais um valor mágico de string) para a ação de intervir numa chamada ao
vivo. `server.ts` (exclusivo do Agente 00) ainda usa o array hardcoded antigo:

```ts
const ROLES_ALLOWED_TO_INTERVENE = ['admin'];
...
socket.on("intervene_call", (data) => {
  const role = socket.data.user?.role;
  if (!ROLES_ALLOWED_TO_INTERVENE.includes(role)) { ... }
```

Isso continua funcionando (nenhuma regressão), mas não se beneficia do novo modelo: não há como
conceder a capacidade a um usuário sem promovê-lo a `admin` completo.

## Arquivo(s) envolvido(s)
- `server.ts` (seu, exige aprovação explícita sua para alteração — não toquei).

## Alteração necessária
Trocar o array hardcoded pela checagem de permissão nova, disponível em
`src/middlewares/rbac.ts` (meu arquivo, já publicado nesta onda):

```ts
import { hasPermission } from './src/middlewares/rbac.js';

socket.on("intervene_call", async (data: { sessionId?: string }) => {
  const allowed = await hasPermission(socket.data.user, 'supervision:intervene');
  if (!allowed) {
    logger.warn('Intervention rejected: permission denied', { role: socket.data.user?.role, userId: socket.data.user?.id });
    socket.emit("intervention_error", { message: "Sem permissão para intervir nesta chamada." });
    return;
  }
  ...
});
```

`hasPermission(user, permission)` resolve ao vivo contra `Role`/`Permission` (nunca confia em
claim do JWT) — se o usuário tiver o role `admin` OU `supervisor` (ambos recebem
`supervision:intervene` por padrão, ver `prisma/seed.ts`), a checagem passa. Um `admin` de
billing/organização que não deveria supervisionar chamadas pode ser movido para fora dessa
permissão criando/atribuindo um Role customizado sem ela — isso é uma decisão de produto que ainda
não tomei (ver handoff original: "não bloqueador"), o `admin` de hoje continua tendo a permissão
por padrão (nenhuma regressão de acesso).

`socket.data.user` já é o `TokenPayload` (`{id, email, role, tenantId}`), então `hasPermission`
funciona sem mudança na autenticação do socket.

## Teste esperado
- Usuário com role `admin` ou `supervisor` consegue `intervene_call`.
- Usuário com role `user` (sem a permissão) continua bloqueado com a mesma mensagem de erro.
- Nenhuma regressão nos testes existentes de Socket.io/tenant isolation.

## Contexto adicional
Não bloqueador. `ROLES_ALLOWED_TO_INTERVENE` como está hoje é seguro (mais restritivo que
qualquer alternativa), então isso pode esperar a próxima janela de mudança em `server.ts`.
