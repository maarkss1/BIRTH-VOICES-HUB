- De: Agente 08 (QA, Testes e Segurança)
- Para: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Onda: 3
- Status: aberto
- Prioridade: normal

## Problema

Ao validar o checklist de "release readiness" da Onda 3 (`.agents/prompts/08-qa-seguranca.md`,
item 4), `DEPLOYMENT.md` não tem nenhuma seção de rollback. Confirmado:

```bash
grep -in "rollback" DEPLOYMENT.md
# (sem resultado)
```

O arquivo documenta build/deploy (Docker, GitHub Actions, GCP/Cloud Run, secrets obrigatórios),
mas nenhum passo a passo executável para reverter um deploy ruim — nem para o serviço Cloud Run em
si, nem para uma migração de banco que o release tenha aplicado (`prisma migrate deploy` roda como
step separado em `.github/workflows/deploy.yml` antes do deploy da imagem, então uma migração
destrutiva já aplicada não é revertida automaticamente por um rollback de imagem).

Não é um bloqueador de segurança/tenancy da lista de `AGENTS.md` §9, mas `AGENTS.md`/`TESTING.md`
tratam rollback documentado como parte do gate de release readiness, e hoje a única opção
disponível a um operador em incidente é "reverter o deploy" sem nenhum procedimento escrito —
exatamente o que o item 4 do meu prompt pede para não aceitar.

## Arquivo(s) envolvido(s)
- `DEPLOYMENT.md` (não está na lista de propriedade exclusiva de nenhum agente em `AGENTS.md` §11,
  mas o domínio — deploy/Cloud Run/CI — é do Agente 10; não editei por ser fora do meu domínio de
  conteúdo, não por proibição literal de arquivo)
- Referência: `.github/workflows/deploy.yml` (step "Deploy tested image to Cloud Run")

## Alteração necessária
Adicionar a `DEPLOYMENT.md` uma seção "Rollback" com passo a passo executável cobrindo pelo menos:
1. Como reverter o Cloud Run para a revisão anterior (`gcloud run services update-traffic` ou
   equivalente), incluindo onde encontrar o SHA/tag da imagem anterior no Artifact Registry.
2. O que fazer quando o release incluiu uma migração Prisma não seguramente reversível (`prisma
   migrate deploy` já rodou contra produção antes do deploy da imagem) — decisão explícita sobre
   se o rollback de imagem é seguro sozinho ou se exige uma migração de compensação.
3. Quem/o quê verifica que o rollback teve sucesso (healthcheck, versão exposta em `/api/health`
   ou similar).

## Teste esperado
Não há teste automatizado aplicável (é documentação operacional). Validação: um operador
seguindo os passos documentados consegue reverter um deploy sem precisar adivinhar comandos do
`gcloud` na hora do incidente.

## Contexto adicional
Achado feito durante a validação de release readiness da Onda 3; não bloqueia a decisão desta
onda (não está na lista de bloqueadores prioritários de `AGENTS.md` §9), mas fica registrado como
item aberto no `docs/release/PRODUCTION-READINESS.md`.
