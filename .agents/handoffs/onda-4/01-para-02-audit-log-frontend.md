- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 4
- Status: resolvido
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

## Resolução
Implementado em `pages/Dashboard/Organization.tsx`, aba "Audit Log" (mesmo arquivo apontado neste
handoff — não criei painel duplicado em `Admin.tsx`/`Governance.tsx`, que não tratam de
organização/tenant e não tinham nenhuma seção de auditoria fabricada a substituir).

- `EmptyState` fabricado ("Consulta de auditoria ainda não disponível") removido.
- Consumo real de `GET /api/audit-log?page=N&pageSize=20`, mesmo padrão de fetch com
  cookies de sessão já usado no resto da página (`/api/organizations`, `/api/users`).
- Gate de acesso no cliente espelhando o 403 do backend: usuário não-admin vê `EmptyState`
  "Acesso restrito" e nem chama o endpoint (mesmo padrão já usado na aba "Equipe & Permissões").
- Estados padronizados (`AGENTS.md` §14): `loading` (Skeleton), `error` (EmptyState com ação
  "Tentar novamente"), vazio (EmptyState honesto, sem dado fabricado) e pronto (tabela real via
  `Table`/`TableHead`/`TableRow`/`TableCell` do design system, mesmo padrão usado em
  `Observability.tsx`).
- Tabela mostra Ação, Ator (com fallback textual quando `actorEmail` é `null` — usuário
  removido/anonimizado via LGPD), Detalhes (JSON compacto, truncado com `title` para o valor
  completo) e Quando (timestamp local).
- Paginação funcional (Anterior/Próxima, desabilitada nos limites, contador "Página X de Y · N
  evento(s)") reusando `page`/`pageSize`/`total`/`totalPages` da resposta do backend.

### Validações (rodadas nesta branch, worktree `agent-ad6fc2d8cd5593a12`)
- `npm run typecheck`: OK, sem erros.
- `npm run lint`: OK — 0 erros, 86 warnings pré-existentes (`no-explicit-any` em testes/arquivos
  que não toquei); nenhum warning novo em `Organization.tsx`.
- `npm run test`: OK — 325 passed, 1 skipped (52 arquivos passed, 1 skipped), nenhuma regressão.
- `npm run test:e2e`: 2 passed (`health.spec.ts` x2), 1 failed
  (`auth.spec.ts` — registro retorna HTTP 500). Confirmado pré-existente e não relacionado a esta
  mudança: reproduzi a mesma falha com `git stash` (branch sem minha alteração) rodando o mesmo
  comando — ambiente de sandbox aqui não tem `DATABASE_URL`/Postgres provisionado, então qualquer
  rota que toca o banco (`/api/auth/register`) falha com 500 independente do frontend. Nenhum
  teste e2e existente toca a aba Audit Log.
- `npm run build`: OK — `vite build` + bundle do `server.cjs` concluídos sem erro (aviso normal de
  chunk >500kB, pré-existente, não relacionado a esta página).

Arquivo alterado: `pages/Dashboard/Organization.tsx` (nenhum arquivo de outro agente tocado).
