- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 3
- Status: aberto
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
