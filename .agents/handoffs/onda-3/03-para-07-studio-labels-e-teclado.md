- De: Agente 03 (Design System e Acessibilidade)
- Para: Agente 07 (Studio, Workflows e Colaboração)
- Onda: 3
- Status: em-andamento
- Prioridade: normal

## Problema
Auditoria de acessibilidade da Onda 3 encontrou dois grupos de achados em `components/studio/**`
(propriedade exclusiva do Agente 07 — não alterei os arquivos diretamente, ver
`.agents/prompts/03-design-a11y.md` → "Protocolo de falha fora do escopo").

### 1. Inputs sem `<label>` associado (ou sem label nenhum)
Vários campos de texto usam `<label>` solto (sem `htmlFor`) ou dependem só de `placeholder` como
identificação — nos dois casos, um leitor de tela não consegue anunciar o propósito do campo de
forma confiável (o `placeholder` some assim que o usuário digita e muitos leitores de tela não o
tratam como nome acessível). Este é exatamente o padrão que corrigi em
`components/design-system/index.tsx` (`Input`/`Textarea`/`Select` agora usam `React.useId()` +
`htmlFor`/`id` + `aria-describedby` para erro/helper) — o mesmo padrão serve aqui.

- `components/studio/panels/InspectorPanel.tsx`:
  - linha ~136-142: `<label>Node Title</label>` + `<input>` sem `htmlFor`/`id`.
  - linha ~145-151: `<label>Developer Notes / Description</label>` + `<textarea>` sem `htmlFor`/`id`.
  - linha ~213-229: label dinâmico por `key` de config + `<input>`/`<textarea>` sem `htmlFor`/`id`
    (o `key` já está disponível para gerar um id estável, ex. `` `config-${key}` ``).
  - linha ~260-278: "Variable Name" e "Value" (form de nova variável) — mesmo problema.
- `components/studio/panels/BottomDrawer.tsx`:
  - linha ~221-233 (form de nova variável, "key"/"value"): inputs só com `placeholder`, sem
    `<label>` nem `aria-label`.
  - linha ~507-511 (textarea de geração via IA, "Ex: Crie um fluxo completo..."): só `placeholder`,
    sem `<label>`/`aria-label` — este é o campo de entrada da funcionalidade "gerar workflow via
    IA", provavelmente o mais importante do painel.
- `components/studio/panels/LayersPanel.tsx`:
  - linha ~75-80 (busca "Pesquisar nós ou tags..."): só `placeholder`, sem `<label>`/`aria-label`.

Sugestão de correção mínima (sem mudar layout): onde já existe um `<label>` visível, ligar via
`htmlFor`/`id` (usando `React.useId()` para gerar ids estáveis, como fiz no design-system); onde só
há `placeholder` (BottomDrawer, LayersPanel), adicionar `aria-label` com o mesmo texto do
`placeholder` é suficiente e não exige alterar o visual.

### 2. Comportamento de teclado do canvas (`@xyflow/react`)
`components/studio/Canvas.tsx` usa a configuração padrão do `<ReactFlow>` sem nenhuma customização
de teclado própria (`deleteKeyCode`, `multiSelectionKeyCode`, `onKeyDown`, `tabIndex` etc. não
aparecem no arquivo) — ou seja, a navegação por teclado do canvas hoje é inteiramente a que a
biblioteca oferece nativamente (que é limitada: focar um nó e movê-lo com setas funciona quando o
nó já está selecionado via mouse, mas não há um jeito claro de tabular entre nós, abrir o
`InspectorPanel` de um nó, ou navegar as conexões (edges) só via teclado). Isso não é um bug que se
resolve com uma linha — é uma lacuna de design de interação que vale uma decisão conjunta:
- Meu prompt de Onda 3 pede auditoria conjunta comigo neste ponto específico (canvas do Studio tem
  "comportamento de teclado próprio a auditar em conjunto com o 07"), então estou registrando o
  achado aqui em vez de propor uma implementação unilateral em um arquivo que não é meu.
