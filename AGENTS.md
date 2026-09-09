# AGENTS.md — Governança Global de Agentes

## Projeto
BIRTH-VOICES-HUB

Este arquivo é a regra global para qualquer agente que trabalhe neste repositório. Regras locais em `AGENTS.md` dentro de subpastas (se vierem a existir) refinam o escopo, mas nunca anulam as regras de segurança, qualidade e coordenação deste arquivo. Em caso de conflito, este arquivo vence. `CONTRIBUTING.md` continua sendo a referência para fluxo de PR/commit humano e não é substituído por este documento.

## 1. Contexto do Projeto
Plataforma enterprise multi-tenant para criar, orquestrar e monitorar agentes autônomos de voz e texto de alto volume (atendimento, vendas e automação de fluxos empresariais). Backend Node.js/Express 5 em Clean Architecture (Controller → Service → Repository) com Prisma/PostgreSQL, frontend React 19/Vite/Zustand. Motor de voz próprio (`lib/voice-runtime/`) com failover entre provedores de LLM/TTS, integração de telefonia real via Twilio, e uma integração de produção com o CRM AtlasGR (webhook `/api/webhook/atlasgr/outbound` → chamada de qualificação via Bland AI). Roda em Cloud Run.

## 2. Regras de Código & Arquitetura (aplicam a todo agente, sempre)
- Escreva código completo de nível de produção. NUNCA use comentários como `// TODO: implementar` ou omita trechos de código.
- Stack principal: Node.js, Express 5, Prisma ORM, TypeScript, Vitest, Playwright, Docker.
- NUNCA remova validações de segurança nas rotas de telefonia ou na manipulação de áudio.
- Use TypeScript estrito (zero `any`, sem `@ts-ignore`/`@ts-expect-error` — corrija a causa raiz, não silencie o erro).
- Tratamento rigoroso de exceções com blocos `try/catch`; nenhum catch vazio ou que apenas loga e segue como se nada tivesse acontecido em caminho crítico (telefonia, pagamento de créditos, autenticação).
- Respeite Clean Architecture: Controller → Service → Repository, sem pular camada. Não coloque lógica de negócio em controller nem acesso a Prisma fora de `src/repositories/**`.
- Garanta que `vitest` (unitário/integração) e `playwright` (e2e) passem antes de alterar rotas.

## 3. Segurança & Privacidade (LGPD)
- Trate dados de contatos e gravações de voz com criptografia, controle de acesso e anonimização rigorosa.
- Nunca persista chaves de API ou segredos diretamente no código (`.env` obrigatório).
- Ver seção "LGPD e dados pessoais" abaixo para responsabilidade por domínio.

## 4. Estrutura oficial de agentes
- 00 — Coordenador
- 01 — Plataforma, Segurança, Tenancy e Dados
- 02 — Produto, Navegação e UX
- 03 — Design System e Acessibilidade
- 04 — Voice Runtime e Gateway de IA
- 05 — Telefonia, Chamadas e Webhooks
- 06 — Integrações Externas (AtlasGR/Bland AI, Object Storage, Antivírus)
- 07 — Studio, Workflows e Colaboração
- 08 — QA, Testes e Segurança
- 09 — SDK, Contratos e Documentação de API
- 10 — Infraestrutura, Observabilidade e Deploy
- 11 — Supervisão em Tempo Real e Telemetria
- 12 — Growth, Billing e Monetização de Uso

Prompts: `.agents/prompts/`. Nenhum agente edita o próprio prompt ou o prompt de outro agente durante a execução — mudança de prompt é decisão humana, fora do ciclo de ondas.

Este roster foi definido a partir da estrutura real do repositório (ver `.agents/README.md` para o racional de cada corte de domínio), não copiado de outro projeto. Ele prioriza segurança/tenancy, telefonia real e a integração externa já em produção com o AtlasGR antes de UX e acabamento — ver "Onda 1" abaixo.

O Agente 12 foi adicionado depois dos demais (roadmap pós-release, não faz parte do caminho para o
release atual): dois handoffs sobre billing e notificações ficaram órfãos desde a Onda 2
(`.agents/handoffs/onda-2/02-para-00-billing-backend.md`, `02-para-00-notificacoes-backend.md`),
endereçados a "Coordenador/roadmap" porque cruzam dado (01), IA (04) e produto (02) sem caber
inteiramente em nenhum. Ver `ROADMAP.md` → "Fase 6" e → "Revisão da quantidade de agentes
necessária" para o racional completo. Ele não participa das Ondas 1-4 (fechamento do release atual)
— sua primeira missão é a Onda 5, ainda não especificada em `EXECUCAO-ONDAS.md` (ver nota ao final
da seção 5).

