- De: Agente 02 (Produto, Navegação e UX)
- Para: Agente 00 (Coordenador) — para atribuir dono definitivo
- Onda: 2
- Status: resolvido
- Prioridade: normal

## Problema
`pages/Dashboard/Billing.tsx` simulava um sistema de faturamento/créditos inteiro no
client-side: saldo em carteira incrementado em `useState` local (sem chamada de API),
mensagem de "recarga realizada com sucesso" fabricada, plano "Professional" fixo com data de
renovação `15/05/2024` (já expirada frente à data atual do sistema), e uma tabela de histórico
de uso com duas linhas de exemplo hardcoded. Não existe nenhum model Prisma de wallet/plano/
uso, nem rota `/api` para nenhum desses conceitos — confirmado via busca em
`prisma/schema.prisma` e `src/routes/index.ts`.

Isso viola a regra de "Dados reais x demonstração" do `AGENTS.md` (§14): a tela apresentava
estado financeiro fabricado como se fosse real.

## Correção já aplicada nesta onda (mitigação, não solução definitiva)
`pages/Dashboard/Billing.tsx` foi reescrito para rotular explicitamente a tela como
"Pré-visualização de layout", remover o saldo/plano/histórico fabricados (mostrando `—` /
estado vazio) e desabilitar as ações que não têm backend real por trás. Isso resolve o
problema de dado fabricado, mas a tela ainda não tem nenhuma funcionalidade real de
faturamento — só deixou de mentir sobre isso.

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Billing.tsx` (meu, já mitigado)
- Precisaria de: novo model Prisma (wallet/plano/uso), rotas/controller/service reais — fora do
  meu escopo de arquivos e fora do escopo desta onda (Produto/Navegação/UX).

## Alteração necessária
Decisão de produto + implementação de backend real de billing (dono a definir — candidatos:
Agente 01 pela superfície de schema/segurança, ou um agente futuro dedicado a
billing/pagamentos). Requisitos mínimos quando for implementado: saldo real por tenant,
histórico de transações real, e integração de pagamento real (não simulação).

## Teste esperado
Uma vez implementado o backend, `Billing.tsx` deve trocar os estados `—`/vazio por dado real
vindo de `/api/billing/*` (ou nome equivalente), com os mesmos estados de loading/erro/vazio já
padronizados nesta onda.

## Contexto adicional
Não é bloqueador de release — a tela antes mentia sobre estado financeiro, agora só admite que
a funcionalidade ainda não existe. Nenhum dado real de pagamento foi tocado ou exposto.

## Resolução

Dono definitivo atribuído nesta onda: **Agente 12 (Growth, Billing e Monetização de Uso)**,
especialista criado especificamente para este handoff e para `02-para-00-notificacoes-backend.md`
(ver `AGENTS.md` §4 e `ROADMAP.md` → "Fase 6"). Schema real (`Plan`/`Wallet`/`Transaction`, Agente
01) + `billingService.ts`/`billing.controller.ts`/`billing.routes.ts` reais (Agente 12) +
`Billing.tsx` conectado ao dado real, com `recordTransaction` idempotente por `idempotencyKey`
(constraint única, nunca duplica cobrança em redelivery). Integração de pagamento externo (Stripe
ou equivalente) e proração completa de troca de plano seguem como itens futuros, documentados como
limitação conhecida em `billingService.ts` — não bloqueiam o requisito mínimo deste handoff (saldo
real por tenant + histórico de transações real).
