# Platform Roadmap

Este documento é o roadmap de produto/engenharia da Birth Voices Hub. Ele é complementar a dois
outros documentos vivos do repositório, que continuam sendo a fonte de verdade para os respectivos
assuntos — este arquivo não os substitui nem duplica o conteúdo deles:

- **`docs/AUDIT.md`** — estado verificado agora (typecheck/lint/testes/cobertura/`npm audit`/bundle)
  e débito técnico em aberto. Antes de puxar qualquer item deste roadmap para execução, conferir lá
  se algo já mudou desde a última passada.
- **`AGENTS.md` + `.agents/`** — o roster de 11 agentes especialistas + 1 coordenador que leva o
  código ao estado de release, organizado em ondas (`EXECUCAO-ONDAS.md`). Onda 1 e Onda 2 já foram
  **aprovadas** (`.agents/runs/onda-1.md`, `onda-2.md`); Onda 3 (Design/A11y + QA/Release) e Onda 4
  (SDK, Infra/Observabilidade, Supervisão) ainda não rodaram. Cada fase abaixo indica entre colchetes
  qual agente do roster é o dono natural do item, para que uma futura onda saiba para quem
  direcionar o trabalho sem precisar reabrir a discussão de propriedade de arquivo.

**Como ler as fases**: não são um calendário fixo — são horizontes de prioridade. Fase 0 é o que
falta para a Onda 3/4 fecharem o release atual. Fases 1-4 são evolução incremental do que já existe
(a numeração herda o roadmap anterior). Fases 5+ são os horizontes novos deste ciclo: motor de
workflow real, monetização, performance/UX, IA avançada, escala/confiabilidade, segurança/compliance
e ecossistema — nessa ordem de prioridade de negócio, não de dificuldade técnica.

---

## Fase 0: Fechar o release atual (bloqueador de tudo abaixo)

Sem isso, qualquer feature nova nasce em cima de uma base sem gate de qualidade fechado.

- [ ] Onda 3 — Design System/A11y (`03`) + QA/Segurança (`08`): rodar o gate completo
      (`typecheck`, `lint`, `test`, `test:e2e`, `test:contracts`, `test:infrastructure`, `build`) e
      produzir `docs/release/PRODUCTION-READINESS.md` com decisão `RELEASE APPROVED` ou `BLOCKED`.
- [ ] Fechar os handoffs de prioridade `alto` herdados das Ondas 1-2 antes de aprovar (ver
      `.agents/runs/onda-2.md` → "Handoffs abertos"): propagação de `tenantId` no `LLMGateway`
      (`04`→`05`), testes desatualizados de `outboundCallService` (`08`).
- [ ] Ligar `coverage.all: true` em `vite.config.ts` (`08`) — hoje os thresholds de cobertura
      passam sem medir `pages/` nem `store/useStudioStore.ts` (ver `docs/AUDIT.md` §1.1). Rodar de
      novo com o número real antes de qualquer decisão de subir threshold.
- [ ] Adicionar `npm audit --omit=dev --audit-level=high` ao `ci.yml` (`10`) e configurar
      Dependabot/Renovate — hoje nada pega uma vulnerabilidade nova automaticamente.

---

## Fase 1: Fundação Enterprise — status real

- [x] Consolidar arquitetura de backend (Clean Architecture Controller → Service → Repository).
- [x] Multi-tenancy via `tenantId` em praticamente todo model Prisma, com testes de isolamento
      (`__tests__/tenant-isolation.test.ts`).
- [x] RBAC e autenticação JWT (access curto + refresh longo, cookies `httpOnly`/`Secure`/`SameSite`).
- [x] Pipeline de CI/CD (GitHub Actions) com Postgres/Redis reais em serviço, não mocks.
- [x] Documentação de developer experience (`docs/**`, `ARCHITECTURE.md`, `docs/adr/*`).
- [ ] **Ainda não fechado, apesar do título "Enterprise Foundation"**: Row-Level Security nativa no
      Postgres — isolamento depende inteiramente do `where: { tenantId }` em cada repository, sem
      rede de segurança no banco. [`01`]

