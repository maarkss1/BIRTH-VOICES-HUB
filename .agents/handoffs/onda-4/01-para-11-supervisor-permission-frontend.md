- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Onda: 4
- Status: resolvido
- Prioridade: normal

## Problema
Resolvendo `.agents/handoffs/onda-4/11-para-01-supervisor-role-rbac.md`: criei um `Permission`
real (`supervision:intervene`), atribuível a qualquer `Role`, em vez do role fixo `admin` como
proxy. Um novo role de sistema `supervisor` já existe e recebe essa permissão por padrão — um
tenant pode agora promover um `user` a `supervisor` (via `PUT /api/users/:id { role:
'supervisor' }`, já aceito pelo validador) sem lhe dar acesso total de `admin`.

`components/LiveSupervisor/LiveSupervisor.tsx` é seu e eu não o alterei. Ele ainda usa:

```ts
const ROLES_ALLOWED_TO_INTERVENE = ['admin'];
const canIntervene = !!user && ROLES_ALLOWED_TO_INTERVENE.includes(user.role);
```

Isso continua funcionando sem regressão (um `admin` continua podendo intervir — a permissão
`supervision:intervene` é concedida a `admin` por padrão), mas não reconhece o novo role
`supervisor` no lado do cliente: um usuário promovido a `supervisor` não veria o botão de
intervenção habilitado, mesmo que o servidor (uma vez que o handoff irmão
`01-para-00-intervene-permission-socketio.md` seja aplicado por 00) já aceitaria a ação dele.

## Arquivo(s) envolvido(s)
- `components/LiveSupervisor/LiveSupervisor.tsx` (seu).
- Depende de `01-para-00-intervene-permission-socketio.md` (Agente 00 dono de `server.ts`) para a
  checagem autoritativa no servidor mudar de fato — sem isso, mesmo atualizando o cliente, o
  servidor ainda rejeitaria um `supervisor` (fail-closed, sem vazamento).

## Alteração necessária
Duas opções, dependendo do que preferir:

1. **Mínima**: trocar o array hardcoded para incluir o novo role:
   `const ROLES_ALLOWED_TO_INTERVENE = ['admin', 'supervisor'];` — funciona, mas volta a ser um
   valor mágico de string (o mesmo problema que motivou o handoff original).

2. **Alinhada ao novo modelo (recomendada)**: `GET /api/auth/me` agora retorna
   `user.permissions: string[]` (calculado ao vivo, nunca fabricado) além de `role`. Ex.:
   `{ user: { id, email, role, tenantId, permissions: ["supervision:intervene"] } }`. Se
   `useSessionStore`/o tipo de usuário no cliente (fora do meu escopo — provavelmente Agente 02)
   passar a carregar esse campo, `LiveSupervisor.tsx` pode trocar para:
   `const canIntervene = !!user && user.permissions?.includes('supervision:intervene');`
   Isso já é só UX (gate real continua no servidor, comentário existente no arquivo já deixa isso
   claro) — não é bloqueador de segurança se ficar para depois.

## Teste esperado
- Um usuário com role `supervisor` vê o controle de intervenção habilitado e a ação é aceita pelo
  servidor (após `01-para-00-...` ser resolvido).
- Um usuário `user` comum continua sem o controle.

## Contexto adicional
Não bloqueador — o gate atual (`admin`-only) é estritamente mais restritivo que o necessário,
nunca mais permissivo, então não há vazamento de acesso enquanto isso não for resolvido.

## Resolução
Apliquei a opção **mínima** descrita acima em `components/LiveSupervisor/LiveSupervisor.tsx`:

```ts
const ROLES_ALLOWED_TO_INTERVENE = ['admin', 'supervisor'];
```

Motivo de não ter ido direto para a opção alinhada (`user.permissions`): ela depende de
`store/useSessionStore.ts` (propriedade do Agente 02) expor `permissions?: string[]` em
`SessionUser`, populado a partir de `GET /api/auth/me`. O Agente 02 está ocupado em outra missão
agora e essa dependência não pode ser resolvida sem esperar ou sem invadir um arquivo fora da
minha propriedade exclusiva (`AGENTS.md` §11). Como a opção mínima funciona sem regressão — é
estritamente uma extensão do array existente, mesmo padrão de código já presente no arquivo — e
não há vazamento de acesso em nenhum dos dois casos (o servidor continua sendo a checagem
autoritativa via `hasPermission()`), apliquei-a agora e deixei a evolução registrada em
`.agents/handoffs/onda-4/11-para-02-sessionuser-permissions.md` para o Agente 02 pegar quando
tiver janela.

Também atualizei o comentário acima da constante (estava desatualizado, ainda descrevendo `admin`
como "proxy" na ausência de um role dedicado) e o comentário em `intervention_error` que ainda
citava `server.ts, ROLES_ALLOWED_TO_INTERVENE` como a checagem do servidor — a checagem real hoje é
`hasPermission()` sobre a permissão `supervision:intervene` (aplicada pelo Coordenador em
`server.ts`, handoff `01-para-00-intervene-permission-socketio.md`).

Adicionei um teste de regressão em `LiveSupervisor.test.tsx` (`'also allows the dedicated
supervisor role to intervene, not just admin'`) cobrindo o novo role.

Validações executadas neste worktree (branch `agente/11-remediacao-onda4`):
- `npm run typecheck` — OK, sem erros.
- `npm run lint` — 0 erros, 86 warnings pré-existentes (`no-explicit-any` em arquivos de teste/
  serviços fora do meu escopo); `npx eslint components/LiveSupervisor/` isolado — 0 problemas.
- `npm run test` — 52 arquivos passaram, 1 skip (pré-existente, não relacionado); 326 testes
  passaram, 1 skip; inclui os 11 testes de `LiveSupervisor.test.tsx` (10 pré-existentes + 1 novo).
- `npm run build` — build de produção (`vite build` + bundle do `server.ts`) concluído com sucesso.

Arquivos alterados: `components/LiveSupervisor/LiveSupervisor.tsx`,
`components/LiveSupervisor/LiveSupervisor.test.tsx` (ambos dentro da minha propriedade exclusiva).
Nenhum arquivo fora de `components/LiveSupervisor/**` foi tocado.
