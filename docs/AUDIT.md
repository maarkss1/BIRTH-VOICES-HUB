# Auditoria Técnica — Documento Vivo

**Última atualização:** 2026-09-05

**Regra deste documento:** ele é único e vivo. Novos ciclos de auditoria **editam este arquivo** (atualizando as seções relevantes e o changelog no fim) em vez de criar `AUDIT_REPORT_*.md` novos. Isso evita a divergência que motivou a consolidação original de 2026-08-02 (ver histórico no changelog): relatórios paralelos afirmando coisas que o código atual não confirma. Antes de marcar qualquer item como resolvido, rode o comando de verificação e cole a saída — não a alegação do ciclo anterior.

---

## 1. Estado verificado agora (2026-09-05)

Verificado diretamente no working tree nesta data, com dependências instaladas e as ferramentas reais executadas (não é leitura de relatório de terceiros): `npm run typecheck`, `npm run lint`, `npx vitest run --coverage`, `npm run build`, `npm audit`.

| Item | Estado | Evidência |
|---|---|---|
| `npm run typecheck` | ✅ Limpo, 0 erros | executado nesta data |
| `npm run lint` | ✅ 0 erros, **79 warnings** `@typescript-eslint/no-explicit-any` (todos em `__tests__/*.test.ts` — mocks do Prisma —, `TestSimulatorModal.tsx` e `vitest.setup.ts`) | executado nesta data — número difere do "49" citado em auditorias anteriores; não reconciliar com números antigos, este é o valor atual |
| Conflito de merge em `ci.yml`/`deploy.yml` (era 🔴 crítico em 2026-08-02) | ✅ Resolvido — nenhum marcador `<<<<<<<`/`=======`/`>>>>>>>` presente | `grep` nos dois arquivos |
| Thresholds de cobertura em `vite.config.ts` | ✅ Commitados (`lines: 52, statements: 50, functions: 50, branches: 42`) | `vite.config.ts:52-57` |
| Suíte de testes (Vitest) | ✅ 288 passed, 1 skipped, 48 arquivos de teste | `npx vitest run` |
| Cobertura reportada (sobre os arquivos que os testes tocam) | 58.94% statements / 50.95% branches / 57.59% functions / 61.42% lines | `npx vitest run --coverage` |
| **Cobertura real do frontend** | 🔴 Ver achado crítico abaixo — a métrica acima **não inclui** `pages/` nem `store/useStudioStore.ts` | ver §1.1 |
| `console.log`/`console.debug` residual no frontend | ✅ Zero ocorrências em `pages/`, `components/`, `hooks/`, `store/`, `App.tsx` | `grep -rn "console\."` |
| `react-router-dom` CSRF bypass (RSC mode) — era 🟠 alto em 2026-08-02 | ✅ Não aparece mais em `npm audit` na versão atual (`^7.18.3`) | `npm audit` rodado nesta data |
| `npm audit` (árvore completa) | 10 vulnerabilidades (5 moderate, 5 high) — ver §2 para detalhamento por pacote e se afeta produção | `npm audit` rodado nesta data |
| Gateway de IA (`LLMGateway.ts`) | Existe e tem teste dedicado de failover (`llmGatewayFailover.test.ts`) — item "IA acoplada direto ao Gemini" do audit anterior está **parcialmente resolvido** | `lib/voice-runtime/providers/LLMGateway.ts`; mas ver §2, `ai.controller.ts` ainda chama `getGeminiClient()` diretamente na maioria dos handlers |
| Bundle de produção (`npm run build`) | `VoiceStudio` = 930.89 kB (pior que o "~1 MB" já sinalizado), `Observability` = 353.35 kB, chunk principal `index` = 442.36 kB — 4 chunks acima do limite de 500 kB avisado pelo Vite | `npm run build` rodado nesta data |
| Dependabot / CodeQL / scanner de dependências em CI | ❌ Não configurado — `.github/workflows/` só tem `ci.yml` e `deploy.yml`; nenhum roda `npm audit` ou equivalente | `find .github -type f` |
| Prisma / `@prisma/client` | `5.22.0` — major atual é `7.x` (Prisma 6 e 7 já lançados); duas majors de atraso | `npm outdated` |

### 1.1 🔴 Achado novo desta auditoria — a cobertura reportada exclui o frontend praticamente inteiro

`vite.config.ts` configura `coverage` sem `all: true`. Isso faz o V8/Vitest só contabilizar, no denominador, os arquivos que pelo menos um teste efetivamente importa em runtime — arquivos nunca tocados por nenhum teste **não entram no relatório**, em vez de aparecerem como 0%.

