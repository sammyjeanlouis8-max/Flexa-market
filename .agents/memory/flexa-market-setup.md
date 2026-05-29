---
name: Flexa Market repo + Replit dev setup
description: How the GitHub repo maps into this Replit workspace, why clones fail, and how to get the app running locally
---

# Flexa Market — repo & dev environment

GitHub repo `sammyjeanlouis8-max/Flexa-market` (private) is a Replit pnpm monorepo: `artifacts/{api-server,marketplace,mobile,mockup-sandbox}`, shared `lib/{db,api-spec,api-zod,api-client-react,object-storage-web}`. Production runs on Digital Ocean App Platform (frontend + API) with a Neon Postgres DB; deploy is via Docker (`Dockerfile`, `Dockerfile.marketplace`), not the `render.yaml`/Render config that's also in the tree.

## Cloning the repo is the hard part
**The repo is ~1.5 GB** because `attached_assets/` (1063 committed image/video blobs) dominates. `git clone` (full or shallow) reliably times out / OOMs in this environment.
**Working approach:** pull only code via the GitHub API, skipping `attached_assets`:
1. `GET /repos/.../git/trees/main?recursive=1` to list blobs (~1801 total; ~736 are code).
2. Download each non-`attached_assets` blob via `GET /repos/.../git/blobs/{sha}` (base64) with ~12-way concurrency.
This yields ~33 MB of code in seconds. `attached_assets` are runtime-irrelevant (uploaded media), safe to skip for dev.
**Why:** on-demand blob fetch from a `--filter=blob:none` clone is also too slow; the direct blob API is the only thing that finishes.

## Dev database
Workspace `DATABASE_URL` points to Replit's local Postgres (`helium/heliumdb`), NOT Neon — the db client picks driver by sniffing the URL for `neon`, so local correctly uses `node-postgres`. The local DB starts empty, so `/api/categories` 500s until schema is pushed.
- Push schema: `pnpm --filter @workspace/db run push --force` (drizzle-kit).
- **Drizzle-kit push prompts interactively on rename ambiguity** (e.g. "follows renamed from bnpl_settings?") if the DB has a partial/old schema; `--force` and piping `yes ''` do NOT answer its raw-TTY TUI. Fix: make the DB truly empty first (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) so every table is an unambiguous create — then push runs non-interactively.
- Categories (226) seed automatically on api-server startup (`syncCategories` in api-server `src/index.ts`); just restart the server after the schema exists.

## Running locally
- api-server binds `PORT` (workflow assigns 8080); needs only `DATABASE_URL` to boot. Missing `RESEND_API_KEY` (emails), Anthropic, Stripe, Twilio just log warnings and disable those features.
- marketplace (Vite) binds `PORT` (assigned 5173) and reaches the API; categories rendering in the UI confirms frontend→API works.
- **Port clash:** the `mockup-sandbox` (Canvas) Vite preview plugin grabs default port 5173, stealing it from marketplace → marketplace workflow fails with DIDNT_OPEN_A_PORT. Free 5173 (kill the mockup-sandbox vite) then start marketplace first.

## Original issues (resolved)
- OTP recovery emails were switched to English — reverted to Kreyòl (subject "FLEXA MARKET – Kòd Rekiperasyon Kont Ou"). Communicate with this user in Haitian Creole.
- "Could not connect to server" login error was a Neon free-compute quota exhaustion that reset on the new billing period, not a code bug.
