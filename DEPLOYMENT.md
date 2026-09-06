# Deployment Guide

Birth Voices Hub is containerized and designed for deployment on Google Cloud Platform (GCP) via Cloud Run, but can be deployed to any Docker-compatible environment.

## Docker Deployment

The application is packaged using a multi-stage `Dockerfile`.

### Building the Image
```bash
docker build -t birth-voices-hub:latest .
```

### Running the Image
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/db" \
  -e REDIS_URL="redis://host:6379" \
  -e JWT_SECRET="your-secret" \
  -e REFRESH_TOKEN_SECRET="your-refresh-secret" \
  -e ALLOWED_ORIGINS="https://your-production-domain.com" \
  birth-voices-hub:latest
```
`JWT_SECRET` and `REFRESH_TOKEN_SECRET` are both required — the server throws on the
first auth operation if either is unset (`src/lib/auth-tokens.ts#requireSecret`).

## CI/CD Pipeline (GitHub Actions)

We use GitHub Actions for continuous integration and continuous deployment.

### Workflow Steps
1. **Setup**: Checkout code, setup Node.js.
2. **Install**: Install npm dependencies and cache them.
3. **Validate**: Run linting (`eslint`) and typechecking (`tsc`).
4. **Test**: Run the Vitest test suite.
5. **Build**: Generate the Prisma client and build the application (`npm run build`).
6. **Docker Build & Push**: Build the Docker image and push to Google Artifact Registry.
7. **Deploy**: Deploy the new image to Google Cloud Run.

## Google Cloud Platform (GCP) Setup

### Secrets Management
The following secrets must be configured in your GitHub Repository (Settings →
Secrets and variables → Actions):
- `GCP_PROJECT_ID`: Your Google Cloud Project ID.
- `GCP_SA_KEY` (or `GCP_CREDENTIALS` as a fallback): JSON key for a Service Account with permissions to push to Artifact Registry and deploy to Cloud Run.
- `PRODUCTION_DATABASE_URL`: Connection string for your production PostgreSQL instance (e.g., Cloud SQL).
- `PRODUCTION_REDIS_URL`: Connection string for your production Redis instance (e.g., Memorystore).
- `JWT_SECRET`: Secure random string for access-token signing.
- `REFRESH_TOKEN_SECRET`: Secure random string for refresh-token signing — **required**, deploy fails validation without it (same requirement as `JWT_SECRET`, easy to miss since it's a separate secret).
- `GEMINI_API_KEY`: API key for Google Gemini integration.
- `PRODUCTION_ALLOWED_ORIGINS` (recommended): comma-separated list of allowed CORS/Socket.IO origins for production. Without it, the app falls back to `http://localhost:$PORT`, which will reject requests from your real production frontend domain.

`deploy.yml` validates all of the above (except the optional `PRODUCTION_ALLOWED_ORIGINS`) are present before attempting to authenticate to GCP, and fails with a clear error naming whichever are missing.

### Infrastructure Dependencies
Ensure the following are provisioned in GCP before deployment:
1. **Cloud SQL for PostgreSQL**: Managed relational database.
2. **Memorystore for Redis**: Managed in-memory data store for caching and BullMQ.
3. **Artifact Registry**: Docker repository for storing built images.
4. **Cloud Run**: Serverless compute platform to host the application container.

### Health Checks (container vs. Cloud Run)

The `Dockerfile`'s `HEALTHCHECK` (`GET /health`) only matters for local/Docker-Compose usage —
Cloud Run does not read or honor the Dockerfile `HEALTHCHECK` instruction at all. `deploy.yml`
configures Cloud Run's own probes explicitly (via `google-github-actions/deploy-cloudrun`'s `flags`
input) so a new revision is judged healthy by the same logic the app itself exposes, not by a bare
TCP connect on `$PORT`:
- **Startup probe** → `GET /ready` (`src/controllers/health.controller.ts`): runs `SELECT 1` against
  Postgres and `PING`s Redis for real. A revision only starts receiving traffic once both are
  reachable.
- **Liveness probe** → `GET /health`: a cheap "process is alive" check, deliberately *not* tied to
  the database/Redis, so a transient dependency blip doesn't cause Cloud Run to kill and restart an
  otherwise-healthy instance.

## Rollback

`deploy.yml` builds an **immutable, SHA-tagged image**
(`${GAR_LOCATION}/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:<git-sha>`) for every deploy and never
reuses or overwrites a tag. That means every previously deployed commit still has its exact image
sitting in Artifact Registry, which is what makes an image rollback possible without rebuilding
anything.