Verificado nesta data:
- `coverage-summary.json` lista **97 arquivos**. O repositório tem **172 arquivos-fonte** `.ts`/`.tsx` fora de `__tests__/`, `e2e/` e arquivos `*.test.*` — ou seja, ~44% do código-fonte não participa da métrica, nem para o bem nem para o mal.
- **Nenhum arquivo de `pages/` aparece na cobertura** (23 arquivos, incluindo `pages/Landing.tsx` com 1604 linhas e `pages/Dashboard/Overview.tsx` com 972 linhas). Não há nenhum teste de componente ou de unidade para nenhuma página do dashboard.
- `store/useStudioStore.ts` (1302 linhas, o maior state store da aplicação — estado do Workflow Studio) também não aparece: nenhum teste o importa.
- `hooks/useVoiceConversation.ts` e `hooks/useDeveloperSettings.ts` também não aparecem.

Consequência prática: os thresholds de `52/50/50/42%` em `vite.config.ts` **passam mesmo que a maior parte da experiência do usuário final (todo o dashboard, o Voice/Workflow Studio, a landing page) tenha cobertura zero**, porque esses arquivos nunca entram no cálculo. O número "58.94%" não deve ser lido como "58% do produto está testado" — é "58% dos ~56% do código que algum teste toca". Antes de subir os thresholds ou comemorar a cobertura atual, ligar `coverage.all: true` para ver o número real (vai cair — provavelmente para a faixa de 25-35% do total).

---

## 2. Riscos e débitos em aberto (reverificados nesta data)

| Item | Severidade | Status |
|---|---|---|
| Cobertura reportada exclui `pages/`, `useStudioStore.ts` e hooks (sem `coverage.all: true`) | 🔴 Alto | Novo — ver §1.1 |
| 6 controllers com **0% de cobertura de statements**: `ai.controller.ts` (328 linhas), `knowledge.controller.ts`, `observability.controller.ts`, `organization.controller.ts`, `voiceOutbound.controller.ts`, `workflowCollab.controller.ts` | 🔴 Alto | Reverificado — `ai.controller.ts` em particular expõe todas as chamadas a Gemini sem nenhum teste automatizado |
| `ai.controller.ts` mistura o `LLMGateway` (com failover, testado) e chamadas diretas via `getGeminiClient()` na maioria dos handlers — acoplamento a um único provedor sem fallback nesses caminhos | 🟡 Médio | Parcialmente resolvido desde o audit anterior (o gateway existe), mas não foi adotado em todo o controller |
| E2E (Playwright) cobre apenas `e2e/health.spec.ts` e `e2e/auth.spec.ts` | 🟡 Médio | Nenhum fluxo do dashboard, telefonia ou Workflow Studio tem teste E2E |
| `npm audit`: `qs@6.15.3` (moderate, DoS/array-limit bypass) — chega via `express@5.2.1`, `elevenlabs`, `twilio`; está na árvore de **produção** | 🟡 Médio | Sem fix não-breaking disponível a montante (depende de upgrade dos pacotes que o vendorizam) |
| `npm audit`: `adm-zip`/`onnxruntime-node` (high) via `@livekit/agents-plugin-silero` em `packages/sip-agent` | 🟢 Baixo (risco real) | `packages/sip-agent` é PoC isolada (já excluída do typecheck) e **não é copiada no `Dockerfile`/`render.yaml`** — não vai para produção, mas ainda é instalada em todo `npm install` da raiz e aparece em toda auditoria |
| `npm audit`: `nanoid`, `fast-uri`, `uuid`/`dockerode` (high/moderate) via `testcontainers` | 🟢 Baixo (risco real) | `devDependency`, usado só em `__tests__/infrastructure.integration.test.ts`; não roda em produção |
| Nenhum Dependabot/Renovate nem CodeQL configurado; `npm audit` não roda em CI | 🟡 Médio | As vulnerabilidades acima só foram achadas porque esta auditoria rodou `npm audit` manualmente — nada os pegaria automaticamente hoje |
| `prisma`/`@prisma/client` 2 majors atrás (5.22 → 7.x) | 🟡 Médio | Upgrade grande, precisa de PR isolado com suíte completa rodando antes/depois (engine, migrations) |
| Bundle `VoiceStudio` (930.89 kB) e `index` principal (442.36 kB) acima de 500 kB | 🟡 Médio | Sem `React.lazy`/code-splitting adicional nesses pontos; piorou desde a última medição |
| `SECURITY.md` não tem processo de disclosure (sem contato, sem tabela de versões suportadas) — só descreve controles já implementados | 🟢 Baixo | Ajuste de documentação, não de código |
| RAG simulado em memória (sem `pgvector`/Qdrant) | 🟡 Médio | Não reverificado a fundo nesta rodada (herdado do audit anterior) — confirmar antes de agir |
| Ausência de Row-Level Security (RLS) nativa no Postgres — isolamento depende de `tenantId` em cada `where` de repositório | 🟡 Médio | Herdado do audit anterior, arquitetura não mudou (`prisma/schema.prisma` ainda sem RLS) |
| Observabilidade: sem Correlation ID central, sem dashboards versionados além de `infrastructure/observability/*.yml` | 🟢 Baixo | Herdado do audit anterior |
| ~79 warnings de `no-explicit-any` (ver §1) | 🟢 Baixo | Aceito deliberadamente como warning (não erro) pelo próprio `eslint.config.js`, concentrado em mocks de teste — não é dívida nova, é o número atual |
| SAST (Semgrep), DAST, SBOM (CycloneDX) | 🟢 Baixo | Não implementado |
| MFA / rotação automática de secrets / Vault | 🟢 Baixo | Não implementado |

