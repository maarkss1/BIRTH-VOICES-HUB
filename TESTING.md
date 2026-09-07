# Testing Strategy

O Birth Voices Hub usa **Vitest** para testes unitários/integrados e **Playwright** para smoke/E2E do artefato compilado. Um release não é considerado validado apenas porque o TypeScript compila ou porque a suíte unitária passa.

## Gate de CI

O workflow oficial executa, nesta ordem:

```text
Prisma migrate → seed → lint → typecheck → Vitest → build → Playwright/Chromium → Docker build
```

Se qualquer etapa falhar, o commit não deve ser promovido para produção.

## Pirâmide de testes

### 1. Unitários e integração leve

Arquivos em `__tests__/` e testes próximos aos módulos (`src/**/*.test.ts`) cobrem funções, serviços, controllers, middleware, RBAC, consentimento, telefonia, workflows e integrações externas com dependências mockadas quando apropriado.

```bash
npm run test
```

Watch mode:

```bash
npm run test -- --watch
```

Ao escrever testes de serviço, prefira mockar **repository/provider boundaries**, não a lógica que está sendo validada. Testes que pretendem provar persistência real devem usar o banco de teste e migrations.

### 2. Build

```bash
npm run build
```

O build precisa passar antes do E2E. O Playwright serve o conteúdo de `dist/`, portanto um smoke verde prova o artefato que realmente será empacotado, não uma tela do Vite dev server.

### 3. Browser/E2E com Playwright

```bash
npm run test:e2e
```

A configuração inicia `npm run start` com:

```text
NODE_ENV=e2e
SERVE_STATIC_BUILD=true
```

`SERVE_STATIC_BUILD=true` faz o Express servir o `dist/` compilado. `NODE_ENV=e2e` é intencional: o origin local do teste é `http://127.0.0.1:3000`, e navegadores corretamente recusam reenviar cookies marcados `Secure` por HTTP.

**Não adicione uma variável para desligar cookies `Secure` em produção só para fazer E2E local passar.** No Cloud Run o processo continua com `NODE_ENV=production`, portanto os cookies de autenticação permanecem `Secure`, `HttpOnly` e `SameSite=Strict`.

## Cenários E2E mínimos

A suíte em `e2e/` cobre, contra o build compilado real (não contra mocks), no mínimo:

- `GET /api/health`;
- carregamento da landing page do build;
- registro de um tenant novo (`auth.spec.ts`);
- criação de sessão autenticada via cookie;
- `GET /api/auth/me` como fonte de verdade da sessão;
- logout e rejeição subsequente com `401`;
- login novamente no mesmo tenant;
- RBAC admin (`rbac.spec.ts`): um usuário não-admin do mesmo tenant recebe `403` ao chamar uma
  rota `requireRole(['admin'])` (`GET`/`POST /api/users`) — prova bloqueador #1 de `AGENTS.md` no
  roteamento real, não só no middleware isolado;
- isolamento de tenant (`tenant-isolation.spec.ts`): um usuário do tenant A nunca lê nem lista um
  agente criado no tenant B (`404` no lookup direto, ausente da listagem) — prova bloqueador #2;
- webhook AtlasGR (`atlasgr-webhook.spec.ts`): a rota `/api/webhook/atlasgr/outbound` é alcançável
  sem header `Origin` (nunca cai no erro de CSRF) e exige sua própria autenticação por segredo
  compartilhado, falha fechada quando o segredo não está configurado — prova bloqueadores #3 e #5;
- Studio/publish gate (`workflow-publish.spec.ts`): um workflow sem nó `start` é recusado no
  publish real (`422`, permanece `draft`); um workflow válido (`start -> end`) é publicado
  (`active`); uma edição estrutural subsequente rebaixa o workflow de volta a `draft` — prova
  bloqueador #13.

O teste de autenticação usa e-mail único por execução para não depender de limpeza manual da base
efêmera do CI.

### Login/registro tem rate limiting real (10 req/60s por IP)

`server.ts` aplica um limite Redis-backed de 10 requisições/60s por IP sobre
`/api/auth/login`+`/api/auth/register` juntos (ver `SECURITY.md`). A suíte inteira de `e2e/` soma
hoje ~7 chamadas a essas duas rotas por execução — folga real, mas não generosa. Ao adicionar um
novo spec que registra/loga múltiplos usuários, conte quantas chamadas a `/api/auth/login` ou
`/api/auth/register` ele soma ao total da suíte antes de assumir que "mais um `register()`" é de
graça; um `retries` de CI que dispara em cascata sobre vários specs no mesmo minuto também consome
esse mesmo orçamento. Rodar `npm run test:e2e` várias vezes em sequência rápida localmente pode
esgotar a janela e produzir `429` que não é uma regressão do código — é o rate limiter fazendo
exatamente o que `SECURITY.md` documenta; espere a janela de 60s resetar antes de re-executar.

### Chromium do Playwright em sandbox sem acesso a `cdn.playwright.dev`/Docker Hub

Em um ambiente cujo egress bloqueia `cdn.playwright.dev` (download do browser) e
`production.cloudfront.docker.com` (imagens Docker Hub para `test:infrastructure`/
`security:trivy`), `npx playwright install` falha. Se o sandbox já tiver um Chromium do Playwright
pré-cacheado em outro caminho (revisão diferente da que o `playwright-core` instalado espera),
aponte `playwright.config.ts` para ele via a variável opcional `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
(ver comentário no arquivo) — isso nunca altera o comportamento de CI/produção, que não define essa
variável e continua baixando o browser gerenciado normalmente pelo Playwright.

## Banco e serviços no CI

O GitHub Actions sobe PostgreSQL e Redis efêmeros, executa `prisma migrate deploy` e seed antes dos testes. O E2E herda essas conexões do job.

Localmente, mantenha PostgreSQL/Redis disponíveis e a base migrada antes de executar testes que dependem de persistência.

## Falhas de E2E

Em CI, falhas do Playwright geram `playwright-report` como artifact. Antes de alterar o produto ou enfraquecer um controle de segurança, abra o relatório/trace e identifique:

1. request e status que falharam;
2. cookies/headers efetivamente enviados;
3. resposta do backend;
4. console/browser errors;
5. se o erro é de produção ou somente do ambiente local de teste.

A correção deve preservar as invariantes de produção. Um teste verde obtido desativando assinatura, consentimento, tenancy, CSRF, cookies seguros ou idempotência é uma regressão, não uma correção.