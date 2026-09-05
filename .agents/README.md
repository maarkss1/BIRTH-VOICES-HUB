# Sistema de Agentes — BIRTH-VOICES-HUB

## Racional do corte de domínios

Este roster não é uma cópia de outro projeto — foi definido a partir da estrutura real deste
repositório (Clean Architecture Controller→Service→Repository, motor de voz próprio em
`lib/voice-runtime/`, telefonia Twilio real, Studio de workflows via `@xyflow/react`, integração
de produção com o CRM AtlasGR, multi-tenancy por `tenantId` em quase todo modelo Prisma, deploy em
Cloud Run com Keycloak/observabilidade via `docker-compose.opensource.yml`).

A Onda 1 prioriza **01 (Plataforma/Segurança/Tenancy)**, **05 (Telefonia/Webhooks)** e
**06 (Integrações Externas)** — não "Produto/UX" como em outros projetos — porque esta plataforma
já processa chamadas reais via Twilio e já tem um webhook de produção consumido pelo AtlasGR
(`/api/webhook/atlasgr/outbound`). Um bug de tenancy ou de validação de webhook aqui tem impacto
direto em dado pessoal e pode disparar uma ligação real para um lead errado — isso pesa mais do que
polir navegação antes da fundação estar sólida.

## Arquivos
- `prompts/00-coordenador.md`
- `prompts/01-plataforma-seguranca-dados.md`
- `prompts/02-produto-ux.md`
- `prompts/03-design-a11y.md`
- `prompts/04-voice-runtime-ia.md`
- `prompts/05-telefonia-webhooks.md`
- `prompts/06-integracoes-externas.md`
- `prompts/07-studio-workflows.md`
- `prompts/08-qa-seguranca.md`
- `prompts/09-sdk-contratos-docs.md`
- `prompts/10-infraestrutura-observabilidade.md`
- `prompts/11-supervisao-tempo-real.md`
- `prompts/12-growth-billing-monetizacao.md` — roadmap pós-release (Fase 6 de `ROADMAP.md`), não faz parte das Ondas 1-4
- `COMO-CHAMAR-OS-AGENTES.md` — prompts prontos para colar, um por agente, para abrir a sessão correspondente em qualquer ferramenta de agente de código

## Pastas de execução (criadas em runtime, não versionadas com conteúdo sensível)
- `runs/` — relatórios de onda do Coordenador (`onda-1.md`, `onda-2.md`, `onda-3.md`, `onda-4.md`, `baseline.md`). Somente o Coordenador escreve aqui.
- `handoffs/onda-<n>/` — um arquivo por handoff, formato definido em `/AGENTS.md` → "Protocolo de handoff". Qualquer agente cria o próprio arquivo.

## Como executar
1. Inicie o agente 00.
2. Dê ao coordenador acesso ao repositório completo.
3. Ele deve ler `/AGENTS.md` e `/EXECUCAO-ONDAS.md`.
4. Ele cria a branch de integração da onda e um `git worktree` por especialista ativo (ver `/AGENTS.md` → "Isolamento de execução").
5. Execute no máximo 3 especialistas simultâneos, cada um no próprio worktree.
6. Siga `EXECUCAO-ONDAS.md`, incluindo a Onda 4 (09 SDK/Contratos, 10 Infraestrutura/Observabilidade, 11 Supervisão em Tempo Real) quando aplicável.
7. Não pule gates de typecheck/lint/test/build (e e2e/contracts/infrastructure quando aplicável).
8. Não aceite "auditoria concluída" quando existe correção executável.
9. Revise handoffs abertos em `.agents/handoffs/onda-<n>/` antes de aprovar a onda.

## Observação
`/AGENTS.md` (a raiz) já define regras gerais de código, segurança e LGPD específicas do projeto —
os prompts de especialista aqui complementam esse arquivo, nunca o substituem. Nenhum agente edita
os arquivos em `prompts/` — ajuste de prompt é decisão humana fora do ciclo de execução.