## Fase 2: API & Integrações

- [ ] Auditar `docs/api/openapi.yaml` contra as rotas reais e fechar divergências antes de anunciar
      "spec 3.1 finalizada". [`09`]
- [ ] Regenerar `packages/sdk` a partir da spec auditada; publicar como pacote versionado (hoje é
      workspace interno, não hospedado). [`09`]
- [ ] Sistema de retry de webhook com BullMQ: hoje o worker existe (`src/services/webhook.worker.ts`,
      cobertura de testes ~4%, ver `docs/AUDIT.md`) mas sem teste de carga nem dead-letter queue
      documentada. [`06`]
- [ ] Chaves de API reais por tenant (hoje `Developers.tsx`/`ApiKeys` mostra dado de exemplo — ver
      handoff `02-para-09-api-key-backend.md`): geração, rotação, escopo por permissão, revogação
      auditável. [`09`]
- [ ] Rate limit e cota por chave de API (não só por IP como hoje). [`01`]
- [ ] Workspaces Postman/Insomnia gerados automaticamente a partir da spec, não mantidos à mão.
      [`09`]

## Fase 3: Motor de Voz & IA

- [x] `LLMGateway` com failover entre provedores e teste dedicado (`llmGatewayFailover.test.ts`).
- [ ] **`ai.controller.ts` ainda chama `getGeminiClient()` direto na maioria dos handlers**, fora do
      gateway — terminar a migração para que todo caminho de IA tenha failover e gate de consentimento
      uniforme (ver `docs/AUDIT.md` §2). Controller hoje em 0% de cobertura de testes. [`04`]
- [ ] Streaming completo no Voice Runtime (`StreamingEngine.ts` existe; validar latência ponta-a-
      ponta sob carga real, não só unitário). [`04`]
- [ ] RAG real: hoje `KnowledgeConfidenceEngine.ts` roda sobre conhecimento simulado em memória, sem
      `pgvector`/Qdrant, e a página `KnowledgeManager` é explicitamente dado de exemplo (sem pipeline
      de upload/antivírus ligado ao botão). Entregar: ingestão real com varredura de antivírus
      (`src/infrastructure/antivirus.ts` já existe, falta o pipeline), chunking, embeddings, busca
      vetorial, e citação de fonte na resposta do agente. [`04`+`06`]
  - [ ] Suporte multi-idioma na base de conhecimento e na síntese de voz (hoje `pt-BR`-cêntrico).
- [ ] `ToolEngine.ts` sem nenhuma ferramenta real registrada em produção — sair de "engine pronto,
      catálogo vazio" para pelo menos 3 integrações reais (CRM, calendário, pagamento) substituindo
      o dado de exemplo de `ToolRegistry.tsx`. [`04`+`06`]
- [ ] Prompt Manager com versionamento, diffs e rollback de prompt por agente (hoje prompt é campo
      solto no `Agent`, sem histórico). [`04`]
- [ ] Avaliação/red-teaming de agentes: suíte de conversas sintéticas para detectar regressão de
      qualidade/tom antes de publicar uma nova versão de agente ou de prompt. [`04`+`08`]
- [ ] Expandir provedores além de Gemini/OpenAI/Anthropic/ElevenLabs já suportados: avaliar TTS/STT
      locais adicionais e um segundo provedor de telefonia além de Twilio+PoC LiveKit. [`04`+`05`]

## Fase 4: Observabilidade & Escala

- [ ] OpenTelemetry ponta-a-ponta (hoje parcial — `lib/voice-runtime/otel.ts` em 17% de cobertura,
      `SessionManager.ts` em 37%): trace unindo webhook de entrada → sessão de voz → resposta de IA →
      encerramento de chamada, com Correlation ID propagado em todo log `pino`. [`10`]
