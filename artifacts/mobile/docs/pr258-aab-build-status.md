# PR #258 — Signed AAB build status

**Package:** `com.flexamarket.app` · **versionName:** `1.0.1`

## Build 983993f0 (failed)

- Commit: `aef3e56644c71e9c896f7252b88ca95c27ee6f28`
- versionCode: 66
- Status: **ERRORED** during Install dependencies
- Cause: root `.easignore` excluded pnpm workspace packages (`lib/`, `scripts/`, other `artifacts/*`), so install could not resolve `catalog:` / workspace graph
- Logs: https://expo.dev/accounts/muelsa89/projects/mobile/builds/983993f0-ef91-413f-b0a3-be357fd3fd5f

## Rebuild (pending)

- Fix: narrow `.easignore` to bulky assets only; keep workspace packages
- Target versionCode: **66** (remote reset to 65 → autoIncrement)