## 5. Regra de concorrência
O coordenador ocupa 1 slot. No máximo 3 especialistas podem executar simultaneamente, em qualquer onda.

Nunca iniciar 4 especialistas ao mesmo tempo.

### Onda 1 — Fundação (segurança, telefonia real, integração externa em produção)
Executar em paralelo:
1. Agente 01 — Plataforma, Segurança, Tenancy e Dados
2. Agente 05 — Telefonia, Chamadas e Webhooks
3. Agente 06 — Integrações Externas

### Onda 2 — Motor de Voz e Produto
Executar em paralelo:
1. Agente 04 — Voice Runtime e Gateway de IA
2. Agente 02 — Produto, Navegação e UX
3. Agente 07 — Studio, Workflows e Colaboração

### Onda 3 — Acabamento
Executar em paralelo:
1. Agente 03 — Design System e Acessibilidade
2. Agente 08 — QA, Testes e Segurança
3. Um agente anterior por vez para remediações apontadas por QA

### Onda 4 — Extensões (pode ser antecipada por prioridade de negócio)
Executar em paralelo, depois de `RELEASE APPROVED` na Onda 3 (ou antes, se o Coordenador decidir — nenhuma delas depende de bloqueador das Ondas 1–3):
1. Agente 09 — SDK, Contratos e Documentação de API
2. Agente 10 — Infraestrutura, Observabilidade e Deploy
3. Agente 11 — Supervisão em Tempo Real e Telemetria

### Ondas 5+ — Roadmap pós-release (fora do caminho de release atual)
`EXECUCAO-ONDAS.md` hoje só especifica as Ondas 0-4 (o caminho até `RELEASE APPROVED` do código já
existente). As ondas seguintes, cobrindo o roadmap ampliado em `ROADMAP.md` (Fases 5-10, incluindo o
Agente 12), ainda não têm especificação formal de branch/gate/critério de bloqueio ali — a
distribuição sugerida (ex.: Onda 5 = Agentes 04, 07 e 12 na Fase 5 do roadmap) está em `ROADMAP.md`
→ "Revisão da quantidade de agentes necessária" como proposta, não como regra vigente. Antes de
disparar uma Onda 5 de verdade, o Coordenador deve formalizá-la em `EXECUCAO-ONDAS.md` seguindo o
mesmo padrão das Ondas 1-4 (branch de integração, gate, critérios de "não avançar se existir"). A
regra de no máximo 3 especialistas simultâneos vale igualmente para qualquer onda futura.

## 6. Isolamento de execução (git worktree)

Agentes rodando "em paralelo" nunca podem compartilhar o mesmo working tree. Edição simultânea no mesmo checkout corrompe o trabalho uns dos outros mesmo sem conflito de merge (arquivos meio escritos, index inconsistente, testes lendo estado de outro agente).

Antes de iniciar uma onda, o Coordenador:
1. cria/atualiza a branch de integração da onda: `integracao/onda-<n>`, a partir da última onda aprovada (ou de `main` na Onda 1);
2. cria uma branch por especialista ativo a partir dessa branch de integração: `agente/<numero>-<slug>`, por exemplo `agente/01-plataforma-seguranca-dados`;
3. cria um `git worktree` dedicado por especialista ativo, apontando para a branch dele, por exemplo `git worktree add ../wt-agente-01 agente/01-plataforma-seguranca-dados`;
4. entrega a cada especialista apenas o caminho do seu próprio worktree — nunca o worktree de outro agente.

Cada especialista:
- trabalha exclusivamente dentro do seu worktree;
- commita em commits pequenos e coerentes, seguindo Conventional Commits (ver `CONTRIBUTING.md`), prefixados com o próprio id do agente no escopo: `feat(01): ...`, `fix(05): ...`, `test(08): ...`;
- nunca faz `git push --force` nem reescreve histórico compartilhado;
- ao concluir sua missão da onda (ou ao atingir um ponto seguro de handoff), roda o próprio gate local no seu worktree antes de sinalizar pronto para integração.

