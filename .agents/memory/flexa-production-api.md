---
name: FlexaMarket production API + OTA config
description: Stable production API URL, OTA env var bundling rules, and EAS channel config.
---

## Production API URL
- Stable URL: `https://bonjour-tool.replit.app/api`
- This is the Replit deployed app — always active, not the dev server
- `getBaseUrl()` in `artifacts/mobile/context/AuthContext.tsx` falls back to this if `EXPO_PUBLIC_DOMAIN` is unset

## EXPO_PUBLIC_* Env Var Bundling
- `EXPO_PUBLIC_*` vars must be present at `eas update` bundle time to be inlined
- Set them in `artifacts/mobile/.env` AND as shell env vars when running `eas update`
- Without them, the old fallback URL (now hardcoded to bonjour-tool.replit.app) is used
- `eas.json` production profile now includes `"EXPO_PUBLIC_DOMAIN": "bonjour-tool.replit.app"` in env — but this only applies to `eas build`, NOT `eas update`

**Why:** Earlier OTA pushes used dead Render.com fallback (`flexa-api-uk4y.onrender.com`) because `EXPO_PUBLIC_DOMAIN` wasn't bundled, causing "JSON Parse error: Unexpected character: N".

## EAS Channel
- Production build profile must have `"channel": "production"` in eas.json
- OTA updates pushed with `--branch production` match TestFlight/App Store builds

## Apple Demo Account
- Demo account exists in production DB (email is icloud-based, stored securely outside memory)
- Created via `/api/auth/register` with country `HT`

## OTA Update Flow
- `eas update` bundles locally — shell env vars and `.env` file are used
- TestFlight app applies OTA after 2 restarts (downloads in background, applies on next launch)
- Runtime version policy: `appVersion` → matches app version string "1.0.0"
