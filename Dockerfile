# --- Stage 1: Build & Compile ---
FROM node:22-alpine AS builder
WORKDIR /app

# openssl is required so Prisma's platform detection can correctly identify OpenSSL 3.x
# on modern Alpine and select the matching linux-musl-openssl-3.0.x query engine.
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# Copy only the main application. Experimental workspaces are deliberately not part of the
# production build context consumed below.
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

RUN npx prisma generate
RUN npm run build

# --- Stage 2: Production Dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma/ ./prisma/
# The root package is the Cloud Run application. packages/sip-agent is an explicitly isolated POC
# and must not pull LiveKit/Silero dependencies into the production image.
RUN npm ci --omit=dev --workspaces=false
RUN npx prisma generate

# --- Stage 3: Runner ---
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY prisma/ ./prisma/

RUN chown -R expressjs:nodejs /app
USER expressjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npm", "start"]
