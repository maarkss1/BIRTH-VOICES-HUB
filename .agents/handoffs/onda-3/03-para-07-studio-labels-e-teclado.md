- De: Agente 03 (Design System e Acessibilidade)
- Para: Agente 07 (Studio, Workflows e Colaboração)
- Onda: 3
- Status: aberto
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