### Itens do audit de 2026-08-02 confirmados como resolvidos nesta rodada
- Marcadores de merge conflict em `ci.yml`/`deploy.yml` — resolvidos.
- `react-router-dom` CSRF bypass (RSC mode) — não aparece mais em `npm audit` na versão atual.
- Thresholds de cobertura em `vite.config.ts` — commitados (mas ver a ressalva do §1.1: os thresholds passam sem medir o frontend).
- `console.*` residual no frontend — zerado.

---

## 3. Backlog de evolução

### 3.1 Refatoração incremental (conforme os arquivos forem tocados)
Continuam os mesmos três candidatos identificados no audit anterior, sem mudança de tamanho relevante desde então:
- `pages/Landing.tsx` (1604 linhas)
- `store/useStudioStore.ts` (1302 linhas — e sem nenhum teste, ver §1.1)
- `pages/Dashboard/Overview.tsx` (972 linhas)

Sem quebra dedicada — dividir em módulos menores apenas quando uma mudança funcional já for tocar o arquivo, para não gerar diffs de puro refactor sem necessidade.

### 3.2 Cobertura de testes — prioridades objetivas (novo, baseado na medição desta data)
1. Ligar `coverage.all: true` em `vite.config.ts` primeiro, para que qualquer decisão futura sobre thresholds parta do número real, não do inflado por omissão de arquivos.
2. Testes de controller para os 6 arquivos em 0% (§2), priorizando `ai.controller.ts` (maior superfície e o único que fala com provedores externos de IA sem o gateway em todos os caminhos).
3. Pelo menos um teste de fluxo para `store/useStudioStore.ts` antes da próxima refatoração relevante nele — hoje qualquer regressão ali passa em silêncio.
4. Expandir `e2e/` além de `health` e `auth` para cobrir pelo menos um fluxo crítico do dashboard (ex.: criar/editar um workflow) antes de reduzir esse item de prioridade.

### 3.3 Upgrades major de dependências (com testes de regressão dedicados)
| Pacote | Atual | Alvo | Observação |
|---|---|---|---|
| `prisma` / `@prisma/client` | 5.22 | 7.x | Duas majors de salto — checar breaking changes de v6 e v7 (migrations, engine) antes de subir direto para 7 |
| `openai` | 6.49 | 7.x | Checar mudanças de API do SDK |
| `ioredis` | 5.11 | 6.x | Usado por rate limiter/BullMQ — testar filas e rate limit após upgrade |
| `bullmq` | 5.81 | 6.x | Acoplado ao upgrade do `ioredis` acima — fazer juntos |
| `lucide-react` | 0.563 | 1.x | Mudança de esquema de versionamento (0.x → 1.x) da própria lib, checar renomeação de ícones |

Cada upgrade deve ir em PR isolado com a suíte de testes real (288 testes nesta data) rodando verde antes e depois.

