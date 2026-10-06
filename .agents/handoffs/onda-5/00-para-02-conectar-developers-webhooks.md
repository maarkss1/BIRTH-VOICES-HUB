- De: Agente 00 (Coordenador)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema

`pages/Dashboard/Developers.tsx`, aba "Webhooks", está no estado vazio real desde a Onda 2 (sem
fabricar dado, mas também sem persistência) — ver `.agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md`.
O backend agora existe, mesclado em `integracao/onda-5`: `src/controllers/webhookEndpoint.controller.ts`
+ `src/routes/webhookEndpoint.routes.ts` (contrato HTTP estável, não muda mesmo que a persistência
real ainda esteja sendo finalizada em paralelo por outro agente nesta mesma onda).

## Contrato (já implementado, admin-only, `requireRole(['admin'])`)

- `POST /api/developers/webhooks` — body `{ url: string, events: string[] }` (`events`: lista de
  tipos como `["call.completed"]` ou `["*"]` para todos, 1-20 itens). Retorna 201 com
  `{ webhookEndpoint: {...}, secret: string }` — **`secret` só vem nesta resposta, nunca mais
  recuperável**. A UI precisa deixar isso explícito (modal/aviso "copie agora, não será mostrado de
  novo") e nunca tentar buscá-lo depois.
- `GET /api/developers/webhooks` — `{ webhookEndpoints: [...] }`, metadata apenas (nunca inclui
  segredo).
- `DELETE /api/developers/webhooks/:id` — `{ success: true }`.
- `POST /api/developers/webhooks/:id/regenerate-secret` — mesmo formato de resposta do create, novo
  `secret` em texto plano uma única vez, invalida o anterior.
- Erros: 400 (validação Zod), 409 (limite de 5 endpoints ativos por tenant atingido), 404 (endpoint
  não encontrado/não pertence ao tenant), 503 (persistência ainda não disponível nesta implantação
  — trate como "funcionalidade indisponível temporariamente", nunca como "sem endpoints").

Ver `docs/api/openapi.yaml` (Agente 09 está sincronizando isso em paralelo nesta mesma onda — se
já estiver lá quando você começar, use como fonte de verdade preferencial sobre este handoff).

## Alteração necessária

Substituir o estado vazio da aba "Webhooks" em `Developers.tsx` por: listagem real (`GET`), formulário
de criação (`POST`) com validação de URL pública (mesma mensagem de erro do backend deve ser
propagada, não reescrita), exibição do segredo em texto plano só no momento da criação/regeneração
(com aviso claro de que não será mostrado de novo), ação de remover, ação de regenerar segredo com
confirmação (regenerar invalida o segredo atual — avisar antes de confirmar). Estados de
loading/erro/vazio seguindo o mesmo padrão já usado no resto do dashboard (`AGENTS.md` §14).

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Developers.tsx` (seu).
- Hook novo se fizer sentido (`hooks/useWebhookEndpoints.ts` ou similar), seguindo o padrão já
  usado por outros hooks de dashboard.

## Teste esperado
- Criar endpoint mostra o segredo uma única vez; navegar para outra aba e voltar não o reexibe.
- Erro 409 (limite atingido) mostra mensagem clara, não um erro genérico.
- Erro 503 mostra "funcionalidade temporariamente indisponível", nunca lista vazia disfarçada de
  "nenhum endpoint configurado".

## Contexto adicional
Não bloqueador de release. Se a persistência real ainda não tiver sido mesclada quando você
começar, toda a UI funciona igual — as chamadas reais só retornarão 503 até lá, que já é um estado
tratado pelo contrato acima.
