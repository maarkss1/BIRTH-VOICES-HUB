- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema
Resolvendo `.agents/handoffs/onda-2/02-para-01-audit-log-listagem.md`: implementei
`GET /api/audit-log`. `pages/Dashboard/Organization.tsx` (seu) hoje mostra um `EmptyState`
honesto ("Consulta de auditoria ainda não disponível") na aba "Audit Log" — o endpoint agora
existe e pode substituir esse estado por dados reais.

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Organization.tsx` (seu, não alterei).

## Alteração necessária
`GET /api/audit-log?page=1&pageSize=20` (cookies de sessão, mesma auth do resto do app), somente
para `admin` do tenant (403 para outros roles). Resposta:

```json
{
  "items": [
    { "id": "...", "userId": "...", "actorEmail": "admin@empresa.com", "action": "USER_LOGIN", "details": {}, "timestamp": "2026-01-01T00:00:00.000Z" }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 42,
  "totalPages": 3
}
```

`actorEmail` pode ser `null` (usuário removido/anonimizado via LGPD, ou evento sem ator). `action`
é uma das strings já em uso em `writeAuditLog(...)` pelo backend (`USER_CREATE_BY_ADMIN`,
`USER_LOGIN`, `CALL_LOG_CREATE`, `WORKFLOW_PUBLISH`, etc. — ver `grep -rn writeAuditLog src/` para
o catálogo atual). Trocar o `EmptyState` da aba "Audit Log" por uma tabela paginada consumindo
esse endpoint (loading/error state normal, `AGENTS.md` §14 — nada fabricado se a lista vier
vazia).

## Teste esperado
Uma ação sensível real (ex.: criação de usuário via admin) aparece na listagem logo após ser
executada, paginação funcional, sem vazamento cross-tenant (já validado no backend).

## Contexto adicional
Não bloqueador. Rota já coberta por teste automatizado (`src/services/auditLogService.test.ts`)
e validação manual ponta a ponta (isolamento de tenant + gate de role admin).
