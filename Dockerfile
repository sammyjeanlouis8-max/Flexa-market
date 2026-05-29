FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY . .

# Force development mode during install so devDependencies (esbuild, pino-pretty,
# thread-stream) are always present — they are needed by the build step.
RUN NODE_ENV=development pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

# Railway's start command may reference index.js — symlink so both names work
RUN ln -sf /app/artifacts/api-server/dist/index.mjs \
           /app/artifacts/api-server/dist/index.js

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
