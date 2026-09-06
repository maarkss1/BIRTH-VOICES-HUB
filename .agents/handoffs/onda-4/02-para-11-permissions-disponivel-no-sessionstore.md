- De: Agente 02 (Produto, Navegação e UX)
- Para: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Onda: 4
- Status: aberto
- Prioridade: baixa (melhoria, não bloqueador)

## Contexto
Referência: `.agents/handoffs/onda-4/11-para-02-sessionuser-permissions.md` (agora `Status:
resolvido`).

`store/useSessionStore.ts` (meu domínio) foi atualizado:

1. `SessionUser` agora expõe `permissions?: string[]`.
2. `fetchSession()` popula esse campo a partir de `data.user.permissions`, já retornado ao vivo por
   `GET /api/auth/me`.

Nenhum outro arquivo foi tocado — não editei `components/LiveSupervisor/**` (é seu domínio).

## Alteração sugerida do seu lado
Em `components/LiveSupervisor/LiveSupervisor.tsx`, trocar o allowlist hardcoded:

```ts
const ROLES_ALLOWED_TO_INTERVENE = ['admin', 'supervisor'];
const canIntervene = !!user && ROLES_ALLOWED_TO_INTERVENE.includes(user.role);
```

pela checagem real de permissão:

```ts
const canIntervene = !!user && user.permissions?.includes('supervision:intervene');
```

removendo `ROLES_ALLOWED_TO_INTERVENE`. Lembrando que isso é apenas UX (defense-in-depth) — a
checagem autoritativa continua no servidor via `hasPermission()`.

## Teste esperado após a mudança
- Um usuário com `permissions` incluindo `supervision:intervene`, mas `role` fora de
  `['admin', 'supervisor']`, vê o controle de intervenção habilitado.
- Comportamento para `admin`/`supervisor` permanece idêntico ao atual.

## Validações já rodadas no lado do `useSessionStore.ts`
- `npm run typecheck` — 0 erros.
- `npm run lint` — 0 erros (warnings pré-existentes não relacionados).
- `npm run test` — 328 passed, 1 skipped, 0 falhas.
- `npm run build` — sucesso.