- Uma alternativa incremental e de baixo risco: manter uma lista paralela (ex. no `LayersPanel`, que
  já lista os nós) totalmente navegável por teclado como via alternativa de acesso a cada nó/edge,
  já que reimplementar navegação por teclado dentro do próprio canvas do xyflow é substancialmente
  mais complexo.

## Arquivo(s) envolvido(s)
- `components/studio/panels/InspectorPanel.tsx`
- `components/studio/panels/BottomDrawer.tsx`
- `components/studio/panels/LayersPanel.tsx`
- `components/studio/Canvas.tsx` (achado de teclado, sem linha específica — configuração ausente)

## Alteração necessária
Ver detalhamento por arquivo acima. Resumo:
1. `htmlFor`/`id` (ou `aria-label` quando não há `<label>` visível) em todo `<input>`/`<textarea>`
   listado.
2. Decisão conjunta sobre o caminho de acesso por teclado ao canvas (não é bloqueador de release).

## Teste esperado
- `screen.getByLabelText(...)` para cada campo citado deve passar a resolver o input correspondente
  (hoje só resolveria via `getByPlaceholderText`, que não é o mesmo que ter um nome acessível real).
- Se o LayersPanel virar via alternativa de navegação por nó, um teste de teclado (Tab + Enter)
  cobrindo "selecionar nó pela lista e ver o InspectorPanel abrir" seria o mínimo razoável.

## Contexto adicional
Nenhum destes itens é um bloqueador de release (achados de severidade moderada: campos continuam
utilizáveis com mouse/leitura visual, e o texto do placeholder ainda é lido por parte dos leitores
de tela ao focar o campo, só não é robusto). Registrando como normal para não perder o achado da
auditoria da Onda 3.

## Resolução (Agente 07 — remediação Onda 3)

### 1. Inputs sem `<label>` associado — resolvido
Segui o mesmo padrão do design-system (`React.useId()` + `htmlFor`/`id`; `aria-label` só onde não
havia `<label>` visível para não mudar layout):

- `components/studio/panels/InspectorPanel.tsx`:
  - "Node Title" e "Developer Notes / Description" agora usam `useId()` + `htmlFor`/`id`.
  - Campos dinâmicos da aba Setup (`data.config`) agora usam `id={`config-${id}-${key}`}` (o `id`
    do nó, não só a `key`, para garantir unicidade mesmo entre nós diferentes com a mesma chave de
    config) + `htmlFor` correspondente no `<label>` já existente.
  - "Variable Name" e "Value" (form de nova variável) agora usam `useId()` + `htmlFor`/`id`.
- `components/studio/panels/BottomDrawer.tsx`:
  - Inputs "key"/"value" do form de variável (Runtime Simulator) agora têm
    `aria-label="Nome da variável de telemetria"` / `aria-label="Valor da variável de telemetria"`.
  - Textarea do gerador de workflow via IA (aba Catarina AI Studio) agora tem
    `aria-label="Prompt em linguagem natural para gerar workflow via IA"`.
- `components/studio/panels/LayersPanel.tsx`:
  - Campo de busca "Pesquisar nós ou tags..." agora tem `aria-label="Pesquisar nós ou tags"`.

Teste esperado do handoff (`screen.getByLabelText(...)` resolvendo cada campo) está coberto por
testes novos e colocados junto dos componentes (não em `__tests__/**`, que é propriedade exclusiva
do Agente 08 — mesmo padrão de `components/design-system/index.test.tsx` e
`components/LiveSupervisor/LiveSupervisor.test.tsx`):
- `components/studio/panels/InspectorPanel.test.tsx` (5 testes)
- `components/studio/panels/BottomDrawer.test.tsx` (2 testes)
- `components/studio/panels/LayersPanel.test.tsx` (3 testes)

Todos os 10 testes passam (`npm run test`), junto com o restante da suíte (343 passed, 1 skipped
pré-existente).

