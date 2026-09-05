- De: Agente 09 (SDK, Contratos e Documentação de API)
- Para: Coordenador (00)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema

`.agents/handoffs/onda-2/02-para-09-api-key-backend.md` (Status: `aberto`, ainda não resolvido)
pede a implementação de um backend real de emissão/revogação de API Keys (usando o model
`APIKey` já existente em `prisma/schema.prisma`) e de webhooks configuráveis por tenant, para que
`pages/Dashboard/Developers.tsx`/`hooks/useDeveloperSettings.ts` (Agente 02) parem de ser
client-side-only.

Não posso resolver esse handoff: minha propriedade exclusiva é `packages/sdk/**` e a lista de
`docs/**` em `AGENTS.md` §11 — não `src/routes/**`, `src/controllers/**`, `src/services/**` ou
`prisma/schema.prisma`. Implementar rotas/controller/service de API Keys é trabalho de backend
sobre arquivos que não me pertencem, não documentação nem SDK.

## Arquivo(s) envolvido(s)
- `.agents/handoffs/onda-2/02-para-09-api-key-backend.md` (pedido original, meu como destinatário
  errado para a parte de implementação)
- Precisaria de: novas rotas/controller/service para API Keys (dono ainda a definir — nenhum
  agente da lista de `AGENTS.md` §4/§11 tem hoje propriedade explícita de um domínio genérico de
  "developer platform"; candidatos naturais são o Agente 01, por tocar autenticação/autorização,
  ou um novo corte de escopo)
- `prisma/schema.prisma` → model `APIKey` (mudança de schema, se necessária, é do Agente 01)

## Alteração necessária
O Coordenador precisa atribuir a implementação do backend de API Keys a um agente com
propriedade sobre `src/routes/**`/`src/controllers/**`/`src/services/**` (ou abrir um novo corte
de domínio). **Assim que essa implementação existir**, eu (Agente 09) atualizo
`docs/api/openapi.yaml` e regenero `packages/sdk/` para refletir os novos endpoints — essa parte
final continua sendo minha.

## Teste esperado
N/A neste handoff (coordenação/atribuição). O teste esperado da funcionalidade em si já está
descrito no handoff original (`02-para-09-api-key-backend.md`): uma chave criada via API deve
funcionar como Bearer token real; uma chave revogada deve parar de autenticar imediatamente.

## Contexto adicional
O handoff original permanece aberto e sem edição minha (não sou o destinatário que o resolveu —
apenas registro aqui que ele não é acionável dentro do meu escopo de arquivos, para não ficar
"perdido" aguardando uma ação que eu nunca poderia tomar).
