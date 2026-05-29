---
name: Expo SDK version updates & freshness gate
description: How to bump Expo SDK 54 package versions in this pnpm monorepo and the minimumReleaseAge gotcha.
---
# Updating Expo packages (mobile artifact)

Use `npx expo install --check` inside `artifacts/mobile` to see mismatches, then edit the
version specifiers in `artifacts/mobile/package.json` and run
`pnpm --filter @workspace/mobile install`. Re-verify with `expo install --check`
("Dependencies are up to date") and `pnpm typecheck`.

## minimumReleaseAge freshness gate blocks same-day SDK patches
`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` (24h). Expo publishes an entire SDK
patch batch (expo, expo-router, expo-font, @expo/cli, babel-preset-expo, expo-modules-*,
etc.) at the same moment, so right after a release ALL of them are <24h old and pnpm
install fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, cascading through transitive deps.

**Fix:** add Expo namespace globs to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`:
`expo`, `'expo-*'`, `'@expo/*'`, `babel-preset-expo`. (babel-preset-expo has no expo prefix
so the globs miss it — list it explicitly.)

**Why:** the gate is a supply-chain freshness control; excluding the trusted Expo namespace
is the targeted way to allow an official SDK patch alignment without lowering the gate globally.

## Mobile dev workflow port-detection quirk (not a build failure)
`scripts/dev-start.js` runs `expo start --clear`, clearing Metro cache on every start, so a
full rebuild happens each launch and the cold start can exceed restart_workflow's
port-detection window (DIDNT_OPEN_A_PORT) even though the proxy binds :18115 in ~1s and the
log ends with "Metro ready — full proxy active on :18115". Trust the log, not the timeout.
