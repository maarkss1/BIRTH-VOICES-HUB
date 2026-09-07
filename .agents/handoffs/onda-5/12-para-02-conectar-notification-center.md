- De: Agente 12 (Growth, Billing e Monetização de Uso)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 5
- Status: aberto
- Prioridade: normal

## Problema
`components/Sidebar.tsx` tem um sino de notificação + painel overlay com 5 itens fixos em
`useState` local (conteúdo inventado, selo "Exemplo" no cabeçalho — ver
`.agents/handoffs/onda-2/02-para-00-notificacoes-backend.md`, agora resolvido do lado de
backend/componente por este agente). O backend real e um componente próprio já existem; falta só
a troca de renderização dentro do `Sidebar.tsx`, arquivo que este agente não edita (`AGENTS.md`
§11 — `components/Sidebar.tsx` é seu).

## Arquivo(s) envolvido(s)
- `components/Sidebar.tsx` (seu) — precisa da alteração.
- `components/NotificationCenter/NotificationCenter.tsx` (meu, novo, pronto para uso) — componente
  autocontido: gerencia seu próprio fetch, estado aberto/fechado, loading/empty/error e ações de
  marcar como lida/marcar todas como lidas. Não recebe nem precisa de props de dados — só aceita
  `className?: string` opcional para posicionamento do botão-sino.
- `components/NotificationCenter/index.ts` — re-exporta `NotificationCenter` (named e default).

## Alteração necessária
Em `components/Sidebar.tsx`:
1. Importar: `import { NotificationCenter } from './NotificationCenter';`
2. Substituir todo o bloco do sino de notificação (linhas ~167-180, `{/* Notification Bell
   trigger */}`) por `<NotificationCenter />` no mesmo lugar (dentro do header, ao lado do
   `AtlasLogo`).
3. Remover o bloco `{/* OVERLAY NOTIFICATION DRAWER / PANEL */}` inteiro (linhas ~368-448) — o
   painel agora vive dentro do próprio `NotificationCenter` (ele é fixado por `position: fixed`
   com `w-64`/`h-screen`, do mesmo tamanho do Sidebar, então some visualmente no lugar certo sem
   precisar estar aninhado na árvore de overlay do Sidebar).
4. Remover o state e as funções que só existiam para o painel hardcoded, agora mortos:
   `notifications` (`useState` com os 5 itens fixos), `notifOpen`/`setNotifOpen`,
   `notifFilter`/`setNotifFilter`, `markAllRead`, `clearNotification`, `unreadCount`,
   `filteredNotifications`. Também remover o import de `Bell`/`Trash2` de `lucide-react` se
   ficarem sem uso após a remoção (confirme com o linter/typecheck).

O `NotificationCenter` novo não tem filtro por categoria (`all/system/ia/calls/billing`) nem botão
de excluir notificação individual — `Notification` no schema não tem campo de categoria, e não há
endpoint de exclusão (só marcar como lida). Se isso for um requisito de produto, é uma extensão de
escopo nova: abra handoff de volta para mim (ou peça o campo/endpoint) em vez de tentar recriar
esse comportamento no componente por conta própria.

## Teste esperado
- `components/Sidebar.test.tsx` (seu) continua passando após a troca — ajuste os testes que hoje
  interagem com o painel hardcoded (abrir o sino, ver "Exemplo", contagem fixa de notificações)
  para refletir o componente real; se preferir, mocke `../NotificationCenter` no teste do Sidebar
  para isolar a árvore (mesmo padrão já usado para outros subcomponentes, se houver).
- Visualmente: sino no header do Sidebar mostra contagem real de não lidas (0 = sem badge); clique
  abre o painel real consumindo `/api/notifications`; nenhuma menção a "Exemplo" no cabeçalho.

## Contexto adicional
Não bloqueador — o Sidebar continua funcional com o sino hardcoded até esta troca ser feita; não é
uma regressão de segurança nem um vazamento de dado, só a mesma mitigação "Exemplo" que já existia
desde a Onda 2 continuando visível por mais um tempo. Ver
`.agents/handoffs/onda-2/02-para-00-notificacoes-backend.md` (`## Resolução`) para o detalhamento
completo do backend (rotas, decisão sobre o model `Notification`, isolamento por `userId`).
