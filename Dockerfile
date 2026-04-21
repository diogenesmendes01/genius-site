# ─── Stage 1: Build ───────────────────────────────
# Includes native build tools so better-sqlite3 compiles successfully.
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Drop dev deps so we can copy a lean node_modules into the runtime image.
RUN npm prune --omit=dev

# ─── Stage 2: Runtime ─────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy compiled app + pruned node_modules (native binaries already built).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# Mount a persistent volume at /app/data in Coolify so SQLite survives deploys.
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    mkdir -p /app/data && \
    chown -R nestjs:nodejs /app

USER nestjs

ENV DATABASE_PATH=/app/data/genius.sqlite
ENV PORT=3120
ENV HOST=0.0.0.0

EXPOSE 3120

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3120/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main"]
