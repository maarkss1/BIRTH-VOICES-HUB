- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 3
- Status: resolvido
- Prioridade: normal

## Problema

Ao resolver `.agents/handoffs/onda-1/01-para-05-webhook-worker-ssrf-defense-in-depth.md`, adicionei
uma checagem de defesa em profundidade em `src/services/webhook.worker.ts` (função
`isSafeWebhookUrl`, reaproveitando `isPrivateOrReservedHost` exportada de
`src/validators/index.ts`): antes de `fetch(url, ...)`, o worker agora recusa URLs que apontem para
host privado/reservado/loopback/metadata de nuvem ou que não sejam HTTPS (HTTP só é aceito fora de
produção), lançando `UnrecoverableError` do BullMQ para falhar o job sem consumir o orçamento de
retry.

Não existe hoje nenhum teste unitário para `src/services/webhook.worker.ts` (verifiquei com
`grep -rln "webhook.worker" __tests__/`) e `__tests__/**` é propriedade exclusiva do Agente 08
(`AGENTS.md` §11), então não adicionei teste eu mesmo.

## Arquivo(s) envolvido(s)
- Novo: `__tests__/webhookWorker.test.ts` (ou nome equivalente que o Agente 08 preferir).
- Referência: `src/services/webhook.worker.ts` (função `isSafeWebhookUrl`, não exportada — testável
  via mock do `Worker`/`Job` do BullMQ chamando o processor com `job.data.url` apontando para um IP
  privado, e verificando que o handler lança sem chamar `fetch`).

## Alteração necessária
Cobertura para pelo menos:
1. `job.data.url = 'http://169.254.169.254/latest/meta-data/'` (ou `http://127.0.0.1:...`,
   `http://10.0.0.5/...`) → o processor deve lançar (idealmente checar que é instância de
   `UnrecoverableError` do `bullmq`) e **nunca** chamar `fetch`/`global.fetch` mockado.
2. `job.data.url` público e válido (`https://example.com/webhook`) → segue o fluxo normal,
   `fetch` é chamado.
3. (Opcional) `http://example.com/webhook` em `NODE_ENV=production` → recusado pelo mesmo motivo
   de protocolo, espelhando `callbackUrlSchema` em `src/validators/index.ts`.

## Teste esperado
`npm run test` verde com o novo arquivo, sem regressão nos demais 333 testes.

## Contexto adicional
Este é o teste que o handoff original de Onda 1 (`01-para-05-webhook-worker-ssrf-defense-in-depth.md`)
pedia como "Teste esperado" — verifiquei a correção por leitura de código/tipo, mas cobertura
automatizada formal cabe ao domínio do Agente 08.

## Resolução

Criado `__tests__/webhookWorker.test.ts` (Agente 08), cobrindo `isSafeWebhookUrl()` de
`src/services/webhook.worker.ts` de ponta a ponta através do processor real do `Worker` do BullMQ
(não uma reimplementação da função — o teste mocka apenas o construtor `Worker` de `bullmq` para
capturar o callback do processor sem abrir conexão real com Redis; `UnrecoverableError` é
reexportado do módulo `bullmq` real via `vi.importActual`, então os `instanceof` no teste validam
contra a mesma classe que o worker lança).

15 casos, todos passando:
1. Hosts privados/reservados/metadata de nuvem rejeitados com `UnrecoverableError` e **sem** chamar
   `fetch` (9 URLs parametrizadas x 2 assertions cada dentro do describe): `169.254.169.254` (HTTP
   e HTTPS — metadata endpoint clássico de SSRF), `127.0.0.1` (HTTP e HTTPS), `localhost`,
   `10.0.0.5`, `172.16.0.1`, `192.168.1.1`, `[::1]` (loopback IPv6).
2. `http://example.com/webhook` com `NODE_ENV=production` → rejeitado com `UnrecoverableError`
   (item 3/opcional do pedido original).
3. O mesmo `http://example.com/webhook` fora de produção (`NODE_ENV=test`) → **não** rejeitado,
   `fetch` chamado normalmente (espelha o comportamento documentado no próprio guard: HTTP só é
   aceito fora de produção).
4. Esquema não-http(s) (`file:///etc/passwd`) → rejeitado com `UnrecoverableError` em qualquer
   ambiente.
5. URL malformada (falha no parsing de `new URL(...)`) → rejeitada com `UnrecoverableError`.
6. `https://example.com/webhook` (URL pública HTTPS normal) → passa pelo guard sem ser bloqueada,
   `fetch` é chamado com método POST, headers e body esperados, e a promise do processor resolve.
7. Falha real de entrega (resposta HTTP 500 do destino) → propagada como `Error` comum, **não**
   `UnrecoverableError` — confirma que o guard não interfere no tratamento de retry legítimo do
   BullMQ para falhas transitórias.

### Validações executadas (branch `agente/08-remediacao-onda3`)
- `npm run typecheck` → verde, 0 erros.
- `npm run lint` → 0 erros (80 warnings pré-existentes de `@typescript-eslint/no-explicit-any` em
  mocks de teste de outros arquivos, já documentados em `TECHNICAL-DEBT-CHECKLIST.html`; o novo
  arquivo não introduziu nenhum).
- `npm run test` → 348 passed | 1 skipped (349 total) — os 333 testes anteriores + os 15 novos deste
  handoff, sem regressão.
- `npm run build` → verde (`vite build` + bundle `esbuild` do `server.ts`).

### Bug real encontrado no guard em si
Nenhum. `isSafeWebhookUrl()` se comportou exatamente como documentado em todos os 15 casos —
nenhum handoff adicional para o Agente 05 foi necessário.
