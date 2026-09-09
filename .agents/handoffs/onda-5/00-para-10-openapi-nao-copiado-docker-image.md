- De: Agente 00 (Coordenador)
- Para: Agente 10 (Infraestrutura, Observabilidade e Deploy)
- Onda: 5
- Status: aberto
- Prioridade: normal (não bloqueador — falha silenciosa, não derruba o processo)

## Problema

Enquanto investigava a falha do smoke test "Docker Build Artifact" (CI) na PR #44, encontrei um
segundo problema real, pré-existente e não relacionado à causa raiz daquela falha (que era
`NODE_ENV=test` no `docker run` do smoke test, já corrigido separadamente): a imagem de produção
nunca inclui `docs/`, então `server.ts` falha ao carregar `docs/api/openapi.yaml` para o Swagger UI
em todo deploy real:

```
Error: ENOENT: no such file or directory, open '/app/docs/api/openapi.yaml'
    at startServer (/app/dist/server.cjs:...)
```

Isso é capturado (`try/catch` já existente em `server.ts` ao redor do `swaggerUi.setup(...)`) e
apenas logado como erro — não derruba o processo nem afeta `/health`/`/ready` — mas significa que
`/api-docs` (Swagger UI) está quebrado em todo container real hoje, silenciosamente.

## Arquivo(s) envolvido(s)

- `Dockerfile` (stage `runner`): copia `dist/`, `node_modules/`, `package.json`, `prisma/` — nunca
  `docs/`.
- `server.ts` (linhas ~177-183, meu arquivo — não vou alterar sozinho já que a correção real é no
  Dockerfile, fora do escopo de "server.ts approval" per se, mas registrando aqui em vez de
  corrigir unilateralmente para manter o diff da PR #44 focado apenas na causa raiz do CI red).

## Alteração necessária

Adicionar ao stage `runner` do `Dockerfile`, ao lado das outras linhas `COPY --from=builder`:

```dockerfile
COPY --from=builder /app/docs ./docs
```

(ou `COPY docs/ ./docs/` direto do contexto de build, já que `docs/` não muda entre stages).

## Teste esperado

Rebuild da imagem + rodar o container real (mesmo smoke test do CI) e confirmar que a mensagem de
erro "Failed to load openapi.yaml for Swagger UI" não aparece mais nos logs, e que
`GET /api-docs` retorna a UI do Swagger normalmente (hoje retorna algo quebrado/vazio, já que o
`swaggerDocument` nunca é montado).

## Contexto adicional

Não é bloqueador: nenhum endpoint funcional depende de `docs/api/openapi.yaml` estar presente no
runtime além do próprio `/api-docs`. `API_REFERENCE.md` já declara o OpenAPI como fonte de verdade
via SDK gerado, então o impacto prático de `/api-docs` estar fora do ar em produção é baixo, mas
vale corrigir já que o custo é uma linha no Dockerfile.
