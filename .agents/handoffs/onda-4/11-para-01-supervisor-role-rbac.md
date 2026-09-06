- De: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Onda: 4
- Status: aberto
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
