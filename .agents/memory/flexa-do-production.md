---
name: Flexa DO production setup
description: DigitalOcean deployment architecture, database SSL fix, and ingress routing for flexamarket.com
---

# Flexa Market DigitalOcean Production Setup

## Architecture
- App ID: `4a94f9b4-6ede-453e-9e8c-f1439d3ade6d` (lionfish-app)
- Domain: `flexamarket.com`
- **flexa-market** — Express API server (Dockerfile), handles `/api/*`
- **flexa-market2** — nginx SPA (Dockerfile.marketplace), handles `/*`
- Ingress routes: `/api` → flexa-market (preserve_path_prefix=true), `/` → flexa-market2

## Database
- DO managed PostgreSQL: `flexa-market-db` (ID: `8b91b8cf-cce1-4e70-9535-42ac71ee8a46`)
- Region: nyc1, size: db-s-1vcpu-1gb

## SSL Fix (critical)
DO managed PostgreSQL uses a self-signed CA certificate not in Node.js trust store.
**Wrong:** `DATABASE_URL=postgresql://...?sslmode=require` — pg verifies cert → fails
**Right:** `DATABASE_URL=postgresql://...` (no sslmode) + `ssl: { rejectUnauthorized: false }` in pg Pool config

The fix lives in `lib/db/src/index.ts`: when DATABASE_URL includes "ondigitalocean.com", Pool gets `ssl: { rejectUnauthorized: false }`.

## Deployment workflow
1. Build locally: `BASE_PATH="/" pnpm --filter @workspace/marketplace run build` + `pnpm --filter @workspace/api-server run build`
2. `git add -A && git commit && git push github main`
3. DO auto-deploys both services (deploy_on_push=true)
4. Manual trigger via DO API: `POST /v2/apps/{app_id}/deployments {"force_build": true}`

## Required env vars on flexa-market (API service)
- DATABASE_URL (secret, no sslmode param)
- SESSION_SECRET (secret)
- WASABI_ACCESS_KEY, WASABI_SECRET_KEY, WASABI_BUCKET_NAME, WASABI_ENDPOINT, WASABI_REGION
- RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME, RESEND_DOMAIN_VERIFIED
- PORT=8080, NODE_ENV=production

**Why:** Without DATABASE_URL, all API calls fail. Without sslmode fix, pg rejects DO's self-signed cert.
**How to apply:** Any new DO deployment needs all secrets above. If SSL errors appear, check DATABASE_URL doesn't have ?sslmode=require.
