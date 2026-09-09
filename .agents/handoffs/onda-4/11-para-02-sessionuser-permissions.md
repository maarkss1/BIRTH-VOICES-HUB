- De: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 4
- Status: resolvido
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

## Resolução
Alteração aplicada em `store/useSessionStore.ts` (Agente 02), exatamente conforme proposto:

1. Adicionado `permissions?: string[]` à interface `SessionUser`, com comentário explicando que é
   populado ao vivo pelo servidor e que a ausência do campo não deve ser lida como "tudo negado" ou
   "tudo permitido".
2. `fetchSession()` agora repassa `data.user.permissions` (já presente na resposta de
   `GET /api/auth/me`) para o objeto `SessionUser` guardado no store.

Nenhuma outra mudança de comportamento — extensão puramente aditiva de tipo/dado. Validações
completas rodadas após a mudança:
- `npm run typecheck` — 0 erros.
- `npm run lint` — 0 erros, 88 warnings pré-existentes (todos `@typescript-eslint/no-explicit-any`
  em arquivos de teste/infra não relacionados a esta mudança).
- `npm run test` — 328 passed, 1 skipped, 0 falhas.
- `npm run build` — build de frontend (Vite) e servidor (esbuild) concluídos com sucesso.

Ver handoff `.agents/handoffs/onda-4/02-para-11-permissions-disponivel-no-sessionstore.md` avisando
que `components/LiveSupervisor/LiveSupervisor.tsx` já pode trocar o allowlist hardcoded pela
checagem real de `user.permissions?.includes('supervision:intervene')`.
