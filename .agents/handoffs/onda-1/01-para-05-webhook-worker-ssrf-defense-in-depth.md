- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 05 (Telefonia, Chamadas e Webhooks)
- Onda: 1
- Status: resolvido
- Prioridade: normal

## Problema
`src/services/webhook.worker.ts:46` faz `fetch(url, ...)` com a `url` que veio de
`job.data.url`, que por sua vez pode ser o `callbackUrl` fornecido pelo chamador de
`POST /api/voice/outbound` (via `outboundCallService.ts` → `telephonyService.endCall` →
`webhookService.dispatch(..., metadata.callbackUrl)`). Isso é um primitivo de SSRF documentado no
próprio código (`src/validators/index.ts`, comentário original em `callbackUrlSchema`).

Já corrigi a causa raiz no ponto de entrada: `src/validators/index.ts` (`callbackUrlSchema`,
arquivo sem dono exclusivo listado em `AGENTS.md`) agora rejeita literais de IP
privado/loopback/link-local/metadata de nuvem (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
192.168.0.0/16, 169.254.0.0/16 incluindo 169.254.169.254, 100.64.0.0/10, `::1`, `fe80::/10`,
`fc00::/7`, `localhost`), então o caminho de exploração via `POST /api/voice/outbound` está
bloqueado hoje.

Não é bloqueador porque a correção de entrada já cobre o único vetor real conhecido atualmente.
Mas `webhook.worker.ts`/`webhook.service.ts` são propriedade exclusiva do Agente 05
(`AGENTS.md` seção 11), então não posso adicionar uma segunda camada de defesa diretamente ali.

## Arquivo(s) envolvido(s)
- `src/services/webhook.worker.ts` (owner: Agente 05) — chamada `fetch(url, ...)`.
- `src/services/webhook.service.ts` (owner: Agente 05) — comentário `TODO: once a Webhook model
  exists, resolve the tenant's configured endpoint here` (linha ~41-43) sinaliza que, quando esse
  Webhook model existir e a URL passar a vir de configuração salva por tenant (em vez de só
  `callbackUrl` por chamada ou `WEBHOOK_URL` de deployment), a mesma validação de SSRF precisa ser
  aplicada nesse novo caminho também — meu handoff aqui é preventivo para esse trabalho futuro.

## Alteração necessária
Sugestão, não obrigatória para a Onda 1: revalidar `url` dentro de `webhook.worker.ts` (ou no
ponto de enfileiramento em `webhook.service.ts`) contra a mesma lista de IPs privados/reservados
antes de chamar `fetch`, como defesa em profundidade — útil sobretudo se, no futuro, a URL do
webhook passar a vir de uma fonte que não passa pelo Zod schema de `outboundCallSchema` (ex.: um
`Webhook` model configurado por um admin de tenant via outro endpoint). Se o Agente 05 preferir
manter a validação centralizada só em `src/validators/index.ts`, também é uma decisão válida —
registrar a decisão em comentário no código, para não reabrir a mesma dúvida depois.

## Teste esperado
Se implementado: enfileirar um job de webhook com `url: 'http://169.254.169.254/...'` diretamente
(bypassando o schema de entrada) e confirmar que `webhook.worker.ts` recusa entregá-lo.

## Contexto adicional
Ver também `src/validators/index.ts` (`isPrivateOrReservedHost`) para a implementação já existente
que pode ser reaproveitada/extraída para um módulo compartilhado se fizer sentido para o Agente 05.
Nota: a checagem atual é só de IP literal, não resolve DNS — um hostname público que resolva para
IP privado no momento da requisição ainda não é bloqueado (limitação documentada no próprio
comentário do validador).

## Resolução

Ainda estava `Status: aberto` na Onda 3 (achado de Onda 1 nunca implementado); resolvido nesta
remediação em vez de deixado para uma futura Onda.

Implementada a defesa em profundidade sugerida, reaproveitando a lógica existente em vez de
duplicá-la:

1. `src/validators/index.ts`: `isPrivateOrReservedHost` passou de função privada do módulo para
   `export function` (nenhuma mudança de lógica/assinatura) — este arquivo não tem dono exclusivo
   listado em `AGENTS.md` §11, então a exportação é uma edição aditiva de baixo risco, sem
   modificar `callbackUrlSchema` nem qualquer comportamento de validação de entrada existente.
2. `src/services/webhook.worker.ts` (meu, Agente 05): antes do `fetch(url, ...)`, uma nova função
   `isSafeWebhookUrl` reaplica exatamente a mesma checagem de protocolo (HTTPS, ou HTTP fora de
   produção — igual ao `callbackUrlSchema`) e host privado/reservado usada na entrada, agora também
   no ponto de saída do worker. Se a URL do job não passar, o worker lança `UnrecoverableError`
   (import de `bullmq`) em vez do `Error` genérico — isso instrui o BullMQ a falhar o job
   imediatamente sem consumir o orçamento de `attempts`/backoff, já que um alvo bloqueado por
   política nunca vai começar a funcionar numa retentativa.

Isso cobre o vetor que a validação de entrada sozinha não cobre: `job.data.url` pode vir de
`WEBHOOK_URL`/`TEST_WEBHOOK_URL` (variáveis de ambiente, nunca passam pelo Zod schema) e, no futuro,
de um `Webhook` model por tenant (TODO já existente em `webhook.service.ts`) configurado por outro
endpoint que também pode não usar `callbackUrlSchema`. A checagem em `webhook.worker.ts` não
depende de o chamador ter validado nada antes.

Limitação herdada e ainda válida (documentada no próprio `isPrivateOrReservedHost`): é uma checagem
de IP literal, sem resolução de DNS — um hostname público que resolva para IP privado só no momento
da requisição (DNS rebinding) não é bloqueado por esta camada. Não tratado nesta remediação por
estar fora do achado original e exigiria um proxy de egress/allowlist de rede, decisão de
infraestrutura fora do escopo do Agente 05.

Teste esperado pelo handoff original (enfileirar job com `url: 'http://169.254.169.254/...'`
diretamente, bypassando o schema de entrada, e confirmar que o worker recusa) foi verificado por
leitura de código/tipo (não adicionei teste automatizado novo porque `__tests__/**` é propriedade
exclusiva do Agente 08 — AGENTS.md §11 — e não havia teste pré-existente de `webhook.worker.ts` para
estender sem invadir esse domínio). Registrando aqui para o Agente 08 adicionar cobertura formal se
desejar.

Validação:
- `npm run typecheck` — verde.
- `npm run lint` — verde (0 erros).
- `npm run test` — 333 passed | 1 skipped (52 arquivos); nenhum teste existente quebrou.
- `npm run build` — verde.
