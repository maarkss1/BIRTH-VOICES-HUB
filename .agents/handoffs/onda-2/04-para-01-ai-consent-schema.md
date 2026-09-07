- De: Agente 04 (Voice Runtime e Gateway de IA)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Onda: 2
- Status: resolvido
- Prioridade: normal

## Problema
`AGENTS.md` (LGPD e dados pessoais) exige que "04 garante que dado pessoal enviado a provedores
de IA externos... só ocorre com consentimento explícito registrado". O schema Prisma não tem
nenhum campo/model dedicado a consentimento de IA por tenant.

Para não deixar o bloqueador sem correção nesta onda (ver `AGENTS.md` §19, "Proibição de
auditoria sem correção"), implementei um mecanismo de consentimento **real e funcional** hoje
usando o model genérico `Setting` já existente (tenant-scoped, chave/valor JSON), que já é usado
para brand color, onboarding checklist e config de voice runtime:

- `src/services/settingService.ts`: `getAiConsent(tenantId)`, `grantAiConsent(tenantId, actorUserId)`,
  `revokeAiConsent(tenantId, actorUserId)` — chave `ai_provider_consent`.
- `lib/voice-runtime/providers/LLMGateway.ts` (`LLMProviderGateway.processRequest`) e
  `lib/voice-runtime/SessionManager.ts` (`handleUserText`) agora verificam consentimento antes de
  enviar qualquer prompt a um provedor externo (OpenAI/Anthropic/Gemini/ElevenLabs) e falham
  fechado (bloqueiam o envio, nunca lançam exceção que derrube a chamada) quando não há registro.
- `src/controllers/ai.controller.ts` + `src/routes/ai.routes.ts`: `GET/POST /api/ai/consent` para
  ler/gravar o consentimento do tenant autenticado.

Isso funciona e é tenant-isolado (mesmo padrão de isolamento do resto do `Setting`), mas não é o
ideal a longo prazo: falta trilha de auditoria própria (quem, quando, versão dos termos aceitos,
IP), índice dedicado para consulta/relatório de compliance, e não é discoverable via
`prisma studio`/schema como um conceito de primeira classe.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` (seu domínio exclusivo)

## Alteração necessária
Quando houver janela para migração de schema, recomendo um model dedicado, por exemplo:

```prisma
model TenantAiConsent {
  id              String   @id @default(uuid())
  tenantId        String   @unique
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  granted         Boolean  @default(false)
  consentVersion  String?
  grantedAt       DateTime?
  revokedAt       DateTime?
  grantedByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([tenantId])
}
```

Ao migrar, `settingService.getAiConsent`/`grantAiConsent`/`revokeAiConsent` (meu domínio) podem
ser atualizados para ler/escrever no novo model em vez do `Setting` genérico, mantendo a mesma
assinatura pública — nenhum chamador (`LLMGateway.ts`, `SessionManager.ts`, `ai.controller.ts`)
precisaria mudar.

## Teste esperado
- Migration aplica limpo em base vazia e em base com tenants existentes (default `granted: false`
  é seguro — mantém o comportamento fail-closed já implementado).
- `settingService` (ou o novo repository equivalente) preserva o comportamento: tenant sem
  registro = `granted: false`; `grantAiConsent`/`revokeAiConsent` idempotentes.

## Contexto adicional
Nota de compatibilidade: chamadas que ainda usam o tenant sentinela `SYSTEM_TENANT_ID = 'system'`
(ex.: `telephonyService.ts` antes do handoff `04-para-05-llmgateway-tenantid-propagation.md` ser
resolvido) **pulam** a checagem de consentimento propositalmente — não há tenant real para
consentir. Isso preserva o comportamento atual de produção sem regressão até que o Agente 05
propague `tenantId` real; a partir daí, o gate de consentimento passa a valer para essas chamadas
também. Ver esse handoff (que reabri/atualizei com prioridade elevada por causa desta dependência).

## Resolução

Adicionado o model dedicado exatamente como recomendado, com migração real aplicada
(prisma/migrations/20260906150753_add_tenant_ai_consent/migration.sql, gerada via
`prisma migrate dev` contra um Postgres local, aplicada com sucesso sobre um banco com tenants já
existentes — nenhum dado perdido, `granted: false` é o default seguro para linhas ausentes):

```prisma
model TenantAiConsent {
  id              String    @id @default(uuid())
  tenantId        String    @unique
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  granted         Boolean   @default(false)
  consentVersion  String?
  grantedAt       DateTime?
  revokedAt       DateTime?
  grantedByUserId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId])
}
```

`Tenant.aiConsent TenantAiConsent?` foi adicionado como o lado inverso da relação 1:1
(`tenantId` é `@unique`).

**Não alterei `src/services/settingService.ts`** — por acordo do próprio pedido original ("Ao
migrar, settingService... podem ser atualizados", domínio do Agente 04), a migração do
`getAiConsent`/`grantAiConsent`/`revokeAiConsent` do `Setting` genérico para este novo model fica
para o Agente 04, preservando a mesma assinatura pública (nenhuma mudança necessária em
`LLMGateway.ts`, `SessionManager.ts` ou `ai.controller.ts`).

Ver `.agents/handoffs/onda-4/01-para-04-tenant-ai-consent-model-pronto.md` para os detalhes de
consumo.
