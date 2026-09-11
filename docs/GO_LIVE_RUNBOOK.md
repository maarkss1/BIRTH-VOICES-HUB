# Go-Live Runbook — Birth Voices Hub

Este documento é o gate operacional para o primeiro release real. **Merge em `main` não significa deploy.** Produção só deve ser promovida pelo workflow manual `Deploy to Google Cloud Run` depois de todos os gates abaixo.

## Snapshot de segurança — 15/08/2026

Na auditoria pré-go-live foram observados dois controles administrativos ainda não aplicados pelo GitHub:

- a branch `main` está sem Branch Protection/Ruleset;
- o environment `production` existe, porém está sem `protection_rules` e sem `deployment_branch_policy`.

A integração GitHub usada pelo agente consegue ler esses estados, mas **não possui permissão/API de escrita para Branch Protection, Environment Rules, Secrets ou Variables**. Esses itens permanecem como bloqueadores administrativos até serem configurados na interface do GitHub.

## Gate A — proteção do repositório

Configurar em **Settings → Rules → Rulesets** ou **Settings → Branches** para `main`:

- exigir Pull Request antes de merge;
- exigir os checks `Validate, Test & Build` e `Docker Build Artifact`;
- exigir branch atualizada antes do merge;
- exigir resolução de conversations;
- bloquear force push;
- bloquear deleção da `main`;
- aplicar a regra também a administradores, se o modelo operacional permitir;
- preferir squash merge para manter histórico de release legível.

Se houver um segundo revisor habilitado, exigir pelo menos uma aprovação. Em repositório de um único mantenedor, não configure um requisito impossível de autoaprovação; o CI obrigatório continua sendo o gate mínimo.

## Gate B — proteção do environment `production`

Configurar em **Settings → Environments → production**:

- Deployment branches/tags: somente `main`;
- desabilitar bypass administrativo quando o time conseguir operar sem exceções;
- adicionar Required Reviewer quando existir um segundo aprovador independente;
- manter todos os secrets e variables de produção somente nesse environment.

O workflow de deploy já exige confirmação manual `DEPLOY` e um motivo de mudança, mas Environment Protection continua sendo uma segunda fechadura importante.

## Gate C — rotação de segredo exposto anteriormente

Antes do primeiro go-live:

1. identificar no sistema de origem o segredo de integração que apareceu no histórico Git;
2. gerar um valor novo e criptograficamente aleatório;
3. invalidar/revogar o valor antigo no sistema de origem;
4. cadastrar o novo valor apenas no environment GitHub `production`;
5. nunca registrar o valor novo em issue, PR, log, screenshot, fixture, script ou `.env.example`.

Remover um segredo do `HEAD` não o revoga. Reescrever histórico é opcional e separado; **rotação é obrigatória**.

## Gate D — produção configurada

Seguir `docs/secrets-guide.md`. O contrato é validado automaticamente por:

```bash
node scripts/validate-production-config.mjs
```

O validador não imprime valores de secrets. Ele falha por ausência/formato inseguro, JWT e refresh iguais, URLs públicas inválidas, CORS com localhost, Twilio fora de E.164 e configuração AtlasGR/Bland parcial.

Se `BLAND_RECORD_CALLS=true`, também é obrigatório `BLAND_RECORDING_APPROVED=true`. Esse segundo switch representa aprovação explícita de privacidade/jurídico para gravação.

## Gate E — Production Preflight, sem deploy

Executar manualmente o workflow:

**Actions → Production Preflight (No Deploy) → Run workflow**

Informar o SHA exato da `main` que será promovido.

O preflight valida, sem publicar imagem e sem aplicar migrations:

- SHA presente em `main`;
- CI verde no SHA exato;
- contrato de configuração;
- conexão read-only com PostgreSQL;
- `PING` no Redis;
- credenciais Twilio via leitura da conta;
- acesso à API Gemini sem geração de conteúdo;
- autenticação e acesso ao projeto Google Cloud;
- opcionalmente `/api/health` da URL pública já existente.

**Resultado obrigatório: SUCCESS.**

## Gate F — homologação funcional de voz

Executar integralmente `docs/UAT_VOICE_MATRIX.md` em tenant dedicado de homologação. Não usar leads/clientes reais na primeira rodada.

Critério de aprovação:

- 100% dos cenários críticos aprovados;
- nenhum P0/P1 aberto;
- nenhuma quebra de isolamento de tenant;
- nenhuma chamada externa de IA sem consentimento;
- nenhuma gravação habilitada sem aprovação explícita;
- idempotência confirmada para replays/callbacks;
- transcript, término e webhook final coerentes com a chamada.

## Gate G — deploy controlado

Somente depois dos gates A–F:

**Actions → Deploy to Google Cloud Run → Run workflow**

Preencher:

- `target_sha`: SHA aprovado;
- `confirm_production`: exatamente `DEPLOY`;
- `reason`: motivo auditável do release.

O workflow:

1. confirma intenção explícita;
2. comprova que o SHA pertence à `main`;
3. comprova CI verde no SHA exato;
4. revalida configuração de produção;
5. cria e publica imagem Docker imutável por SHA;
6. executa `prisma migrate deploy`;
7. promove a mesma imagem testada ao Cloud Run;
8. exige health-check HTTP bem-sucedido após o deploy.

## Gate H — smoke público pós-deploy

Com um usuário UAT dedicado já criado:

```bash
PUBLIC_BASE_URL=https://seu-dominio.example \
UAT_EMAIL=usuario-uat@example.com \
UAT_PASSWORD='senha-do-uat' \
node scripts/uat-public-smoke.mjs
```

O smoke não cria nem altera workflow. Ele valida health, login, cookie/session, tenant autenticado, leitura do workflow e logout.

Nunca passe credenciais UAT em linha de comando compartilhada ou logs de CI. Em CI, use secrets.

## Rollback

Manter registrado o último SHA conhecido como bom. Em incidente:

1. interromper novas campanhas/chamadas se houver risco de dados ou custo;
2. identificar o último SHA de produção saudável;
3. confirmar que esse SHA possui CI verde e contém o guardrail atual de deploy;
4. executar novamente o workflow manual de deploy apontando para o SHA anterior;
5. validar `/api/health`, login UAT, uma chamada controlada e webhooks;
6. abrir incidente com causa, impacto, janela e correção permanente.

Migrations destrutivas exigem plano específico de rollback de dados; nunca assuma que voltar a imagem automaticamente desfaz schema.

## GO / NO-GO

**GO** somente quando todos os Gates A–F estiverem comprovados e o release tiver um SHA imutável com CI verde.

**NO-GO** se houver qualquer um destes itens:

- `main` livre para force push/deleção;
- environment `production` sem política de branch;
- segredo exposto ainda válido;
- preflight vermelho;
- P0/P1 de UAT;
- URLs HTTP/localhost em produção;
- gravação sem aprovação;
- tenant/consentimento/idempotência não comprovados.