### 2. Comportamento de teclado do canvas (`@xyflow/react`) — parcialmente resolvido
Confirmei o achado do Agente 03: `components/studio/Canvas.tsx` continua sem qualquer customização
de teclado própria (`deleteKeyCode`, `multiSelectionKeyCode`, `onKeyDown`, `tabIndex`, etc. não
aparecem no arquivo) — a navegação por teclado ali é inteiramente a nativa do `@xyflow/react`
(mover um nó já selecionado com as setas funciona; tabular entre nós, abrir o `InspectorPanel` de
um nó, ou navegar edges usando só teclado, não).

Implementei a mitigação incremental sugerida pelo Agente 03, dentro do meu domínio exclusivo
(`components/studio/panels/LayersPanel.tsx`, sem tocar `Canvas.tsx`):
- Aba "Layers" do `LayersPanel`: cada nó do workflow agora é um `<button>` real (antes era um
  `<div onClick>` sem `tabIndex`/suporte a teclado), com `aria-label` descritivo
  (`Selecionar nó {label} e abrir no inspetor`), que chama o mesmo `setSelectedNodeId` que o
  `Canvas.tsx` usa a partir da seleção no canvas — ou seja, é um caminho real e funcional, não uma
  cópia paralela: Tab até o nó na lista + Enter/Space seleciona o nó e abre o `InspectorPanel`
  exatamente como clicar nele no canvas faria.
- Estendi a mesma correção às abas "Node Specs" (adicionar nó ao canvas) e "Templates" (carregar
  workflow de exemplo) e "Favs" — todas eram `<div onClick>` sem suporte a teclado; agora usam
  `<button>` (Node Specs/Favs mantiveram `div` com `role="button"`/`tabIndex`/`onKeyDown` porque têm
  um botão de favoritar aninhado — `<button>` dentro de `<button>` é HTML inválido — mas Templates e
  Layers, sem elemento interativo aninhado, viraram `<button>` de verdade).
- Teste `LayersPanel.test.tsx` cobre exatamente o cenário pedido no handoff: foco via `Tab`
  (`.focus()` + `toHaveFocus()`) num item da lista de nós, `Enter` seleciona o nó no store, e o
  `InspectorPanel` (renderizado ao lado, como no `Canvas.tsx` real) passa a exibir os dados desse
  nó — prova de que o caminho alternativo funciona de ponta a ponta, não é só marcação.

**O que continua faltando (não implementado nesta remediação):** navegação por teclado *dentro do
próprio canvas* do `@xyflow/react` — Tab nativo entre nós/edges/handles, atalhos de teclado
customizados (`deleteKeyCode`, `multiSelectionKeyCode`), ou abrir o `InspectorPanel` a partir do
foco de um nó no canvas sem passar pelo mouse ou pelo `LayersPanel`. Isso exigiria uma
implementação bem maior (gerenciamento de foco custom sobre a lib `@xyflow/react`, possivelmente
`onNodeClick`/keyboard handlers por nó, e revisão de como o `ReactFlow` já implementa seu próprio
"keyboard preset" nativo) — desproporcional ao escopo desta remediação pontual e não é bloqueador
de release, conforme o próprio handoff original já registrava. Fica como débito técnico conhecido:
uma implementação completa de navegação por teclado nativa do canvas deve ser tratada como item de
roadmap dedicado (handoff futuro para 07, ou revisão conjunta com 03 na próxima onda de
acabamento), não "resolvida" por engano aqui.

### Validação executada
```
npm run typecheck   # OK, 0 erros
npm run lint        # OK, 0 erros (79 warnings pré-existentes de `any` em mocks de teste, fora do
                     # escopo desta remediação — já catalogados em TECHNICAL-DEBT-CHECKLIST.html)
npm run test        # OK, 343 passed | 1 skipped (54 arquivos passed, 1 skipped)
npm run build       # OK, vite build + esbuild server.cjs concluídos sem erro
```
