- De: Agente 02 (Produto, Navegação e UX)
- Para: Agente 00 (Coordenador) — para atribuir dono definitivo
- Onda: 2
- Status: resolvido (Agente 12, Onda 5)
- Prioridade: normal

## Problema
`components/Sidebar.tsx` (shell, meu) tem um painel de notificações com 5 itens fixos em
`useState` local, com conteúdo de negócio inventado ("Lead Quente Identificado: Isabela Santos
qualificada...", "Conexão SIP Ativa em 04 canais...", timestamps relativos fixos "Há 5m",
"Ontem"). Não existe nenhum model/rota de notificações no backend — confirmado via busca em
`src/routes/index.ts` e `prisma/schema.prisma`.

## Correção já aplicada nesta onda (mitigação, não solução definitiva)
O cabeçalho do painel agora tem um selo "Exemplo" explícito, deixando claro que o conteúdo é
ilustrativo e não eventos reais do sistema (`AGENTS.md` §14: dado de demonstração precisa estar
rotulado). Não removi o painel inteiro porque (a) construir um sistema de notificações real é
uma feature de backend fora do escopo de Produto/Navegação/UX desta onda, e (b) remover a
funcionalidade de "abrir/fechar/marcar como lida" sem substituto pioraria a experiência sem
necessidade.

## Arquivo(s) envolvido(s)
- `components/Sidebar.tsx` (meu, já mitigado com selo "Exemplo")
- Precisaria de: novo model Prisma de notificação + rotas — fora do meu escopo de arquivos.

## Alteração necessária
Decisão de produto sobre se vale a pena um sistema de notificações real nesta fase, e, se sim,
atribuir a um agente dono (provável candidato: quem tratar Observability/Supervision, já que
boa parte do conteúdo de exemplo é sobre chamadas/telefonia/segurança).

## Teste esperado
Quando existir, o painel deve consumir `/api/notifications` (ou equivalente) real, tenant-
scoped, e o selo "Exemplo" deve ser removido junto com os dados de exemplo.

## Contexto adicional
Não bloqueador. Nenhuma ação destrutiva depende deste painel.

## Resolução

Agente 12 (Growth, Billing e Monetização de Uso), Onda 5, branch `agente/12-notificacoes`.

**Model Prisma**: `Notification` já existia no schema (adicionado antes desta execução, `id,
userId, title, message, isRead, createdAt`, sem `tenantId`, sem canal). Decisão: usar o model
como está para uma primeira versão real, só in-app, escopada por `userId` — **sem** abrir handoff
de extensão de schema para o Agente 01. Justificativa: o próprio comentário já presente acima de
`model Notification` no schema confirma que filtrar por `userId` é tenant-safe, já que `User`
pertence a exatamente um `Tenant` (`User.tenantId`), **desde que** `userId` sempre venha de
`req.user.id` (nunca de payload/query do cliente) — é exatamente isso que
`notification.controller.ts`/`notificationService.ts`/`notificationRepository.ts` fazem. Não há
hoje canal e-mail/webhook a vazar entre tenants (AGENTS.md §16 item 12) porque só existe entrega
in-app nesta primeira versão; canal e-mail/webhook fica para uma extensão de schema futura, se e
quando um domínio consumidor precisar dele.

**Backend implementado** (Clean Architecture, Controller → Service → Repository):
- `src/repositories/notificationRepository.ts` — criar, listar paginado, contar não lidas, marcar
  como lida (com verificação de posse antes do update, já que `Notification` só tem `id` como
  campo único), marcar todas como lidas.
- `src/services/notificationService.ts` — mapeia para DTO, expõe `createNotification` como ponto
  de entrada genérico (qualquer domínio pode chamar diretamente, sem construir um sistema
  paralelo — ver comentário no topo do arquivo).
- `src/controllers/notification.controller.ts` + `src/routes/notification.routes.ts`:
  - `GET /api/notifications?page=&pageSize=` — feed paginado + `unreadCount`.
  - `POST /api/notifications/:id/read` — marca uma como lida (404 se não existir OU pertencer a
    outro usuário — mesmo fallback, nunca revela existência cross-user/cross-tenant).
  - `POST /api/notifications/read-all` — marca todas como lidas.
  - Montadas em `src/routes/index.ts`. Todas atrás de `requireTenant` (autenticado), sem
    `requireRole` extra — cada usuário só enxerga/altera as próprias notificações.
- `billing.controller.ts` (`changePlanHandler`) agora emite uma notificação real
  ("Plano atualizado") ao trocar de plano com sucesso, via `createNotification` — primeiro
  consumidor do engine genérico, best-effort (falha ao notificar não derruba a troca de plano já
  persistida).

**Frontend**: `components/NotificationCenter/` (novo, próprio deste agente) — `NotificationCenter.tsx`
(sino + painel consumindo `/api/notifications*` real, com loading/empty/error explícitos,
AGENTS.md §14), `formatRelativeTime.ts`, `index.ts`, `NotificationCenter.test.tsx`. Estilizado para
o fundo escuro fixo do `Sidebar.tsx` (`bg-slate-900`), não para os tokens de tema claro/escuro do
resto do dashboard, já que é o único lugar onde deve renderizar hoje.

**Pendência que continua com o Agente 02**: este agente não edita `components/Sidebar.tsx`
(AGENTS.md §11). Handoff de conexão aberto em
`.agents/handoffs/onda-5/12-para-02-conectar-notification-center.md` pedindo a troca do
sino+painel hardcoded (incluindo o selo "Exemplo") por `<NotificationCenter />`.

**Validação**: `npm run typecheck`, `npm run lint` (0 erros), `npm run test` (372 passed, 1
skipped pré-existente) e `npm run build` — todos verdes nesta branch.