### 3.4 Segurança de cadeia de suprimentos (novo)
- Configurar Dependabot (ou Renovate) para PRs automáticos de patch/minor em dependências, e para sinalizar advisories novos — hoje isso depende de alguém rodar `npm audit` manualmente.
- Adicionar um step de `npm audit --omit=dev --audit-level=high` (ou equivalente) ao `ci.yml`, falhando o build em vulnerabilidades altas na árvore de produção — o `qs` via `express`/`twilio`/`elevenlabs` (§2) seria o primeiro caso real a triar.
- Avaliar se `packages/sip-agent` (PoC com LiveKit, não deployada) vale a pena manter como workspace da raiz ou mover para um repositório/instalação separada, já que ela é a origem do único achado *high* de produção indireta (`adm-zip`) e já é excluída do typecheck por ser isolada.

### 3.5 Itens do roadmap técnico enterprise (mantidos como contexto histórico, não revalidados nesta rodada)
RAG em memória, ausência de RLS nativa, observabilidade avançada (Correlation ID, dashboards), SAST/DAST/SBOM, MFA/Vault — ver tabela do §2. Scorecard percentual de auditorias anteriores (Arquitetura 82%, Segurança 61%, IA 34%, etc.) segue não revalidado e não deve ser citado como número atual.

---

## 4. Histórico dos relatórios substituídos

Estes quatro relatórios foram lidos integralmente e consolidados na auditoria de 2026-08-02; os originais foram removidos do repositório para eliminar a fonte de divergência. Resumo do que cada um cobria, para referência:

- **`AUDIT_REPORT_2026-07-16.md`** (2026-07-16) — Ciclo de integração dos agentes Jules (voice runtime, versionamento de Workflow, Agent/Knowledge management, docs enterprise). Corrigiu `npm ci` quebrado (lockfile) e o bug de `null` em `settingRepository.upsertSetting`. Identificou a race condition do `workflowCollabService` (corrigida) e o `.env` versionado (corrigido).
- **`AUDIT_REPORT_ENTERPRISE_EVOLUTION.md`** (sem data explícita) — Auditoria arquitetural ampla visando SaaS Enterprise multi-tenant: banco/ORM, performance, segurança, observabilidade, IA, multi-tenancy, DevOps, manutenibilidade. Scorecard de maturidade por categoria e roadmap executivo por horizonte de tempo — origem da tabela do §3.5.
- **`ENTERPRISE_READINESS_REPORT.md`** (2026-07-16, branch `worktree-production-ready-stabilization`) — Sessão de estabilização para produção: corrigiu crashes reais só visíveis rodando Docker de verdade (import estático de `vite` em produção, wildcard do Express 5, engine binary do Prisma no Alpine, Vitest capturando specs do Playwright), hardening OWASP (CSRF, rate limit de auth, CSP, cookies, secrets fora do bundle), TypeScript strict mode, logger central, refactor de `Developers.tsx`. Sinalizou múltiplas sessões de IA operando concorrentemente no mesmo repositório durante essa auditoria — relevante para entender por que os relatórios daquele período divergiam entre si.
- **`docs/EXECUTIVE_STABILIZATION_REPORT.md`** (Fase 2) — Relatório mais curto e mais otimista: matriz de testes de CI (20.x/22.x), Workload Identity Federation no GCP, guia de secrets, remoção de `console.log` residual, e a afirmação (não reverificada na época) de que os 49 warnings de `any` foram zerados.

---

## Changelog deste documento

- **2026-09-05** — Reverificação completa com ferramentas reais (typecheck, lint, `vitest run --coverage`, `npm run build`, `npm audit`) após `npm install` limpo. Confirmados resolvidos desde 2026-08-02: conflito de merge em CI, CSRF do `react-router-dom`, thresholds de cobertura commitados, `console.*` zerado no frontend. Achado novo e priorizado: a métrica de cobertura não usa `coverage.all: true` e por isso **não inclui `pages/` nem `store/useStudioStore.ts`** — o número "58.94%" mede só os ~56% do código que algum teste toca, não o produto inteiro (§1.1). Mapeados os 6 controllers em 0% de cobertura de statements. Detalhado o `npm audit` atual por pacote e se cada achado chega em produção (`qs` sim, via `express`/`twilio`/`elevenlabs`; `adm-zip`/`nanoid`/`fast-uri`/`uuid` não, vêm de `packages/sip-agent` não deployada e de `testcontainers` dev-only). Medido bundle de produção atual (`VoiceStudio` 930.89 kB). Adicionado item novo: ausência de Dependabot/CodeQL/`npm audit` em CI.
- **2026-08-02** — Consolidação inicial: 4 relatórios sobrepostos substituídos por este arquivo único. Verificado estado atual do código e encontrado o achado crítico dos marcadores de merge conflict não resolvidos em `ci.yml`/`deploy.yml` no HEAD de `main` (resolvido posteriormente, ver acima).
