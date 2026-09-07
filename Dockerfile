# --- Stage 1: Build & Compile ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies and build tools
# openssl is required so Prisma's platform detection can correctly identify the OpenSSL 3.x
# available on modern Alpine and select the matching linux-musl-openssl-3.0.x query engine —
# without it, detection silently falls back to an OpenSSL 1.1 engine that fails to load at runtime.
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and configurations
COPY tsconfig.json vite.config.ts ./
COPY src/ ./src/
COPY lib/ ./lib/
COPY components/ ./components/
COPY hooks/ ./hooks/
COPY pages/ ./pages/
COPY store/ ./store/
COPY data/ ./data/
COPY index.html index.css App.tsx index.tsx server.ts ./
COPY prisma/ ./prisma/

# Generate Prisma Client & Build the application
RUN npx prisma generate
RUN npm run build

# --- Stage 2: Production Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma/ ./prisma/
RUN npm ci --omit=dev
RUN npx prisma generate

# --- Stage 3: Runner ---
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

# Copy artifacts from builder and deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Add Prisma schema for runtime commands if necessary
COPY prisma/ ./prisma/

# Set ownership
RUN chown -R expressjs:nodejs /app

USER expressjs

EXPOSE 3000

# Basic healthcheck on app port. Cloud Run does not read this directive at all — it has its own
# YAML-configured startup/liveness probes (see .github/workflows/deploy.yml) — so this only serves
# local `docker run`/`docker inspect` consumers (e.g. the CI "Docker Build Artifact" smoke test).
# A 30s interval left that smoke test's 60s external polling loop only 1-2 chances to ever observe
# a passing check, so it reported "never became healthy" even after the app had already logged
# "Server running". A 5s interval gives ~10+ chances in the same window, converging to "healthy"
# as soon as the app is actually ready instead of racing a coarse polling cadence.
# 127.0.0.1, not "localhost": Alpine/musl can resolve "localhost" to ::1 (IPv6) first, and
# BusyBox wget does not fall back to IPv4 within a single invocation — every check then fails with
# connection-refused against a server that is only listening on 0.0.0.0/IPv4, even though the app
# is demonstrably up (confirmed via its own "Server running" log line seconds after container
# start). Pinning the literal IPv4 loopback address removes that ambiguity entirely.
HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start the application
CMD ["npm", "start"]