- [ ] Dashboards versionados (Grafana/Loki) a partir de `infrastructure/observability/*.yml`, hoje
      só a configuração existe — sem dashboard publicado nem alerta configurado. [`10`]
- [ ] Autoscaling horizontal no Cloud Run baseado em profundidade de fila do BullMQ, não só CPU/
      memória. [`10`]
- [ ] CLI de administração da plataforma (criar tenant, rotacionar segredo, forçar reprocessamento
      de webhook) — hoje toda operação administrativa é manual via banco ou painel. [`09`+`10`]

---

## Fase 5: Motor de Workflow Real (Studio ↔ Runtime) — maior gap do produto hoje

Identificado nas Ondas 1-2 como o maior item de escopo pendente (`.agents/runs/onda-2.md`): o
Workflow Studio deixa desenhar e publicar um grafo, mas **o Voice Runtime ainda não executa nenhum
workflow publicado** — a conversa real não segue os nós montados no editor. Contrato já especificado
em `.agents/handoffs/onda-2/07-para-04-contrato-execucao-workflow.md`.

- [ ] Motor de execução de grafo no Voice Runtime: os 12 tipos de nó do Studio, roteamento
      condicional, chamada de ferramenta, leitura/escrita de memória de sessão e consulta à base de
      conhecimento — tudo interpretando o `Workflow.nodes`/`edges` publicado, não um fluxo fixo em
      código. [`04`, contrato acordado com `07`]
- [ ] Execução em modo de teste dentro do próprio Studio (`TestSimulatorModal.tsx` já existe como
      UI — hoje sem engine real por trás) rodando o mesmo motor de produção, não uma simulação à
      parte que pode divergir do comportamento real. [`04`+`07`]
- [ ] Versionamento de workflow com rollback: publicar uma versão nova não pode quebrar chamadas em
      andamento na versão anterior; precisa de estratégia de corte (nova sessão pega a versão nova,
      sessão em curso termina na versão com que começou). [`07`, schema com `01`]
- [ ] Métricas por nó do grafo (tempo de execução, taxa de erro, taxa de abandono do lead naquele
      ponto do fluxo) alimentando `Observability`/`Overview` com dado real, nunca fabricado (regra
      já existente em `AGENTS.md` §14). [`04`+`02`]
- [ ] Colaboração em tempo real no Studio (`workflowCollabService.ts` já existe, ~65% de cobertura):
      cursores de outros editores, lock por nó em edição simultânea, não só resolução de conflito de
      versão no salvamento. [`07`]

## Fase 6: Growth, Billing e Monetização

Hoje `Billing.tsx` é vitrine (67 linhas, sem backend — ver handoffs `02-para-00-billing-backend.md`
e `02-para-00-notificacoes-backend.md`, ambos em aberto desde a Onda 2, sem dono designado no
roster atual). Esta fase assume que esse domínio ganha um dono dedicado — ver "Revisão da
quantidade de agentes" mais abaixo.

- [ ] Cobrança real (Stripe ou gateway equivalente): planos, ciclo de faturamento, upgrade/downgrade
      com proração, inadimplência com degradação gradual de acesso (nunca corte abrupto de chamada
      em andamento).
- [ ] Medição de uso real como base de cobrança: minutos de chamada, tokens de IA por provedor,
      armazenamento de gravação/documento — hoje esses números não existem persistidos em lugar
      nenhum consultável para faturamento.
- [ ] FinOps de custo de IA: custo real por chamada (tokens × preço do provedor usado, incluindo o
      provedor de fallback do `LLMGateway`) visível por tenant e por agente, não só contagem de
      chamadas.
- [ ] Sistema de notificações (e-mail/webhook/in-app) para eventos de billing, incidente de chamada,
      falha de webhook — hoje inexistente como sistema, cada domínio loga para si mesmo.
