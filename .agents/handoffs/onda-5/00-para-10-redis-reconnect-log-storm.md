- De: Agente 00 (Coordenador)
- Para: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Onda: 5
- Status: aberto
- Prioridade: normal (não bloqueador — não derruba o processo, custo é de I/O/observabilidade)

## Problema

Investigando a falha do smoke test "Docker Build Artifact" na PR #44 (causa raiz real era outra —
resolução via IPv4 explícito no `HEALTHCHECK`, ver commit da própria PR), observei que este
repositório hoje instancia pelo menos 6 clientes `ioredis` independentes, cada um com seu próprio
`.on('error', ...)`, sem `retryStrategy` customizado:

- `server.ts` (`redisClient`, health/socket.io)
- `src/middlewares/index.ts` (`rateLimitRedis`, limitador por API key)
- `src/middlewares/rateLimit.ts` (`redisClient`, novo — Onda 4, limitador por rota)
- `src/services/audit.ts` (`connection`)
- `src/services/slaScheduler.ts` (`redisClient`, BullMQ)
- `src/features/prospecting/lib/webhookIdempotency.ts` (`redisClient`)

(Fora os clientes internos que o próprio BullMQ cria para `webhook.worker.ts`/
`retentionScheduler.ts`/`slaScheduler.ts`.)

Quando o Redis está indisponível (como no ambiente do smoke test do Docker, que não sobe serviço de
Redis), o comportamento padrão de reconexão do `ioredis` (backoff começando em ~50ms) faz cada um
desses 6+ clientes tentar reconectar dezenas de vezes por segundo, e cada tentativa falha loga um
objeto de erro completo (stack trace incluso) via `logger.error(...)`. No smoke test, isso produziu
um volume de log muito alto em poucos segundos — não chegou a derrubar o processo (confirmado:
`server.ts` seguiu respondendo), mas é um padrão que, numa queda real de Redis em produção, geraria
um volume de log/custo de observabilidade desproporcional e potencial pressão de I/O (escritas
síncronas em stdout sob backpressure).

## Arquivo(s) envolvido(s)

Os 6 arquivos listados acima (múltiplos donos — `server.ts` é meu, os demais são de Agente 01/12/06
conforme a matriz de propriedade do `AGENTS.md` §11).

## Alteração necessária

Não é urgente nem bloqueador. Se for revisitado: um `retryStrategy` compartilhado, mais lento
(ex.: `(times) => Math.min(times * 500, 10_000)`), aplicado consistentemente a todos os clientes
`ioredis` deste repositório reduziria a frequência de tentativas (e, por consequência, o volume de
log) sem mudar o comportamento de fail-open já estabelecido em cada um. Alternativa mais simples:
throttle no próprio `logger.error` de cada handler `.on('error', ...)` (ex.: logar no máximo 1x a
cada N segundos por cliente).

## Teste esperado

Simular indisponibilidade de Redis (parar o container `redis` localmente) e confirmar que o volume
de log de erro cai para uma cadência razoável (ex.: no máximo 1 log a cada poucos segundos por
cliente), sem alterar o comportamento fail-open observado nos testes existentes de cada módulo.

## Contexto adicional

Nenhuma mudança de código foi feita para isso nesta PR — mantive o diff focado na causa raiz real
do CI red (resolução `localhost` → IPv6 no Alpine). Registrando aqui para não perder o achado.
