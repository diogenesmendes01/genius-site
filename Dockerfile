# ─── Stage 1: Build ───────────────────────────────
# Debian slim instead of Alpine: better-sqlite3 ships prebuilt binaries for
# linux-x64-glibc on Node 20, so `npm ci` here downloads the precompiled
# `.node` artefact instead of invoking gcc/python. Build time drops from
# ~15min (Alpine, full native compile) to ~2min on a contended VPS.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Only needed if a transitive dep doesn't have a Debian prebuild and falls
# back to source. Kept slim — full build-essential adds 200MB.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Drop dev deps so we can copy a lean node_modules into the runtime image.
RUN npm prune --omit=dev

# ─── Stage 2: Runtime ─────────────────────────────
FROM node:20-bookworm-slim

WORKDIR /app

# Copy compiled app + pruned node_modules (native binaries already resolved).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# Mount a persistent volume at /app/data in Coolify so SQLite survives deploys.
RUN groupadd -r -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs -s /usr/sbin/nologin nestjs && \
    mkdir -p /app/data && \
    chown -R nestjs:nodejs /app

USER nestjs

ENV DATABASE_PATH=/app/data/genius.sqlite
ENV PORT=3120
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3120

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3120/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main"]