O Coordenador, ao final (ou durante) da onda:
1. revisa o `git diff` de cada branch de especialista;
2. confirma que nenhum arquivo fora do escopo/propriedade do especialista foi tocado;
3. faz merge de cada branch aprovada em `integracao/onda-<n>`;
4. roda o gate da onda **na branch de integração**, não apenas nas branches individuais — um gate verde em cada branch isolada não garante ausência de conflito semântico entre elas (ex.: 04 e 07 mexendo em contratos diferentes do mesmo `Workflow`);
5. se o gate da integração falhar após um merge específico, isola qual merge introduziu a falha, reverte esse merge e devolve ao agente dono com reprodução;
6. remove os worktrees temporários (`git worktree remove`) após a onda ser aprovada, preservando as branches até o merge final em `main`.

Se a ferramenta/ambiente de execução não suportar múltiplos worktrees simultâneos, os especialistas da onda devem rodar em série (um de cada vez, cada um fazendo commit e integrando antes do próximo começar) em vez de dividir um único working tree ao vivo. Concorrência sem isolamento nunca é aceitável.

## 7. Protocolo de handoff

Handoff nunca é apenas texto solto na saída do agente — é um artefato rastreável.

Formato: um arquivo por handoff em `.agents/handoffs/onda-<n>/<de>-para-<para>-<slug>.md`, por exemplo `.agents/handoffs/onda-1/05-para-01-schema-callLog-gravacao.md`, contendo:
```markdown
- De: <agente origem>
- Para: <agente destino>
- Onda: <n>
- Status: aberto | em-andamento | resolvido
- Prioridade: bloqueador | alto | normal
## Problema
## Arquivo(s) envolvido(s)
## Alteração necessária
## Teste esperado
## Contexto adicional
```

Regras:
- qualquer agente pode criar seu próprio arquivo de handoff dentro de `.agents/handoffs/**`;
- um agente não edita o handoff criado por outro agente, exceto para atualizar o campo `Status` quando ele é o destinatário que resolveu o item (adicionar uma seção `## Resolução` abaixo, nunca apagar o pedido original);
- o Coordenador não aprova uma onda com handoff `Status: aberto` marcado como `Prioridade: bloqueador` direcionado a um bloqueador da lista abaixo;
- handoffs não bloqueadores podem transitar para a onda seguinte, desde que registrados no relatório da onda.

## 8. Scripts ausentes

Antes de rodar qualquer `npm run <script>` de um gate, o agente verifica se o script existe em `package.json` → `scripts`. Se não existir:
- não trate como sucesso silencioso e não pule a linha sem registro;
- registre explicitamente na evidência: "script `<nome>` inexistente em package.json — gate não aplicável nesta execução";
- se o script deveria existir para o domínio do agente, abra handoff para 08 propondo a criação do script, com prioridade alto.

Nota: este repositório **não** tem scripts `test:unit`/`test:integration` separados como projetos irmãos podem ter — `npm run test` (Vitest) já cobre unitário e integração juntos. Não invente esses scripts nem tente separá-los sem handoff aprovado.

## 9. Bloqueadores prioritários
Antes de adicionar novas funcionalidades, eliminar ou validar como resolvidos:
1. Bypass de RBAC/tenant em rota administrativa, de telefonia ou de webhook.
2. Vazamento cross-tenant (dado de uma organização acessível por outra).
3. Segredo exposto — Twilio, Bland AI, ElevenLabs, OpenAI/Anthropic/Gemini, `JWT_SECRET`/`REFRESH_TOKEN_SECRET`, `WEBHOOK_SIGNING_SECRET`, credenciais S3/MinIO, client secret do Keycloak.
4. Deploy no Cloud Run capaz de iniciar sem `prisma migrate deploy` aplicado com sucesso.
5. Rota de telefonia ou webhook (Twilio, AtlasGR, Bland AI) sem validação de assinatura/origem, permitindo requisição forjada ou replay.
6. Failover do `LLMGateway` não caindo de fato para o provedor garantido (Gemini) quando os demais falham — falha silenciosa em chamada real com usuário/lead ao telefone.
7. Gravação de voz ou dado de contato armazenado sem controle de acesso ou anonimização adequada.
8. Dado pessoal enviado a provedor de IA externo (OpenAI/Anthropic/ElevenLabs/Gemini) sem consentimento registrado.
9. `packages/sip-agent` (PoC LiveKit/3CX) conectado ao caminho de produção sem validação de latência documentada — ele existe hoje explicitamente como não-produção.
10. Upload de arquivo contornando a varredura de antivírus (ClamAV) antes de ir para S3/MinIO.
11. Webhook do AtlasGR (`/api/webhook/atlasgr/outbound`) ou callback da Bland AI processado sem idempotência, permitindo disparo duplicado de ligação real para o mesmo lead.
12. Onboarding/criação de novo tenant sem `Role`/`Permission` padrão consistente (RBAC quebrado para organização nova).
13. Studio permitindo publicar/ativar um workflow que não passou pelo `ValidationEngine`.
14. Dashboard/telemetria (Observability, LiveSupervisor) exibindo métrica fabricada em vez de dado real vindo de OpenTelemetry/BullMQ/Socket.io.
15. Dump/backup de banco versionado no git, ou `.env` real commitado.
16. Cobrança duplicada, saldo/plano incorreto ou dado de pagamento não tokenizado no domínio de billing (Agente 12) — mesma classe de gravidade do item 11 (idempotência), agora aplicada a dinheiro real do cliente em vez de ligação real para o lead.

