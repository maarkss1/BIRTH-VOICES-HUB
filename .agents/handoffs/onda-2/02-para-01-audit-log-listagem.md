- De: Agente 02 (Produto, Navegação e UX)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Onda: 2
- Status: resolvido
- Prioridade: normal

## Problema
`pages/Dashboard/Organization.tsx` tinha uma aba "Audit Log" mostrando uma única linha de
exemplo hardcoded (`John Doe`, `Alterou Prompt`, `agent_sales_v2`, "Hoje, 14:30"). O backend já
escreve eventos reais de auditoria (`writeAuditLog` é chamado em vários controllers —
`USER_CREATE_BY_ADMIN`, `USER_LOGIN`, `CALL_LOG_CREATE`, etc., persistidos no model `AuditLog`),
mas não existe nenhuma rota `GET` para listá-los — confirmado via busca em `src/routes/*.ts`
(só há chamadas de escrita, nenhum `router.get` para audit log).

## Correção já aplicada nesta onda (mitigação, não solução definitiva)
A aba "Audit Log" agora mostra um `EmptyState` honesto explicando que a consulta ainda não está
disponível, em vez da linha fabricada.

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Organization.tsx` (meu, já mitigado)
- `src/repositories/*` / novo controller+rota para audit log (fora do meu escopo — schema/dados
  são exclusivos do Agente 01)

## Alteração necessária
Adicionar `GET /api/audit-log` (ou equivalente), tenant-scoped, com paginação, para que
`Organization.tsx` (e potencialmente `Governance.tsx`) possam mostrar o histórico real de ações
sensíveis da organização.

## Teste esperado
Uma ação sensível real (ex.: criação de usuário via admin) deve aparecer na listagem logo após
ser executada, filtrada corretamente por tenant (sem vazamento cross-tenant).

## Contexto adicional
Não bloqueador — a aba antes mentia sobre ter histórico real; agora só admite que a consulta
ainda não existe. Nenhum dado de auditoria real foi exposto incorretamente.

## Resolução

Adicionado `GET /api/audit-log?page=&pageSize=`, tenant-scoped e paginado:

- `src/repositories/auditLogRepository.ts`: `listAuditLogsForTenant(tenantId, {page, pageSize})`
  — filtra por `tenantId` (nunca por payload do cliente), ordena por `timestamp desc`, inclui o
  email do autor via `include: { user: { select: { email: true } } }`.
- `src/services/auditLogService.ts`: `listAuditLog` (mapeia para o formato de resposta) e
  `parsePagination` (sanitiza `page`/`pageSize` vindos de query string — nunca confia no valor
  cru do cliente; `pageSize` é limitado a 100).
- `src/controllers/auditLog.controller.ts` + `src/routes/auditLog.routes.ts`: rota registrada em
  `src/routes/index.ts`, atrás de `requireTenant` + `requireRole(['admin'])` — mesmo nível de
  acesso de `GET /api/users`, já que o audit log pode revelar histórico operacional sensível.

Resposta: `{ items: [{id, userId, actorEmail, action, details, timestamp}], page, pageSize,
total, totalPages }`.

Testado manualmente ponta a ponta contra Postgres local: um evento real inserido no `AuditLog`
aparece na listagem do tenant correto, um segundo tenant não vê o evento do primeiro (isolamento
confirmado), e um usuário não-admin recebe 403. Testes automatizados em
`src/services/auditLogService.test.ts`.

Não alterei `pages/Dashboard/Organization.tsx` (propriedade do Agente 02) — ver handoff
`.agents/handoffs/onda-4/01-para-02-audit-log-frontend.md` para o consumo do novo endpoint.
