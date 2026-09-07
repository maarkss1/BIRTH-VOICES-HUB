- De: Agente 04 (Voice Runtime e Gateway de IA)
- Para: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Onda: 4
- Status: resolvido
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

## Resolução

**Decisão: não escrever o script de backfill agora.** Investiguei o estado real do produto (não
assumi) antes de decidir — evidência levantada, com fontes:

1. **Nenhum release já foi aprovado.** `ROADMAP.md` (`Fase 0: Fechar o release atual`) lista como
   pendente (`[ ]`, não `[x]`) o gate "Onda 3 (`03`+`08`) rodar o gate completo... e produzir
   `docs/release/PRODUCTION-READINESS.md` com decisão `RELEASE APPROVED` ou `BLOCKED`" — esse
   arquivo **não existe** no repositório (`docs/release/` nem existe como diretório). Ou seja, não
   há nenhum registro formal de que este produto já foi considerado pronto/aprovado para produção
   com clientes reais, em nenhuma onda até agora.
2. **`.agents/runs/` só tem `onda-1.md` e `onda-2.md`** — nenhum `onda-3.md`/`onda-4.md` de
   aprovação existe ainda; a própria Onda 4 (em que este handoff foi aberto) está em execução, não
   concluída/aprovada.
3. **`package.json` está em `"version": "0.0.0"`**, sem `CHANGELOG.md`, sem tags git de release
   (`git tag` vazio) — nenhum artefato versionado foi cortado para deploy até aqui.
4. **A janela de vida do mecanismo antigo é curta e cai inteiramente dentro do ciclo de
   desenvolvimento ativo, não de uma operação em produção com clientes.** `git log` mostra que o
   mecanismo via `Setting`/`ai_provider_consent` nasceu no commit `7945bed`
   (`feat(04): gate every external-AI-provider call on registered tenant consent (LGPD)`,
   2026-08-11) e foi substituído pelo model dedicado no commit `3a050a6`
   (`feat(04): migrar consentimento de IA para model dedicado TenantAiConsent`, 2026-09-06) — 26
   dias, todos dentro das Ondas 1-4 do roster de agentes (que ainda não fecharam release), sem
   nenhum indício em `docs/AUDIT.md`, `docs/RUNBOOK.md`, `ROADMAP.md` ou `.agents/runs/**` de
   onboarding de tenant real/cliente pagante nesse intervalo. `ROADMAP.md` cita apenas a
   integração AtlasGR como "a única integração de produção real" — nada equivalente é dito sobre
   tenants/clientes usando o produto fim-a-fim.
5. Não tenho credenciais/acesso a um banco de produção real (Cloud SQL) nesta sessão para
   consultar `Setting` diretamente — a investigação acima é a evidência disponível no repositório,
   e ela aponta consistentemente para "pré-release", não para "produção com tenants reais que já
   consentiram".

**Por que isso torna o backfill não compensador agora:** o formato salvo pelo mecanismo antigo é
conhecido e estável (`{ granted, grantedAt, revokedAt, grantedByUserId }`, JSON em
`Setting.value`, `key = 'ai_provider_consent'`, `userId = null`) — escrever o script em si não
seria tecnicamente difícil. O problema é risco/benefício: é um script de mutação de dado
(domínio exclusivo deste agente) mantido no repositório sem nenhum dado real conhecido para
migrar hoje, i.e. custo de manutenção/revisão para benefício zero neste momento. Do lado do
usuário, o pior efeito de não migrar é um tenant precisar consentir de novo (comportamento
fail-closed, que é o lado seguro para LGPD) — não há vazamento de dado nem perda irreversível de
compliance.

**Ação de acompanhamento (não criada como script, registrada aqui para não perder o contexto):**
antes de qualquer aprovação formal de release (`docs/release/PRODUCTION-READINESS.md` =
`RELEASE APPROVED`) ou de confirmação de que algum ambiente de homologação teve uso real do fluxo
antigo entre 2026-08-11 e 2026-09-06, reabrir esta investigação e, se houver de fato linhas de
`Setting` com `key = 'ai_provider_consent'` em algum banco real, escrever
`prisma/scripts/backfillTenantAiConsent.ts` seguindo exatamente o desenho já descrito acima por
04 (upsert idempotente em `TenantAiConsent`, nunca sobrescrever um registro já criado pelo fluxo
novo, preservar `grantedAt`/`revokedAt`/`grantedByUserId` originais).

**Validação:** como nenhum código de produto foi alterado por esta resolução (mudança é somente
neste arquivo de handoff), rodei o gate de qualidade do repositório para confirmar que a árvore
segue verde sem nenhuma regressão introduzida por esta investigação — ver commit desta mudança
para a saída completa de `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build`.
