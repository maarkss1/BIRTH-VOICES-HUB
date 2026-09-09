# Troubleshooting Guide

This guide addresses common issues encountered during development and deployment of Birth Voices Hub.

## Common Issues

### 1. Prisma Client Errors (`PrismaClientInitializationError` / `PrismaClientKnownRequestError`)
**Symptoms:** Cannot connect to database, "table does not exist" errors.
**Solutions:**
- Ensure the PostgreSQL Docker container is running (`docker-compose ps`).
- Verify `DATABASE_URL` in your `.env` file is correct.
- Ensure migrations have been applied: run `npx prisma migrate dev`.
- If schema changed recently, regenerate the client: `npx prisma generate`.

### 2. Redis Connection Issues
**Symptoms:** BullMQ errors, rate limiter failing, "ECONNREFUSED".
**Solutions:**
- Ensure the Redis Docker container is running.
- Verify `REDIS_URL` in `.env`. Default local is usually `redis://localhost:6379`.

### 3. Port Already in Use (EADDRINUSE)
**Symptoms:** Server fails to start, complaining about port 5001 or 5173.
**Solutions:**
- Kill the process using the port: `kill -9 $(lsof -t -i:5001)` (Linux/macOS).

### 4. TypeScript Errors on Build
**Symptoms:** `npm run build` fails with TS errors.
**Solutions:**
- Run `npm run typecheck` locally. Fix any strict typing issues. Do not use `@ts-ignore` as it violates project standards. Ensure all imports have the `.js` extension if using ES Modules natively.

### 5. Multi-Tenancy Data Leaks (Missing Tenant ID)
**Symptoms:** Seeing data that belongs to another tenant, or queries failing with missing relations.
**Solutions:**
- Ensure you are calling `req.user.tenantId` in the controller and passing it down to the service and repository layers.
- Check the Prisma schema to ensure the model has a `tenantId` field and relation.

### 6. `npx playwright install` fails to download Chromium (sandbox with restricted egress)
**Symptoms:** `npx playwright install --with-deps chromium` fails with a `403`/blocked-host error
against `cdn.playwright.dev`; `npm run test:e2e` then fails with "Executable doesn't exist".
**Solutions:**
- This is a network policy limitation of the sandbox, not a code defect — do not disable browser
  verification or skip the gate silently (see `AGENTS.md` §17).
- Check whether the environment already has a Playwright-managed Chromium cached at another path
  (e.g. `/opt/pw-browsers` in some managed sandboxes, or check `PLAYWRIGHT_BROWSERS_PATH`) with
  `npx playwright test --list` — a full (non-headless-shell) Chromium binary at a mismatched
  revision can usually still run in headed-launch mode.
- If found, point `playwright.config.ts`'s optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` env var at the
  full Chromium binary (not the `chrome-headless-shell` variant, which is versioned separately and
  is what actually fails to launch on a revision mismatch): `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome npm run test:e2e`.
  This never changes CI/production behavior — that env var is unset there, so Playwright keeps
  downloading and using its own managed browser normally.
- If no cached browser exists anywhere reachable, `test:e2e` cannot be executed in that sandbox at
  all; register it as an environment limitation in the run's evidence (never as a silent pass) and
  let a real CI run (which has normal internet access) be the actual gate for that commit.

### 7. `npm run test:infrastructure` / `npm run security:trivy` fail to pull Docker images
**Symptoms:** `testcontainers` or the Trivy `docker-compose` service fail with a `403 Forbidden`
against `production.cloudfront.docker.com` (Docker Hub's blob CDN) even though `docker pull`
otherwise works and the daemon starts fine.
**Solutions:**
- Same class of issue as #6: an organization's egress policy can allow the Docker Hub registry API
  but block the CDN host it redirects blob downloads to, so every image pull fails regardless of
  which image is requested. This is an environment limitation, not a broken test or a regression —
  do not mark the gate as passed; register it as not executable in that environment (`AGENTS.md`
  §17: "o coordenador deve registrar o bloqueio como impeditivo de release, nunca como sucesso").
- Confirm before spending more time debugging the test itself: `docker pull hello-world` (or any
  small public image) from the same shell — if that also gets a `403` from a CDN host, it's the
  environment's network policy, not the project's Docker Compose config.