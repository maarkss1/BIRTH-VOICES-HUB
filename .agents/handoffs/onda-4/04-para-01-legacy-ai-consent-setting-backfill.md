- De: Agente 04 (Voice Runtime e Gateway de IA)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Onda: 4
- Status: aberto
- Prioridade: normal (não bloqueador)

## Problema
Resolvendo `.agents/handoffs/onda-4/01-para-04-tenant-ai-consent-model-pronto.md`: migrei
`src/services/settingService.ts` (`getAiConsent`/`grantAiConsent`/`revokeAiConsent`) para ler e
escrever em `prisma.tenantAiConsent` em vez do `Setting` genérico (chave `ai_provider_consent`).

Qualquer tenant que tenha concedido ou revogado consentimento de IA **antes** desta mudança, via
o mecanismo antigo (`Setting` com chave `ai_provider_consent`), não é migrado automaticamente —
`TenantAiConsent` não tem registro para esses tenants, então `getAiConsent` agora retorna o
default seguro `granted: false` (fail-closed) para eles, mesmo que tivessem concedido consentimento
anteriormente sob o mecanismo antigo.

Não escrevi um script de backfill de dado por conta própria: qual tenant consentiu o quê é dado de
negócio/compliance (LGPD), e a linha de dados (`Setting`/`TenantAiConsent`) é seu domínio
(`prisma/schema.prisma`, dono exclusivo). Prefiro documentar isso como handoff a decidir
unilateralmente se/como migrar esse dado.

## Arquivo(s) envolvido(s)
- `src/services/settingService.ts` (meu, já alterado — não precisa de ação sua aqui).
- Dado legado na tabela `Setting` (linhas com `key = 'ai_provider_consent'`, tenant-scoped,
  `userId = null`) — schema/dado, seu domínio.

## Alteração necessária (se for relevante para o seu ambiente)
Se houver tenants em produção/homologação que já usaram o fluxo antigo (`POST /api/ai/consent`
antes desta mudança) e for importante preservar o consentimento já concedido, um script de
backfill (rodado uma única vez) precisaria:

1. Ler todas as linhas de `Setting` com `key = 'ai_provider_consent'`.
2. Para cada uma, fazer upsert em `TenantAiConsent` com os mesmos `granted`/`grantedAt`/
   `revokedAt`/`grantedByUserId` já armazenados no JSON da linha antiga.
3. Opcionalmente, apagar (ou manter, como histórico) a linha antiga de `Setting` depois de
   confirmar a migração.

Não é urgente: o novo mecanismo é fail-closed (comportamento seguro por padrão para LGPD) — o
único efeito de não migrar é que tenants que já haviam consentido precisariam consentir de novo,
não um vazamento de dado.

## Teste esperado
- Se um script de backfill for escrito: idempotente (rodar duas vezes não duplica/perde dado),
  preserva `grantedAt`/`revokedAt`/`grantedByUserId` originais, não sobrescreve um registro
  `TenantAiConsent` já criado pelo novo fluxo com dado mais antigo do `Setting`.

## Contexto adicional
Nenhum chamador (`LLMGateway.ts`, `SessionManager.ts`, `ai.controller.ts`) precisou mudar — a
assinatura pública de `getAiConsent`/`grantAiConsent`/`revokeAiConsent` ficou igual, só a
implementação interna trocou de `Setting` genérico para `prisma.tenantAiConsent`.
