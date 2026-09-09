- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Agente 04 (Voice Runtime e Gateway de IA)
- Onda: 4
- Status: resolvido
- Prioridade: normal

## Problema
Resolvendo `.agents/handoffs/onda-2/04-para-01-ai-consent-schema.md`: o model dedicado
`TenantAiConsent` que você recomendou agora existe em `prisma/schema.prisma`, com migração real
aplicada (`prisma/migrations/20260906150753_add_tenant_ai_consent/`). O mecanismo atual em
`src/services/settingService.ts` (seu arquivo — não alterei) continua funcionando exatamente como
está, sobre o `Setting` genérico — nada quebrou, nada é urgente aqui.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` (meu, já publicado — model `TenantAiConsent` + `Tenant.aiConsent`).
- `src/services/settingService.ts` (seu) — `getAiConsent`, `grantAiConsent`, `revokeAiConsent`.

## Alteração necessária (quando você tiver janela)
Trocar a implementação interna dessas três funções para ler/escrever em
`prisma.tenantAiConsent` em vez da chave `ai_provider_consent` do `Setting` genérico, mantendo a
mesma assinatura pública (`AiConsentRecord`) — nenhum chamador (`LLMGateway.ts`,
`SessionManager.ts`, `ai.controller.ts`) precisa mudar:

```ts
// getAiConsent
const row = await prisma.tenantAiConsent.findUnique({ where: { tenantId } });
return row
  ? { granted: row.granted, grantedAt: row.grantedAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null, grantedByUserId: row.grantedByUserId }
  : NO_CONSENT_RECORD;

// grantAiConsent
await prisma.tenantAiConsent.upsert({
  where: { tenantId },
  create: { tenantId, granted: true, grantedAt: new Date(), grantedByUserId: actorUserId },
  update: { granted: true, grantedAt: new Date(), revokedAt: null, grantedByUserId: actorUserId },
});

// revokeAiConsent — mesmo padrão de upsert, granted: false, revokedAt: new Date()
```

Considere também popular `consentVersion` (coluna já existe, hoje sempre `null`) quando houver uma
versão de termos a registrar — não obrigatório para este handoff, só aproveitando que a coluna já
está lá.

Migração de dados: tenants que já tenham um `Setting` com a chave `ai_provider_consent` hoje
perderiam esse consentimento se você apenas trocar o código sem migrar os dados existentes — se
isso importar para o seu ambiente de homologação, um script de backfill (`Setting` ->
`TenantAiConsent`) é responsabilidade sua junto com essa migração de código, já que o dado em si
(que tenant consentiu o quê) é seu domínio de negócio.

## Teste esperado
- Tenant sem registro: `granted: false` (mesmo comportamento fail-closed de hoje).
- `grantAiConsent`/`revokeAiConsent` idempotentes.
- `LLMGateway.ts`/`SessionManager.ts` continuam bloqueando envio a provedor externo sem
  consentimento, sem nenhuma mudança de código do lado deles.

## Contexto adicional
Não bloqueador — o mecanismo via `Setting` genérico já é real e funcional (não é stub), então
isso pode esperar a próxima janela do Agente 04. `prisma generate` já foi rodado nesta onda; o
client TypeScript (`prisma.tenantAiConsent`) já está disponível.

## Resolução

`src/services/settingService.ts` migrado exatamente como sugerido: `getAiConsent` agora faz
`prisma.tenantAiConsent.findUnique({ where: { tenantId } })` (sem registro = `NO_CONSENT_RECORD`,
`granted: false`, fail-closed preservado); `grantAiConsent`/`revokeAiConsent` fazem
`prisma.tenantAiConsent.upsert(...)`, preenchendo `grantedAt`/`grantedByUserId` ao conceder e
`revokedAt`/`grantedByUserId` ao revogar. Assinatura pública de `AiConsentRecord` e das três
funções não mudou — `LLMGateway.ts`, `SessionManager.ts` e `ai.controller.ts` não foram tocados
(confirmado: nenhum deles importa `settingRepository` diretamente, só as funções de
`settingService`).

`consentVersion` não foi populado (mantido `null` como hoje) — não havia versão de termos a
registrar nesta janela; a coluna já existe e fica disponível para quando isso for necessário.

Dado legado do mecanismo antigo (`Setting` com chave `ai_provider_consent`) **não foi migrado**
automaticamente — abri
`.agents/handoffs/onda-4/04-para-01-legacy-ai-consent-setting-backfill.md` para você decidir se/
como fazer o backfill, já que qual tenant consentiu o quê é dado de negócio/compliance, e não
tomei essa decisão sozinho.

Validação: `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` executados sem
regressão (ver commit para a saída completa) — em particular `__tests__/aiConsent.middleware.test.ts`,
`__tests__/voiceProspectingConsent.test.ts`, `__tests__/llmGatewayFailover.test.ts` e
`__tests__/sessionManagerTenantWebhook.test.ts` seguem verdes, pois todos mockam `settingService`
(ou `settingRepository`, para funções não relacionadas a consentimento de IA) na fronteira do
módulo — nenhum deles testava a implementação interna de `getAiConsent`/`grantAiConsent`/
`revokeAiConsent`, então a troca de armazenamento não exigiu alteração de teste.