- [ ] Marketplace de agentes com backend real: hoje `AgentMarketplace.tsx` é catálogo estático sem
      endpoint de listagem/instalação. Evoluir para catálogo real, e — horizonte mais distante —
      compartilhamento entre tenants com controle de autoria e, se fizer sentido de negócio, revenue
      share para autor externo de template.

## Fase 7: Experiência, Performance e Design System v2

"CSS, JS e fluxos" no sentido literal — acabamento de produto, não só corretude.

- [ ] Code-splitting agressivo: `dist/assets/VoiceStudio-*.js` sai em 930 kB e o chunk `index`
      principal em 442 kB, ambos acima do limite de aviso do Vite (ver `docs/AUDIT.md`). Quebrar em
      lazy-load por seção do Studio (canvas, painéis, simulador) em vez de um bundle único. [`02`+`03`]
- [ ] Virtualização de listas longas (histórico de chamadas, log de auditoria, resultados) — hoje
      renderização direta sem `react-window`/equivalente. [`02`]
- [ ] Web Worker para processamento de waveform (`wavesurfer.js`) e para o pipeline de áudio
      (`AudioPipeline.ts`), tirando trabalho pesado da thread principal do navegador durante uma
      chamada ao vivo. [`04`+`02`]
- [ ] Design System v2: sistema de motion consistente (hoje `motion`/Framer já é dependência, uso
      pontual), tokens de espaçamento/elevação formalizados em `components/design-system/tokens.ts`
      (hoje cobre cor/tema, não espaçamento/sombra/motion), auditoria de contraste em modo escuro
      completo. [`03`]
- [ ] Acessibilidade real (não só auditoria pontual da Onda 3): navegação completa por teclado no
      Studio (hoje um canvas de nós/arestas, historicamente o ponto mais difícil de tornar acessível),
      leitura de tela testada nos fluxos críticos (login, criar agente, publicar workflow). [`03`]
- [ ] Responsividade do `LiveSupervisor` e do `Dashboard/Overview` para tablet — hoje o layout
      assume desktop; supervisão em campo/mobile é um pedido recorrente de operação de call center.
      [`11`+`02`]
- [ ] Modo de alto contraste e tamanho de fonte ajustável, além do dark mode já existente via
      `ThemeContext`. [`03`]

## Fase 8: Confiabilidade & Escala

- [ ] Row-Level Security nativa no Postgres como segunda camada de defesa, não substituindo o filtro
      por `tenantId` no repository — defesa em profundidade real contra bug de omissão de filtro.
      [`01`]
- [ ] Estratégia de multi-região / disaster recovery: hoje deploy único no Cloud Run sem plano de
      failover de região documentado para o banco/Redis. [`10`]
- [ ] Teste de carga real (`k6-load-test.js` já existe) integrado ao pipeline de release, não só
      disponível como script manual — meta de latência sob carga para o caminho de voz ao vivo
      (o mais sensível a P99, não a média). [`10`+`04`]
- [ ] Upgrades major de dependência represados: `prisma` (5→7, duas majors), `openai` (6→7),
      `ioredis`+`bullmq` (acoplados, upgrade conjunto), `lucide-react` (0.x→1.x) — cada um em PR
      isolado com a suíte completa rodando antes/depois (ver `docs/AUDIT.md` §3.3). [`01`/`04`/`10`
      conforme o pacote]
- [ ] Decidir o destino de `packages/sip-agent` (PoC LiveKit/3CX, não deployada, origem do único
      achado *high* de `npm audit` que chega via árvore de dependências): promover a produção com
      validação de latência documentada, ou extrair do workspace raiz. [`05`, decisão registrada
      como handoff para o Coordenador]

## Fase 9: Segurança & Compliance Avançada

- [ ] SSO/SAML e provisionamento SCIM para clientes enterprise (hoje só login local + OIDC/Keycloak
      de infraestrutura, sem wiring de aplicação — handoff aberto desde a Onda 1). [`01`]
