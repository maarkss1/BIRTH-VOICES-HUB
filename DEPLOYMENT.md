# Deployment Guide

Birth Voices Hub is containerized and the supported production path is **Google Cloud Run**. Other Docker-compatible targets are possible, but they are not part of the guarded GitHub production release flow documented here.

## Docker

Build locally:

```bash
docker build -t birth-voices-hub:local .
```

Run only with a complete environment. Do not copy development placeholders into production.

## Release model

CI and deploy are intentionally separated.

### CI/CD Pipeline

Every PR/push covered by `.github/workflows/ci.yml` runs:

1. PostgreSQL + Redis ephemeral services;
2. `npm ci`;
3. `prisma generate`;
4. `prisma migrate deploy` against the ephemeral CI database;
5. seed;
6. lint;
7. TypeScript typecheck;
8. Vitest;
9. application build;
10. Playwright/Chromium smoke;
11. Docker build.

A green CI **does not automatically deploy**.

### Production Preflight (No Deploy)

Before a production release, run `.github/workflows/production-preflight.yml` manually against the exact SHA already merged to `main`.

It verifies without deployment:

- exact SHA has successful CI and belongs to `main`;
- production configuration passes `scripts/validate-production-config.mjs`;
- PostgreSQL connectivity;
- Redis `PING`;
- Twilio credentials via read-only account lookup;
- Gemini key via read-only model listing;
- Google Cloud project access;
- optional public `/api/health` probe.

No Docker image is pushed, no migration is applied and no Cloud Run revision is promoted.

### Production Deploy

Run `.github/workflows/deploy.yml` manually only after preflight + UAT.

Required inputs:

- `target_sha`: approved commit already on `main`;
- `confirm_production`: exactly `DEPLOY`;
- `reason`: meaningful audit reason.

The workflow then:

1. verifies explicit production intent;
2. verifies the SHA belongs to `main`;
3. verifies successful CI for the exact SHA;
4. revalidates the production configuration contract;
5. authenticates to GCP;
6. builds and pushes an immutable image tagged by SHA;
7. applies `prisma migrate deploy` to production;
8. deploys that same image to Cloud Run;
9. performs a required `/api/health` check against the deployed service URL.

## GitHub environment `production`

Production secrets and variables belong in **Settings → Secrets and variables → Actions → Environment secrets/variables**, not in repository files.

### Core secrets

- `GCP_PROJECT_ID`
- `GCP_SA_KEY` or `GCP_CREDENTIALS`
- `PRODUCTION_DATABASE_URL`
- `PRODUCTION_REDIS_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `GEMINI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `WEBHOOK_SIGNING_SECRET`

### Core variables

- `PUBLIC_BASE_URL`
- `ALLOWED_ORIGINS`

`PUBLIC_BASE_URL` must be the exact public HTTPS origin used by Twilio. `ALLOWED_ORIGINS` is the production CORS/Socket.IO allowlist. The legacy name `PRODUCTION_ALLOWED_ORIGINS` is **not** consumed by the current guarded deploy.

See [`docs/secrets-guide.md`](./docs/secrets-guide.md) for optional providers and AtlasGR/Bland configuration.

## GCP prerequisites

Provision before preflight/deploy:

1. PostgreSQL/Cloud SQL or another reachable production PostgreSQL;
2. production Redis/Memorystore or compatible Redis endpoint;
3. Artifact Registry repository expected by the workflow;
4. Cloud Run permissions for the deployment Service Account;
5. public HTTPS domain/origin that will be used consistently by Cloud Run/Twilio/CORS.

## Go-live and rollback

The authoritative operational sequence, UAT criteria and rollback rules are in [`docs/GO_LIVE_RUNBOOK.md`](./docs/GO_LIVE_RUNBOOK.md).
