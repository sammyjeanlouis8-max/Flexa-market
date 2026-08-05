---
name: Expo EAS build setup
description: How to run EAS builds from Replit for the FlexaMarket mobile app — stubs, auth, and build URL pattern
---

# Expo EAS Build from Replit

## The stub problem
`artifacts/mobile/node_modules/` contains hollow stub files (`module.exports = {}`) for all major packages (41 total as of Aug 2026). This prevents local JS bundling (Metro / `expo export` / `eas update --channel`) from working. Stubs must be fixed before any local Expo tooling runs.

**Fix script** (run from workspace root):
```python
# See fix-stubs logic: for each stub, find real path in node_modules/.pnpm/ and write a re-export
# Also fix expo-modules-autolinking/exports.js separately (not covered by the auto-fix)
```

## Additional stubs needed beyond the 41
- `artifacts/mobile/node_modules/expo-modules-autolinking/exports.js` → must re-export from `build/exports.js` in pnpm store (not `index.js`)
- `artifacts/mobile/node_modules/@expo/config-plugins/` → must exist (was completely missing, not just a stub)
- `artifacts/mobile/node_modules/typescript/index.js` → real package, not stub (fixes Expo CLI `evaluateTsConfig` crash)

## Running EAS build
```bash
cd artifacts/mobile
EXPO_TOKEN=$EXPO_TOKEN node /home/runner/workspace/node_modules/.pnpm/eas-cli@19.1.0_.../node_modules/eas-cli/bin/run build --platform ios --profile production --non-interactive
```
- Use the project-local eas-cli binary from pnpm store (global npm install also works but may have version mismatches)
- Build uploads to EAS servers in ~5-10s; actual build takes 20-30 min on EAS cloud
- After completion, EAS auto-submits to TestFlight (ascAppId: 6754947270, appleId: samueljeanlouis37@icloud.com)

## Auth
- Account: `muelsa89` (sammyjeanlouis8@gmail.com)
- EXPO_TOKEN secret is stored in Replit secrets
- buildNumber auto-increments (remote source)

**Why:** EAS build runs on EAS cloud servers (fresh install, no stubs) — always prefer `eas build` over `eas update` from this Replit environment because local Metro bundling is blocked by stubs.
