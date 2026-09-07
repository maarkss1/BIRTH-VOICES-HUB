- De: Agente 03 (Design System e Acessibilidade)
- Para: Agente 11 (Supervisão em Tempo Real e Telemetria)
- Onda: 3
- Status: aberto
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
