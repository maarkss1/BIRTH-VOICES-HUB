- De: Agente 01 (Plataforma, Segurança, Tenancy e Dados)
- Para: Coordenador (00)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema
`.agents/handoffs/onda-2/02-para-09-api-key-backend.md` pedia duas coisas: (1) backend real de API
Keys e (2) "webhooks configuráveis por tenant" para substituir o endpoint de exemplo fixo que
`pages/Dashboard/Developers.tsx` mostrava na aba "Webhooks". A missão que me foi roteada (ver
`.agents/handoffs/onda-4/09-para-00-api-key-backend-fora-de-escopo.md` e o prompt de execução desta
onda) cobria explicitamente só "API Keys" — implementei a parte (1) por completo (ver
`## Resolução` em `02-para-09-api-key-backend.md`). A parte (2) permanece sem dono e sem
implementação.

Não implementei (2) por conta própria porque é um domínio novo com decisões de produto/segurança
que não foram pedidas nem definidas: schema de assinatura HMAC do payload (mesmo padrão de
`WEBHOOK_SIGNING_SECRET`/`x-birthvoices-signature` já usado para webhooks *emitidos* pela
plataforma, ou um segredo por-endpoint-configurado-pelo-tenant?), política de retry/backoff em
falha de entrega, limite de endpoints por tenant, e um novo model Prisma
(`TenantWebhookEndpoint` ou similar — schema owner sou eu, mas a forma depende de decisões que
ainda não foram tomadas). Implementar isso sem esse contrato definido seria inventar
comportamento não pedido (AGENTS.md §19 pede correção imediata de problemas *dentro do escopo*, não
expansão de escopo por conta própria para um domínio sem dono claro).

## Arquivo(s) envolvido(s)
- `pages/Dashboard/Developers.tsx`, `hooks/useDeveloperSettings.ts` (Agente 02) — aba "Webhooks"
  hoje com estado vazio real + botão "Simular envio de teste" (mitigação já aplicada na Onda 2,
  não fabrica mais dado, mas não persiste nada real).
- Precisaria de: novo model Prisma para endpoints de webhook por tenant (meu, `prisma/schema.prisma`,
  se/quando a forma for decidida), rotas/controller/service novos (dono a definir — mesmo padrão
  desta missão de API Keys: naturalmente Agente 01 por tocar autenticação/segredos, mas é uma
  atribuição explícita do Coordenador, não presumida por mim).

## Alteração necessária
O Coordenador precisa decidir: (a) atribuir esta implementação a um agente (candidato natural:
Agente 01, mesmo raciocínio usado para API Keys — mas confirmar explicitamente, não presumir) numa
próxima onda, definindo antes o contrato mínimo (esquema de assinatura, retry, limite por tenant);
ou (b) formalmente adiar para o roadmap pós-release (`ROADMAP.md`) se não for prioridade para o
release atual.

## Teste esperado
N/A neste handoff (coordenação/atribuição). Quando implementado: um endpoint de webhook cadastrado
por um tenant recebe uma entrega real e assinada quando o evento correspondente ocorre; endpoints
de um tenant nunca recebem eventos de outro tenant (mesmo requisito de isolamento de
`AGENTS.md` §15).

## Contexto adicional
Não bloqueador para o release atual — a aba "Webhooks" já não fabrica dado (mitigação da Onda 2
permanece válida). Registrado aqui só para o pedido original não ficar "perdido" quando
`02-para-09-api-key-backend.md` for lido como resolvido (a resolução cobre API Keys, não
Webhooks).
