# ── Stage 1: install & build ─────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm install -g pnpm@10.26.1

WORKDIR /app

# Copy workspace manifests (layer-cache friendly)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared libs and api-server source
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install only api-server and its workspace deps (includes @aws-sdk, etc.)
RUN pnpm install --filter "@workspace/api-server..." --frozen-lockfile

# Build via esbuild (bundles most code; externalises @aws-sdk/* & friends)
RUN pnpm --filter @workspace/api-server run build

# Create a standalone production deploy tree with correct node_modules
RUN pnpm --filter @workspace/api-server deploy --prod /app/deploy

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# node_modules from pnpm deploy (contains @aws-sdk, etc.)
COPY --from=builder /app/deploy/node_modules ./node_modules

# The esbuild output (dist/index.mjs + pino workers)
COPY --from=builder /app/artifacts/api-server/dist ./dist

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
