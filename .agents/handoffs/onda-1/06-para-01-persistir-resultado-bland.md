- De: Agente 06 (Integrações Externas)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Onda: 1
- Status: resolvido
- Prioridade: normal

## Problema

Adicionei nesta onda o receptor do callback de resultado da Bland AI
(`POST /api/webhooks/bland/:token`, `src/features/prospecting/routes/atlasgr.routes.ts`),
autenticado por token e validado por zod (`src/features/prospecting/validators/atlasgr.schema.ts`
→ `blandCallResultSchema`). Antes desta onda esse endpoint não existia — o resultado da ligação
disparada pela integração AtlasGR/Bland AI nunca era recebido nem persistido em lugar nenhum deste
repositório.

Hoje o handler apenas loga o resultado (`callId`, `status`) via `logger.info` — não existe, em
`prisma/schema.prisma`, nenhum modelo para persistir de forma durável o resultado de uma ligação
originada pela integração AtlasGR (não é o mesmo fluxo de `CallLog`/Twilio do Agente 05, que é
sobre chamadas do motor de voz próprio via Twilio). Também não existe, em nenhuma tabela, uma
chave de idempotência persistida para o webhook `/api/webhook/atlasgr/outbound` — implementei
idempotência via Redis (`SET NX EX`, `src/features/prospecting/lib/webhookIdempotency.ts`), que já
resolve o bloqueador de chamada duplicada (AGENTS.md bloqueador #11) mesmo entre múltiplas
instâncias Cloud Run, mas é best-effort/TTL (padrão 24h), não um registro de auditoria permanente.

Isso não é bloqueador desta onda (o Redis já elimina o risco real de disparo duplicado de ligação,
e loggar o resultado já dá alguma observabilidade), mas é um gap de dado que vale fechar: hoje, se
alguém perguntar "quantas ligações a AtlasGR disparou este mês e qual foi o resultado de cada
uma", a resposta não existe em lugar nenhum além dos logs.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` — precisaria de um novo modelo (ou extensão de um existente) para
  persistir resultado de ligação originada pela integração AtlasGR, e/ou uma tabela de auditoria de
  idempotência (`externalEventId`/chave, `processedAt`, `result`).
- `src/features/prospecting/routes/atlasgr.routes.ts` (meu arquivo, chamaria o repository depois
  que o schema existir).
- Possivelmente `src/repositories/**` — um novo repository para esse modelo, que eu mesmo posso
  escrever depois que o schema existir (`src/repositories/**` fora dos exclusivos de outro agente é
  editável pelo dono do domínio, mas o schema/migração em si é exclusivo do Agente 01 —
  AGENTS.md §11).

## Alteração necessária

Sugestão de modelo (ajustar nomes conforme convenção do schema atual):

```prisma
model AtlasGRCallResult {
  id         String   @id @default(cuid())
  tenantId   String
  leadId     String?
  callId     String   @unique
  status     String
  receivedAt DateTime @default(now())
  tenant     Tenant   @relation(fields: [tenantId], references: [id])
}
```

Como não há `tenantId`/`leadId` de origem no payload atual do webhook AtlasGR (contrato hoje é só
`{ phone_number, name, company }`, com `lead_id` opcional que adicionei nesta onda como campo
aditivo), a associação a um tenant específico provavelmente depende de decisão de produto (hoje a
integração não é multi-tenant — dispara sempre para a mesma conta Bland AI/AtlasGR). Levanto isso
para o Agente 01 avaliar junto com a decisão de schema, não decido isso sozinho.

## Teste esperado

Callback de resultado da Bland AI persiste um registro consultável por `callId`; reconsulta do
mesmo `callId` (redelivery do callback) não duplica registro (constraint `@unique` em `callId`).

## Contexto adicional

Ver também `.agents/handoffs/onda-1/06-para-00-csrf-bloqueia-webhooks-servidor-servidor.md` — a
rota do callback está sujeita ao mesmo problema de roteamento/CSRF descrito ali.

## Resolução

Modelo `AtlasGRCallResult` criado em `prisma/schema.prisma` (migração real aplicada:
`prisma/migrations/20260906153010_add_atlasgr_call_result/migration.sql`) e repository em
`src/repositories/atlasGRCallResultRepository.ts` (com testes em
`src/repositories/atlasGRCallResultRepository.test.ts`).

Decisão de modelagem sobre `tenantId` (a questão de produto que este handoff levantou): mantido
**opcional** (`String?`, relação `Tenant?` com `onDelete: SetNull`), não obrigatório e não
preenchido automaticamente com uma associação inventada. Motivo: embora
`VoiceProspectingService.triggerOutboundCall` (seu arquivo,
`src/features/prospecting/services/voice.service.ts`) já resolva um tenant real via
`ATLASGR_TENANT_ID` para checar o consentimento de IA no disparo da ligação, esse identificador (a)
nunca é enviado à Bland AI como metadata da chamada e (b) nunca volta no payload do callback de
resultado — o callback só carrega `call_id`/`status`/transcript/etc, nada tenant-scoped. Preencher
`tenantId` sempre com o valor atual de `ATLASGR_TENANT_ID` no momento do callback seria uma
associação não-verificável (o env var pode ter sido rotacionado entre o disparo e o retorno, e não
há como confirmar a partir do callback em si) — por isso optei por deixar o campo nulo por padrão e
documentei isso extensamente no comentário do model em `prisma/schema.prisma`. O campo existe e
está pronto para receber um valor real assim que houver um sinal de tenant verificável por chamada
(ex.: AtlasGR passar a mandar um identificador estável que a Bland AI ecoe de volta no callback).

Repository exposto (todos idempotentes/tenant-scoped conforme AGENTS.md §15):
- `upsertAtlasGRCallResult(input)` — upsert por `callId` (constraint `@unique`), então uma
  redelivery do mesmo `callId` (inclusive após o TTL da idempotência Redis expirar) atualiza a
  linha existente em vez de duplicar ou lançar erro de constraint. Aceita `tenantId` opcional — você
  decide, no handler, se quer passar `process.env.ATLASGR_TENANT_ID` como melhor esforço.
- `findAtlasGRCallResultByCallId(callId)`.
- `listAtlasGRCallResultsForTenant(tenantId, { page, pageSize })` — leitura paginada por tenant,
  para uma futura tela de "quantas ligações a AtlasGR disparou e qual foi o resultado de cada uma".

Não editei `src/features/prospecting/routes/atlasgr.routes.ts` (seu arquivo) — falta apenas você
chamar `upsertAtlasGRCallResult` no handler `POST /webhooks/bland/:token`, dentro do bloco que já
processa o resultado (depois de `beginBlandCallbackProcessing` retornar algo diferente de
`duplicate`/`in_progress`, e usando os mesmos campos que você já extrai em `forwardPayload`
— `call_id`, `status`, `completed`, `call_length`). Ver handoff
`.agents/handoffs/onda-4/01-para-06-persistir-resultado-bland-pronto.md`.

Validações rodadas nesta resolução (saída real, não simulada): `npm run typecheck` (0 erros),
`npm run lint` (0 erros, só warnings pré-existentes de `no-explicit-any` em arquivos de teste que já
existiam antes desta mudança), `npm run test` (53 arquivos de teste, 332 testes passando, 1 skip,
0 falhas), `npm run build` (build de produção completo, sem erro), `npx prisma generate` (client
gerado com sucesso).