### 1. Roll the Cloud Run service back to a previous revision

Cloud Run keeps every revision it has ever deployed (unless it was explicitly deleted). The fastest
rollback — no rebuild, no re-push, traffic moves in seconds — is to shift traffic back to the last
known-good revision:

```bash
# 1. List revisions for the service, newest first, to find the last good one.
gcloud run revisions list \
  --service=birthvoices-app \
  --region=us-central1 \
  --project="$GCP_PROJECT_ID" \
  --format="table(metadata.name, status.conditions[0].status, metadata.creationTimestamp)"

# 2. Move 100% of traffic to that revision by name (e.g. birthvoices-app-00042-abc).
gcloud run services update-traffic birthvoices-app \
  --region=us-central1 \
  --project="$GCP_PROJECT_ID" \
  --to-revisions=birthvoices-app-00042-abc=100
```

If you don't have the revision name handy but know which commit SHA was last good, you can instead
redeploy that exact image directly (equivalent effect, and confirms the image still exists in the
registry):

```bash
gcloud run deploy birthvoices-app \
  --region=us-central1 \
  --project="$GCP_PROJECT_ID" \
  --image="us-central1-docker.pkg.dev/${GCP_PROJECT_ID}/birthvoices-repo/birthvoices-app:<previous-good-sha>"
```

The previous good SHA can be found from the Actions run history of the "Deploy to Google Cloud Run"
workflow (`target_sha` input of the last successful run before the bad one), or by listing tags in
Artifact Registry:

```bash
gcloud artifacts docker tags list \
  us-central1-docker.pkg.dev/${GCP_PROJECT_ID}/birthvoices-repo/birthvoices-app \
  --project="$GCP_PROJECT_ID"
```

### 2. Database migrations — the part an image rollback does NOT undo

`deploy.yml` runs `prisma migrate deploy` against `PRODUCTION_DATABASE_URL` **before** the Cloud Run
traffic switch, using the new image. Rolling the *service* back to the previous revision does
**not** revert the schema — the database keeps whatever migrations were already applied. Decide
which case you're in before rolling back:

- **The release's migration(s) were purely additive** (new nullable column, new table, new index,
  new enum value that nothing yet reads/writes) — rolling back the image alone is safe. The old
  code simply ignores the new schema elements.
- **The release's migration(s) were destructive or renamed/dropped something the old code still
  reads/writes** (column rename/drop, `NOT NULL` added without a backfill, type change) — an image
  rollback alone will crash or corrupt data, because the old code expects the old shape that no
  longer exists. In this case:
  1. Do **not** roll back the image yet.
  2. Write and apply a compensating migration that restores the shape the old code needs (e.g. a
     new migration that re-adds the dropped/renamed column, backfilled from whatever replaced it).
  3. Only then roll back the image (or fix forward, which is almost always preferable to a schema
     rollback in a system with live production data).
  4. If unsure which case applies, treat it as destructive — the safe default is to fix forward
     (patch the bug, deploy again) rather than fight the schema backwards. Rolling back
     `prisma/schema.prisma`/migrations is Agente 01's domain — open a handoff before touching
     migration files if you're not Agente 01.

There is intentionally no automated "undo migration" step in `deploy.yml` — Prisma migrations are
not reliably auto-reversible, and a wrong automatic down-migration against real tenant data is
worse than a documented manual decision point.

### 3. Verify the rollback actually worked

After moving traffic (step 1) — and, if applicable, after any compensating migration (step 2) —
confirm the service is actually healthy on the reverted revision before considering the incident
resolved:

```bash
# Cloud Run gives you the service URL directly.
SERVICE_URL="$(gcloud run services describe birthvoices-app \
  --region=us-central1 --project="$GCP_PROJECT_ID" --format='value(status.url)')"

curl -fsS "$SERVICE_URL/health"   # liveness — expect HTTP 200 {"status":"ok"}
curl -fsS "$SERVICE_URL/ready"    # readiness — expect HTTP 200 {"status":"ready","checks":{"database":"ok","redis":"ok"}}
```

`/ready` (`src/controllers/health.controller.ts`) actually queries Postgres (`SELECT 1`) and pings
Redis, so a `200` there is real evidence the reverted revision can reach both dependencies — not
just that the process started. Also check:

- `gcloud run services describe birthvoices-app --region=us-central1 --format='value(status.traffic)'`
  shows 100% of traffic on the target revision (no split left over from a partial rollout).
- Application logs (Cloud Logging, or Grafana/Loki once `infrastructure/observability/**` is
  deployed alongside the app) show no new error spike after the switch.