- [ ] Processo de disclosure de vulnerabilidade documentado em `SECURITY.md` (hoje descreve só os
      controles existentes, sem contato/versões suportadas — ver `docs/AUDIT.md` §2). [`01`, texto
      revisado por `09`]
- [ ] SAST (Semgrep), DAST e SBOM (CycloneDX) no pipeline, não só `npm run security:trivy` manual
      via Docker Compose. [`10`+`08`]
- [ ] MFA para contas administrativas e rotação automática de segredo via cofre (Vault ou
      equivalente gerenciado), substituindo variável de ambiente estática para credencial de alto
      risco (Twilio, Bland AI, chaves de IA). [`01`+`10`]
- [ ] Preparação para certificação (SOC 2 Tipo II ou ISO 27001, conforme prioridade comercial):
      trilha de auditoria completa, política de retenção formalizada além do `CallLog` (já tem
      retenção implementada, falta agendamento periódico — handoff aberto desde a Onda 1), gestão
      de acesso revisável por terceiro. [`01`+`08`]

## Fase 10: Ecossistema & Enterprise

- [ ] White-label completo: a base já existe (cor de marca dinâmica por tenant via
      `brandColor.controller.ts` e `applyBrandColorToDom`) — estender para logo, domínio customizado,
      remetente de e-mail e nome do produto na interface do agente ao vivo. [`02`+`01`]
- [ ] SDKs oficiais em mais de uma linguagem (hoje só TypeScript em `packages/sdk`) a partir da
      mesma spec auditada da Fase 2. [`09`]
- [ ] Integrações de CRM adicionais além do AtlasGR (hoje a única integração de produção real) —
      generalizar o padrão de webhook/idempotência já validado em produção para um segundo e
      terceiro CRM. [`06`]
- [ ] App/painel mobile (ou PWA instalável) para supervisão em tempo real fora do desktop, apoiado
      na responsividade entregue na Fase 7. [`11`]
- [ ] Programa de parceiros para o Marketplace de agentes (Fase 6) com processo de curadoria e
      revisão de qualidade antes de publicar template de terceiro. [`02`+`06`]

---

## Revisão da quantidade de agentes necessária

Ampliar o roadmap não significa multiplicar o número de agentes na mesma proporção — o roster de
`AGENTS.md` é cortado por **domínio do repositório**, não por tarefa. A mesma pessoa (agente) que
fechou a Onda 1 de telefonia é quem assume a próxima missão de telefonia na Fase 8, numa nova onda,
não um agente novo por item de roadmap. Reavaliando o roster de 11 especialistas + 1 coordenador
contra as 10 fases acima:

**Cobertura confirmada sem mudança** — os 11 especialistas já existentes absorvem a imensa maioria
do roadmap novo dentro do próprio domínio que já possuem: `01` (RLS, SSO, MFA, upgrades de schema),
`02` (performance de UI, white-label, virtualização), `03` (Design System v2, a11y), `04` (motor de
workflow, RAG real, prompt manager, avaliação de agente), `05` (segundo provedor de telefonia,
destino do `sip-agent`), `06` (segunda/terceira integração de CRM, ferramentas reais do
`ToolEngine`), `07` (versionamento de workflow, colaboração em tempo real), `08` (SAST/DAST, teste
de carga no pipeline), `09` (SDKs multi-linguagem, CLI), `10` (multi-região, autoscaling por fila,
Correlation ID), `11` (painel mobile de supervisão).

**Gap real de propriedade — recomendo 1 especialista novo**: a Fase 6 (Growth, Billing e
Monetização) não tem dono hoje. Os dois handoffs que a originaram
(`.agents/handoffs/onda-2/02-para-00-billing-backend.md` e `02-para-00-notificacoes-backend.md`)
estão em aberto desde a Onda 2 endereçados a "Coordenador/roadmap" precisamente porque cobrança,
medição de uso, FinOps de IA e notificações cruzam dado (`01`), IA (`04`) e produto (`02`) sem caber
inteiramente em nenhum — e é escopo grande o bastante (Stripe, faturamento, inadimplência,
marketplace com revenue share) para merecer propriedade de arquivo própria em vez de ping-pong de
handoff entre três agentes. Proposta: **Agente 12 — Growth, Billing e Monetização de Uso**, dono de
um novo domínio de repositório (ex.: `src/services/billingService.ts`,
`src/controllers/billing.controller.ts`, `pages/Dashboard/Billing.tsx`, sistema de notificações) a
ser criado.

