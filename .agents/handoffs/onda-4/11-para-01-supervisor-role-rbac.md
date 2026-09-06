- De: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Onda: 4
- Status: resolvido
- Prioridade: normal

## Problema
`prisma/seed.ts` só define dois `SYSTEM_ROLES`: `admin` e `user`. Não existe um role
`supervisor` dedicado. O LiveSupervisor precisa restringir a ação de "intervir na chamada" a
quem de fato supervisiona operação (não é nem todo `admin` de todo tenant, nem qualquer `user`),
mas hoje a única opção é usar `admin` como proxy — o que é conservador (nunca concede mais do que
"qualquer usuário autenticado" concederia), mas também impreciso: um admin de billing/organização
que nunca deveria ver chamada ao vivo passa no teste, e não há como conceder a capacidade a um
`user` que deveria poder supervisionar sem promovê-lo a admin completo.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma`/`prisma/seed.ts` (model `Role`/`Permission`, `SYSTEM_ROLES`) — exclusivo
  do Agente 01.
- `components/LiveSupervisor/LiveSupervisor.tsx` (`ROLES_ALLOWED_TO_INTERVENE`, meu) e o bloco
  Socket.io de `server.ts` (mesmo array, ver handoff `11-para-00-socketio-tenant-rbac-audit.md`,
  já resolvido pelo Coordenador) precisam ser atualizados juntos quando o role existir.

## Alteração necessária
Avaliar se vale criar um `Permission` (ex.: `supervision:intervene`) atribuível a qualquer `Role`
(inclusive um novo role `supervisor`, se fizer sentido de produto), em vez de um role fixo hardcoded
no cliente/servidor. Isso é mais alinhado ao modelo de RBAC já existente (`Role` → `Permission`)
do que adicionar mais um valor mágico de string.

## Teste esperado
Usuário com o novo role/permission consegue intervir; `admin` sem ele não deveria (se a decisão de
produto for restringir também admins não-operacionais); `user` sem ele continua bloqueado.

## Contexto adicional
Não bloqueador — `admin` como proxy é estritamente mais restritivo que "qualquer autenticado",
nunca mais permissivo, então não há vazamento de acesso enquanto isso não for resolvido. Fica
para uma próxima execução do Agente 01, priorização de produto.

## Resolução

O model `Role`/`Permission` (many-to-many) já existia em `prisma/schema.prisma` — nenhuma
migração foi necessária, apenas dados (Permission + wiring) e código de aplicação:

- Nova `Permission` `supervision:intervene`, atribuível a qualquer `Role` (sistema ou
  tenant-custom), em vez de mais um valor mágico de string. Ver
  `src/repositories/roleRepository.ts` (`PERMISSIONS`, `SYSTEM_ROLE_DEFAULT_PERMISSIONS`).
- Novo role de sistema `supervisor`, recebendo `supervision:intervene` por padrão — um tenant pode
  agora promover um `user` a `supervisor` (via `PUT /api/users/:id { role: 'supervisor' }`) sem
  conceder acesso total de `admin`.
- `admin` também recebe `supervision:intervene` por padrão (superset, preserva o comportamento
  anterior — nenhuma regressão). `prisma/seed.ts` faz backfill idempotente para roles `admin` já
  existentes em bancos anteriores a esta mudança.
- `src/middlewares/rbac.ts`: `hasPermission(user, permission)` (resolve ao vivo contra
  Role/Permission, nunca confia em claim do JWT — revogação de permissão tem efeito imediato) e
  `requirePermission(permission)` (middleware Express) para uso futuro em rotas HTTP.
- `GET /api/auth/me` agora retorna `user.permissions: string[]` (calculado ao vivo) para uso do
  cliente (UX only — a checagem autoritativa continua sendo `hasPermission`/`requirePermission`
  no servidor).
- Testes novos: `src/repositories/roleRepository.permissions.test.ts`,
  `src/middlewares/rbac.permission.test.ts`. Validado manualmente ponta a ponta (registro →
  `admin` tem a permissão; `user` não tem; promover `user` a `supervisor` concede exatamente
  `supervision:intervene`, sem virar `admin`).

`server.ts` (Socket.io, `ROLES_ALLOWED_TO_INTERVENE`) e
`components/LiveSupervisor/LiveSupervisor.tsx` **não foram alterados** — ambos são de propriedade
exclusiva de outros agentes (00 e 11 respectivamente) e o array hardcoded atual continua seguro
(mais restritivo do que o novo modelo, nunca mais permissivo). Handoffs de consumo abertos:
- `.agents/handoffs/onda-4/01-para-00-intervene-permission-socketio.md` (Agente 00 → `server.ts`)
- `.agents/handoffs/onda-4/01-para-11-supervisor-permission-frontend.md` (Agente 11 →
  `LiveSupervisor.tsx`)

Decisão de produto em aberto (mencionada no pedido original): se `admin` deveria perder
`supervision:intervene` por padrão (restringindo também admins não-operacionais). Optei por manter
`admin` com a permissão para não introduzir regressão de acesso sem uma decisão explícita de
produto — trivial de revogar depois (`prisma/seed.ts` ou uma migração de dados pontual
desconectando a permissão do role `admin`).
