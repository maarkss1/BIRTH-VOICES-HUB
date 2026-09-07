- De: Agente 00 (Coordenador)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 1
- Status: resolvido
- Prioridade: normal

## Problema

Ao resolver `.agents/handoffs/onda-1/06-para-00-csrf-bloqueia-webhooks-servidor-servidor.md`
(commit `e9a80e2` em `integracao/onda-1`), alterei `src/middlewares/index.ts` (`csrfProtection`)
para pular a checagem de `Origin` em requisições autenticadas por `Authorization: Bearer ...`, e
`server.ts`/`src/routes/index.ts` para montar `atlasgrRoutes` antes de `csrfProtection` (mesmo
padrão do `telephonyRoutes`). Não escrevi teste automatizado para isso — `__tests__/**` é
propriedade exclusiva sua, e o usuário confirmou explicitamente que eu não deveria escrever nela.

## Arquivo(s) envolvido(s)

- `src/middlewares/index.ts` (`csrfProtection`) — exceção Bearer, linhas adicionadas logo no início
  do bloco `if (['POST', 'PUT', 'DELETE'].includes(req.method))`.
- `server.ts` — `atlasgrRoutes` montado antes de `app.use(csrfProtection)`.
- `src/routes/index.ts` — `atlasgrRoutes` removido do agregador `apiRoutes`.

## Alteração necessária

Adicionar cobertura de teste (local sugerido: novo arquivo `__tests__/csrfProtection.test.ts`,
não existe hoje) cobrindo:
1. `csrfProtection` unitário: rejeita `POST` sem `Origin` e sem `Bearer` em produção (403); permite
   `POST` com `Authorization: Bearer ...` e sem `Origin` mesmo em produção; continua rejeitando
   `Origin` divergente de `Host` em produção; continua permitindo `Origin` == `Host`.
2. Integração via `appPromise`/`supertest`: `POST /api/webhook/atlasgr/outbound` sem header
   `Origin` nunca retorna a mensagem de erro de CSRF (`Validação de origem de segurança (CSRF)
   falhou.`), com ou sem `Origin` presente — confirma que a rota está de fato alcançável antes do
   middleware, não só que a função isolada se comporta bem.

## Teste esperado

Ver item acima — os 4 casos unitários + o caso de integração da rota AtlasGR.

## Contexto adicional

Rascunho de teste que cheguei a escrever (e depois descartei, sem commitar, por não ser meu
arquivo) segue abaixo como ponto de partida, não como exigência de formato:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { csrfProtection } from '../src/middlewares/index.js';
import { appPromise } from '../server.js';

function mockReqRes(headers: Record<string, string> = {}) {
  const req = { method: 'POST', headers } as unknown as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('csrfProtection', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  it('rejects a mutating request with no Origin and no Bearer token in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes();
    csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a Bearer-authenticated mutating request with no Origin, even in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes({ authorization: 'Bearer some.jwt.token' });
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('AtlasGR webhook is reachable without an Origin header', () => {
  it('never returns the CSRF rejection', async () => {
    const app: Express = await appPromise;
    const res = await request(app).post('/api/webhook/atlasgr/outbound').send({});
    expect(res.status).not.toBe(403);
    expect(res.body?.error).not.toMatch(/Validação de origem/i);
  });
});
```

## Resolução

Onda 3, Agente 08. Criado `__tests__/csrfProtection.test.ts` cobrindo os 4 casos unitários pedidos
(rejeita mutação sem Origin/sem Bearer em produção; permite Bearer sem Origin em produção; rejeita
Origin divergente de Host em produção; permite Origin == Host) mais um quinto caso (métodos não
mutantes como GET nunca são tocados pelo middleware), e o caso de integração via
`appPromise`/`supertest`: `POST /api/webhook/atlasgr/outbound` nunca retorna a mensagem de erro de
CSRF, com ou sem `Origin` presente (a rejeição observada é a de autenticação do webhook — segredo
ausente —, não a de CSRF, confirmando que a rota está de fato alcançável antes do middleware).
6/6 testes verdes (`npx vitest run __tests__/csrfProtection.test.ts`); typecheck e lint limpos.
