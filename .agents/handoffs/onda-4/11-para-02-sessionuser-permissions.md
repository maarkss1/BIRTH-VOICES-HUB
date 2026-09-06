- De: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 4
- Status: aberto
- Prioridade: baixa (melhoria, não bloqueador)

## Contexto
O Agente 01 criou uma `Permission` real (`supervision:intervene`), atribuível a qualquer `Role`,
substituindo o antigo proxy de role fixo. Um novo role de sistema `supervisor` já existe e recebe
essa permissão por padrão, ao lado de `admin` — ver
`.agents/handoffs/onda-4/01-para-11-supervisor-permission-frontend.md` (resolvido).

`GET /api/auth/me` já retorna `user.permissions: string[]` (calculado ao vivo, nunca fabricado),
além de `role`. Exemplo de resposta:

```json
{ "user": { "id": "...", "email": "...", "role": "supervisor", "tenantId": "...", "permissions": ["supervision:intervene"] } }
```

Hoje, `store/useSessionStore.ts` (`SessionUser`) só carrega `id`, `email`, `role`, `tenantId` — não
carrega `permissions`. Por isso, em `components/LiveSupervisor/LiveSupervisor.tsx` (meu), apliquei
por ora a opção **mínima**, um allowlist de roles hardcoded:

```ts
const ROLES_ALLOWED_TO_INTERVENE = ['admin', 'supervisor'];
const canIntervene = !!user && ROLES_ALLOWED_TO_INTERVENE.includes(user.role);
```

Isso funciona sem regressão e sem vazamento de acesso (o servidor continua sendo a checagem
autoritativa via `hasPermission()`), mas reintroduz um valor mágico de string no cliente — o mesmo
problema que motivou a criação da permission real no backend. Se amanhã um tenant atribuir
`supervision:intervene` a um role diferente de `admin`/`supervisor` (o modelo já permite isso, já
que a permissão é atribuível a qualquer `Role`), o cliente ficaria desatualizado de novo.

## Alteração proposta (quando houver janela)
1. Em `store/useSessionStore.ts`, adicionar `permissions?: string[]` ao tipo `SessionUser`.
2. Popular esse campo a partir da resposta de `GET /api/auth/me` (o campo já existe na resposta do
   servidor, só falta o cliente ler e guardar).
3. Uma vez feito isso, aviso o Agente 11 (ou fico à vontade para o próprio time trocar) para que
   `components/LiveSupervisor/LiveSupervisor.tsx` passe a usar:
   ```ts
   const canIntervene = !!user && user.permissions?.includes('supervision:intervene');
   ```
   removendo o array `ROLES_ALLOWED_TO_INTERVENE` hardcoded.

## Por que não bloqueador
O gate atual no cliente é UX apenas (defense-in-depth) — a checagem real e autoritativa está no
servidor via `hasPermission()`. Um usuário com `supervision:intervene` concedida por um role fora
do allowlist hardcoded hoje veria o botão desabilitado no cliente mas, se de alguma forma
disparasse a ação, o servidor aceitaria (fail-closed do lado errado seria pior; aqui é
fail-restrictive do lado do cliente, sem vazamento). Ou seja: pior caso é UX subótima, não
segurança quebrada.

## Teste esperado após a mudança
- Um usuário com `permissions` incluindo `supervision:intervene`, mas `role` fora de
  `['admin', 'supervisor']`, vê o controle de intervenção habilitado.
- Comportamento para `admin`/`supervisor` permanece idêntico ao atual.
