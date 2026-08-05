# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm install -g pnpm@10.26.1

WORKDIR /app

# Copy workspace manifests first (layer-cache friendly)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared libs and api-server source
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install only api-server and its workspace deps
RUN pnpm install --filter "@workspace/api-server..." --frozen-lockfile --ignore-scripts

# Build (esbuild bundles everything into dist/)
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# The esbuild output is fully self-contained; copy only dist/
COPY --from=builder /app/artifacts/api-server/dist ./dist

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
