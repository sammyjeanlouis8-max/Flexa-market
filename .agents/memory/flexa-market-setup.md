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

## Mobile (Expo) — App Store launch
- iOS publishing on Replit is via built-in **Expo Launch** (Publish button), NOT terminal/EAS CLI. Do not run `eas build`/`eas submit`.
- Canonical Expo config is `artifacts/mobile/app.json` (name FlexaMarket, bundleId `com.flexamarket.mobile`, EAS projectId 45ba4fe9..., owner muelsa89). Stray root `app.json`/`eas.json` (bundleId com.muelsa89.workspace, projectId e3b847bb...) were scaffold stubs referenced nowhere — removed to avoid identifier conflicts.
- **Replit's workflow port detector probes over IPv6 (`::1`).** A local/proxy server that binds IPv4-only (`server.listen(PORT, "0.0.0.0")`) passes a `curl 127.0.0.1` check but fails detection → false `DIDNT_OPEN_A_PORT`, and the supervisor kills the process (preview shows "crashed"). Fix: bind **dual-stack** — in Node omit the host arg (`server.listen(PORT, ...)`) so it listens on `::` with IPv4 fallback. This was the real cause of the Expo (`dev-start.js`) preview crashes, NOT a platform bug.
- For Expo dev startup speed, don't pass `--clear` to `expo start` by default — it wipes the Metro cache every launch. Run a one-off `expo start --clear` only when the cache is actually corrupted.
- **IPA upload method:** Replit uploads IPA directly to Apple App Store Connect via Transporter (NOT via `eas submit`). User provides Apple ID/password; Replit handles the upload. Download IPA from expo.dev/artifacts/eas/... URL first.
- **EAS Xcode image:** must use `"image": "macos-sequoia-15.6-xcode-16.4"` in `eas.json` ios section — Xcode 26 beta (default) breaks pod install.
- **`lru-cache` version matters for codegen:** `lru-cache@11.5.1` causes `TypeError: expand is not a function` in `generate-codegen-artifacts.js`. Fix: pin `lru-cache@^11` to `11.4.0` in root `package.json` pnpm overrides.
- **`expo-notifications` plugin must be removed** for a WebView-only iOS app — it adds Push Notifications entitlement that the auto-generated EAS provisioning profile does not support. Remove both the plugin from `app.json` and the package from mobile `package.json`.