Isso muda o total do roster de **11 → 12 especialistas** (13 papéis contando o Coordenador). Como
isso é mudança de governança — novo dono de arquivo, novo prompt em `.agents/prompts/`, atualização
da seção 11 de `AGENTS.md` — e `AGENTS.md` §4 é explícito que "nenhum agente edita o próprio prompt
ou o prompt de outro agente durante a execução — mudança de prompt é decisão humana, fora do ciclo
de ondas", **não crio o Agente 12 nem edito `AGENTS.md` sem confirmação** — ver pergunta ao final.

**Regra de concorrência (3 simultâneos, nunca 4)**: mantenho a recomendação de não alterá-la. Ela
não é limite de capacidade técnica — é limite de coordenação (o Coordenador revisa `git diff` de
cada branch antes de integrar; mais que 3 branches simultâneas por onda aumenta o risco de conflito
semântico não detectado, o mesmo risco que o próprio `AGENTS.md` §6 já cita ao exigir gate na branch
de integração, não só nas branches isoladas). Com 12 especialistas em vez de 11, uma onda de 4
membros (ex.: Fase 6 rodando junto com a Fase 8) simplesmente vira **2 sub-lotes de até 3** dentro
da mesma onda, como o próprio `EXECUCAO-ONDAS.md` já faz na Onda 3 (Design/QA + "1 agente anterior
por vez" para remediação).

**Plano de ondas sugerido para o roadmap novo** (após Onda 3/Onda 4 fecharem o release atual):
| Onda | Especialistas (máx. 3 por vez) | Foco |
|---|---|---|
| 5 | `04` (motor de execução de grafo), `07` (contrato + versionamento), `12`* (billing/uso, se criado) | Fase 5 (maior gap de produto) |
| 6 | `01` (RLS, upgrades de schema), `10` (multi-região, upgrades de infra), `08` (SAST/DAST/carga) | Fase 8 |
| 7 | `02` (performance/white-label), `03` (Design System v2/a11y), `04` ou `11` (painel mobile) | Fase 7 e início da 10 |
| 8 | `01` (SSO/MFA/compliance), `09` (SDKs/CLI), `06` (integrações de CRM adicionais) | Fase 9 e resto da 10 |

\* Onda 5 fica com 2 especialistas confirmados se o Agente 12 não for criado — o billing recuaria
para handoff cruzado entre `01`/`02`/`04` como já vem acontecendo, mais lento por natureza.

**Resposta direta**: para fechar o release atual, **zero agentes novos** — são as Ondas 3 e 4 já
planejadas com os 11 existentes. Para o roadmap ampliado, **11 dos 12 domínios novos já têm dono**,
faltando **1 especialista novo (Growth/Billing/Monetização)** se você quiser que esse domínio pare
de orbitar como handoff sem dono. Paralelismo continua o mesmo: **3 agentes especialistas por vez,
nunca 4**, independentemente de o roster crescer para 12 — o teto é de coordenação, não de tarefa.

**Antes de eu seguir**: quer que eu crie o Agente 12 de verdade — prompt em
`.agents/prompts/12-growth-billing-monetizacao.md`, atualização da seção 11 (propriedade de
arquivo) e do roster global em `AGENTS.md`, e o bloco correspondente em `COMO-CHAMAR-OS-AGENTES.md`
— ou prefere manter o billing como handoff cruzado entre `01`/`02`/`04` por enquanto?