## 10. Regra de autonomia
Não interromper o usuário para decisões técnicas rotineiras.

Quando houver um problema solucionável no repositório:
1. Reproduzir.
2. Identificar causa raiz.
3. Corrigir no escopo do agente responsável.
4. Adicionar ou atualizar testes.
5. Executar validações.
6. Registrar evidências.
7. Solicitar ao coordenador somente alterações que pertençam a outro dono.

Perguntas ao usuário são último recurso e apenas para fatos externos realmente indisponíveis, como credenciais, decisões comerciais irreversíveis ou permissões de produção/Cloud Run.

## 11. Propriedade exclusiva de arquivos
- `prisma/schema.prisma`, `prisma/migrations/**`, `prisma/seed.ts`: somente Agente 01.
- `src/middlewares/**` (auth/CSRF/RBAC), `src/lib/auth-tokens.ts`, `src/lib/cookies.ts`, `src/lib/requestContext.ts`, `src/infrastructure/oidc.ts`: somente Agente 01.
- `App.tsx`, `index.tsx`, `index.html`, `index.css`, shell de navegação/roteamento (`pages/Landing.tsx`, `Login.tsx`, `Register.tsx`, layout do Dashboard): somente Agente 02.
- `components/design-system/**`: somente Agente 03.
- `lib/voice-runtime/**` (inclusive `providers/**` e `intelligence/**`), `src/services/workflowRuntimeService.ts`: somente Agente 04. (`workflowRuntimeService.ts` não estava formalmente atribuído até a Onda 5 — ver `docs/patterns/workflow-execution-contract.md`, que já o descrevia como consumido por Agente 04/05; formalizado aqui para Agente 04, já que estender os tipos de nó do motor de execução — tool-calling, RAG de knowledge base, memória — é trabalho de IA/Gateway, não de telefonia. Agente 05 continua consumindo-o só leitura via `telephonyService.ts`, seu arquivo.)
- `src/controllers/telephony.controller.ts`, `voiceOutbound.controller.ts`, `callLog.controller.ts`, `src/services/telephonyService.ts`, `twilioClient.ts`, `outboundCallService.ts`, `callLogService.ts`, `src/services/webhook.service.ts`, `webhook.worker.ts`, `packages/sip-agent/**`: somente Agente 05.
- `src/features/prospecting/**` (integração AtlasGR/Bland AI), `src/infrastructure/objectStorage.ts`, `src/infrastructure/antivirus.ts`: somente Agente 06.
- `components/studio/**`, `lib/studio/**`, `src/controllers/workflow.controller.ts`, `workflowCollab.controller.ts`, `src/services/workflowService.ts`, `workflowCollabService.ts`, `store/useStudioStore.ts`, `pages/Dashboard/VoiceStudio.tsx`: somente Agente 07.
- `__tests__/**`, `e2e/**`, `contracts/**`, `pacts/**`, `playwright.config.ts`, `vitest.setup.ts`, `k6-load-test.js`: somente Agente 08.
- `packages/sdk/**`, `docs/api/**`, `docs/adr/**`, `docs/sdk/**`, `docs/examples/**`, `docs/patterns/**`, `docs/cli/**`, `docs/dx/**`, `docs/webhooks/**`, `docs/ai/**`, `docs/security/**`: somente Agente 09.
- `Dockerfile`, `docker-compose.yml`, `docker-compose.opensource.yml`, `.github/workflows/**`, `infrastructure/**`: somente Agente 10.
- `components/LiveSupervisor/**`: somente Agente 11.
- `pages/Dashboard/Billing.tsx`, `src/controllers/billing.controller.ts`, `notification.controller.ts`, `src/services/billingService.ts`, `usageMeteringService.ts`, `notificationService.ts`, `src/routes/billing.routes.ts`, `notification.routes.ts`, `components/NotificationCenter/**`: somente Agente 12 (ver `.agents/prompts/12-growth-billing-monetizacao.md`).
- `server.ts`: alteração exige aprovação explícita do Agente 00 (bootstrap único: Express, Socket.io, rate limiting, montagem de rotas — várias equipes dependem da ordem de middleware ali).
- `package.json` e `package-lock.json`: alteração exige aprovação explícita do Agente 00 (workspaces npm compartilhados).
- `.agents/prompts/**`: nenhum especialista edita; mudança de prompt é decisão humana fora do ciclo de execução.
- `.agents/runs/**`: escrito pelo Coordenador; especialistas apenas leem.
- `.agents/handoffs/**`: qualquer agente cria seus próprios arquivos; não edita handoff alheio (ver "Protocolo de handoff").
- `src/repositories/**` que não sejam exclusivos de outro agente (ex.: `agentRepository.ts`, `metricRepository.ts`) podem ser editados pelo agente dono do domínio correspondente, mas nenhum agente além do 01 altera o schema/migração que sustenta esses repositórios — mudança de modelo passa por handoff para 01.

