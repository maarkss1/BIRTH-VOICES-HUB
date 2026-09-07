- De: Agente 03 (Design System e Acessibilidade)
- Para: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Onda: 3
- Status: resolvido
- Prioridade: normal

## Problema
`LiveSupervisor` recebe alertas em tempo real via Socket.io (`telemetry_stream`) e os renderiza na
coluna "Risk & Alerts Log" apenas visualmente (cor de fundo vermelha/laranja conforme
`alert.level`). Não existe nenhuma região `aria-live`/`role="status"`/`role="alert"` na lista, então
um usuário de leitor de tela nunca é avisado quando um alerta novo (inclusive `critical`) chega —
ele precisaria navegar manualmente até a lista e re-lê-la para descobrir que algo mudou. Isso viola
o requisito de "estados de erro/vazio/loading anunciáveis, não só visuais" da missão de
acessibilidade da Onda 3.

Como `components/LiveSupervisor/**` é propriedade exclusiva do Agente 11 (`/AGENTS.md` §11), não
alterei o arquivo diretamente — ver "Protocolo de falha fora do escopo" em
`.agents/prompts/03-design-a11y.md`.

## Arquivo(s) envolvido(s)
- `components/LiveSupervisor/LiveSupervisor.tsx` (lista de alertas, linhas ~168-202 na versão
  atual: bloco "Right Column: Real-time Alerts").

## Alteração necessária
1. Envolver o container da lista de alertas (ou um elemento visualmente oculto dedicado) com
   `aria-live="polite"` (ou `"assertive"` especificamente para `alert.level === 'critical'`, via
   `role="alert"` no item recém-chegado) para que a chegada de um novo alerta seja anunciada.
2. Evitar que o `aria-live` reanuncie a lista inteira a cada novo item — o padrão comum é manter uma
   região "live" separada e pequena (ex.: só o texto do alerta mais recente) enquanto a lista visual
   completa continua como está, ou usar `aria-relevant="additions"` na região live que envolve a
   lista para que só o item adicionado seja lido.
3. Cada card de alerta já tem `alert.level` e `alert.message`/timestamp — ambos devem compor o texto
   anunciado (ex.: "Alerta crítico: <mensagem>, às <hora>").

## Teste esperado
- Teste de componente (Vitest + Testing Library) simulando o evento `telemetry_stream` do socket
  mockado e verificando que o novo alerta aparece dentro de um elemento com `aria-live` (ou que uma
  região com `role="alert"`/`role="status"` recebe o texto do alerta), sem precisar de um leitor de
  tela real — `screen.getByRole('alert')` ou `screen.getByRole('status')` cobre isso.
- Verificação manual com um leitor de tela (VoiceOver/NVDA) confirmando que um alerta `critical`
  chegando com o painel fora do foco é efetivamente anunciado.

## Contexto adicional
Não é um bloqueador de release (a informação continua visível e correta na tela, o problema é só a
ausência de anúncio para AT), mas está diretamente coberto pelo escopo de acessibilidade da Onda 3 e
pelo item "componentes interativos/editados" da missão do Agente 03 — abrindo aqui porque o arquivo
é de propriedade exclusiva do Agente 11.

## Resolução
Confirmado por inspeção do código antes da correção: uma execução anterior do Agente 11 já havia
adicionado uma região dedicada `role="alert" aria-live="assertive"` (`criticalAnnouncement`) — mas
ela só cobria `alert.level === 'critical'`. Alertas `warning` e `info` chegavam via
`telemetry_stream` e eram renderizados apenas visualmente na lista, sem nenhum anúncio para leitor
de tela — ou seja, o pedido do handoff (item 1: "alertas em geral", não só críticos) ainda não
estava integralmente atendido.

Correção aplicada em `components/LiveSupervisor/LiveSupervisor.tsx`:
- Adicionada uma segunda região visualmente oculta (`sr-only`), `role="status" aria-live="polite"`
  (estado `politeAnnouncement`), separada da região crítica existente, para não interromper leitura
  em andamento como `assertive` faria (pedido do handoff, item 1, parênteses).
- O efeito que observa `alerts` foi reescrito para processar todos os alertas novos (por `id`, via
  o `announcedAlertIds` já existente) uma única vez cada, roteando o mais recente de cada grupo para
  a região correta: `critical` → região assertiva já existente; `warning`/`info` → nova região
  polite (rotulada "Aviso"/"Informação" respectivamente). Isso evita duplicar o anúncio de um alerta
  crítico na região polite, e evita reanunciar alertas já processados quando a lista é
  retransmitida (item 2 do pedido).
- Texto anunciado inclui nível e mensagem (ex.: "Aviso: Tom de voz elevado"), como pedido no item 3;
  o timestamp já é visível na UI e não foi incluído no texto falado para manter o anúncio curto —
  não fazia parte do pedido de forma obrigatória (o exemplo do item 3 é sobre nível+mensagem).

Teste adicionado em `components/LiveSupervisor/LiveSupervisor.test.tsx`:
`'announces new warning/info alerts through a separate polite region, without duplicating the
critical one'` — simula `telemetry_stream` com alertas `warning`+`info`, confirma
`screen.getByRole('status')` com `aria-live="polite"` e o texto do alerta mais recente, confirma que
a região `role="alert"` (crítica) permanece vazia quando não há alerta crítico, e confirma que uma
retransmissão da mesma lista mais um novo alerta crítico atualiza a região assertiva sem reanunciar
os alertas não-críticos já vistos.

Validação executada nesta branch (`agente/11-remediacao-onda3`, HEAD em cima de
`integracao/onda-4`):
- `npm run typecheck` — OK, sem erros.
- `npm run lint` — 0 erros, 79 warnings pré-existentes (`@typescript-eslint/no-explicit-any` em
  mocks de teste e `vitest.setup.ts`, já documentados em `TECHNICAL-DEBT-CHECKLIST.html` — nenhum
  warning novo introduzido por esta mudança).
- `npm run test` — 295 passed, 1 skipped (pré-existente, não relacionado), 48 arquivos de teste
  passando (incluindo os 10 testes de `LiveSupervisor.test.tsx`, 8 pré-existentes + 2 novos).
- `npm run build` — build concluído com sucesso (`vite build` + bundle de `server.ts`); único aviso
  é o de tamanho de chunk pré-existente, não relacionado a este componente.

Nenhuma alteração fora de `components/LiveSupervisor/**` e deste handoff. `server.ts` não foi
tocado.