## 12. Regras de conflito
1. O agente que não é dono do arquivo não faz a alteração.
2. Produza um handoff curto com: problema, arquivo, alteração necessária, teste esperado (ver "Protocolo de handoff").
3. O coordenador encaminha ao dono.
4. Mudanças cross-domain devem ter contrato de interface antes da edição (ex.: 07 e 04 acordam o formato de `Workflow.nodes`/`edges` antes de qualquer um dos dois alterar consumo).
5. Nunca resolver conflito apagando a mudança de outro agente.

## 13. Segurança e higiene
Nunca commitar ou copiar para pacote:
- `.env` real;
- tokens, chaves, senhas, cookies ou webhooks secretos (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `WEBHOOK_SIGNING_SECRET`, `BLAND_API_KEY`, credenciais Twilio/ElevenLabs/OpenAI/Anthropic/Gemini, credenciais S3/MinIO, client secret do Keycloak);
- `.git/`;
- `node_modules/`;
- `dist/`;
- ambientes virtuais;
- dumps e backups de banco;
- logs contendo dados sensíveis (conteúdo de gravação de chamada, transcript, dado pessoal de contato).

Manter apenas exemplos sanitizados, como `.env.example`.

Nunca colocar segredos em fixtures, screenshots, relatórios, prompts ou mensagens de erro.

Antes de finalizar qualquer onda, rodar varredura de segredo versionado sobre o diff acumulado da onda (ferramenta disponível no projeto, ou busca manual por padrões de chave/token/webhook). Achado positivo é bloqueador — ver protocolo em 08 e regra de credenciais em 01. O projeto já tem Trivy disponível via `npm run security:trivy` (perfil `tools` do docker-compose) — use-o quando o ambiente suportar Docker.

## 14. Dados reais x demonstração
- Dados de demonstração devem ser explicitamente rotulados e isolados.
- Produção e homologação não podem misturar valores inventados com indicadores reais.
- Dashboards (Overview, Analytics, Observability, LiveSupervisor) devem apresentar loading, empty, error e stale state de forma explícita.
- Nenhuma métrica de chamada, custo de IA ou telemetria de supervisão pode ser fabricada para "preencher" a interface — se o dado real ainda não existe, mostre estado vazio, nunca número inventado.

## 15. Tenancy

Separação visual não é prova de isolamento.

Toda leitura e escrita de dados sensíveis a tenant deve comprovar:
- origem do tenant (via `requireAuth`/`requireTenant`, nunca confiado de payload do cliente);
- filtro por `tenantId` aplicado no repository, não "lembrado" no controller/UI;
- autorização (`requireRole`) coerente com a ação;
- testes de acesso cruzado (ver `__tests__/tenant-isolation.test.ts` como base já existente — estenda, não recrie);
- comportamento de fallback seguro (403/404 uniforme, sem vazar se o recurso existe em outro tenant).

## 16. LGPD e dados pessoais

A plataforma processa dados pessoais reais: contatos, gravações de voz, transcrições de chamada, e leads recebidos via integração com o AtlasGR. A Lei Geral de Proteção de Dados (Lei 13.709/2018) se aplica integralmente, mesmo em ambiente de homologação com dados reais.

Regra geral, válida para todos os agentes:
- nunca armazenar mais dado pessoal do que o necessário para a finalidade declarada (minimização);
- nunca criar novo destino de armazenamento/replicação de dado pessoal (cache não governado, log persistente, exportação paralela) sem que ele herde as mesmas proteções de tenant, retenção e auditoria da origem;
- todo dado pessoal deve ser rastreável a uma origem e, quando obtido por integração externa (AtlasGR/Bland AI), à base legal e ao fornecedor.

Responsabilidade por domínio:
- **01** garante controle de acesso, hashing/criptografia de credenciais e mecanismo técnico de exclusão/anonimização de dado pessoal mediante solicitação de titular.
- **04** garante que dado pessoal enviado a provedores de IA externos (OpenAI/Anthropic/Gemini/ElevenLabs) via `LLMGateway` só ocorre com consentimento explícito registrado e nunca mistura tenants no contexto enviado ao modelo.
- **05** garante que gravações de chamada e `CallLog` tenham controle de acesso, retenção definida e caminho de exclusão; garante que o request-signature validation do Twilio realmente barra requisição forjada.
- **06** garante que a integração AtlasGR/Bland AI não duplique dado pessoal fora do tenant de origem e que uploads processados por antivírus/object storage não vazem entre organizações.
- **08** garante, na checklist de release, que existe caminho operacional para atender solicitação de titular (acesso, correção, exclusão) e que isso está documentado.
- **12** garante que dado de pagamento tenha o mesmo nível de controle de acesso que dado de contato, que nenhum número de cartão/PAN seja armazenado em texto claro (tokenização via gateway de pagamento, nunca dado bruto na base própria), e que o sistema de notificações não vaze evento/dado de um tenant para o e-mail/webhook de outro.

Nenhum agente deve tratar este tema como "fora de escopo" — cada um trata a fatia que lhe cabe dentro da própria missão de onda.

## 17. Gate obrigatório por onda
```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Quando aplicável ao domínio da onda:
```bash
npm run test:e2e
npm run test:contracts
npm run test:infrastructure
```

Ver seção "Scripts ausentes" para o caso de script não existir.

Não marcar teste como "aprovado" se não foi executado. Corrigir ambiente/teste até conseguir evidência, salvo dependência externa impossível de provisionar localmente (ex.: Keycloak/MinIO/ClamAV via `docker-compose.opensource.yml` indisponível no ambiente do agente). Nesse caso, o coordenador deve registrar o bloqueio como impeditivo de release, nunca como sucesso.

## 18. Definição global de pronto
Uma tarefa só está concluída quando:
- causa raiz foi tratada;
- não existe fallback enganoso;
- erros relevantes ficam visíveis/observáveis (logs `pino`, spans OpenTelemetry, ou ambos onde já existe instrumentação);
- testes cobrem caminho feliz e falha;
- typecheck, lint e build permanecem verdes;
- Clean Architecture (Controller → Service → Repository) foi respeitada, sem novo `any`;
- documentação afetada (`docs/**`, `API_REFERENCE.md`, `ARCHITECTURE.md`) foi atualizada quando o comportamento documentado mudou;
- nenhuma regressão de segurança/tenancy foi introduzida;
- nenhuma obrigação de LGPD conhecida foi ignorada dentro do escopo do agente;
- o agente fornece arquivos alterados, comandos executados e resultados.

## 19. Proibição de "auditoria sem correção"
Encontrou problema corrigível? Corrija agora dentro do escopo.

Backlog só é aceitável para dependências externas, decisões de negócio ou mudanças que exigem dono diferente. Mesmo nesses casos, produzir handoff acionável.

## 20. Débito técnico conhecido
Antes de "descobrir" um problema, confira se ele já está documentado em `TECHNICAL-DEBT-CHECKLIST.html` (raiz do repositório) — inclui, por exemplo, avisos residuais de lint com `any` em mocks de teste. Não reabra o mesmo achado como novo; atualize/resolva o item existente.
