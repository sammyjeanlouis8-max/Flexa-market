---
name: Expo EAS Build setup
description: EAS build environment for FlexaMarket mobile — stub fixes, env vars, provisioning profile management
---

## Hollow stub fix pattern
`artifacts/mobile/node_modules/` contains 41+ hollow stubs (`module.exports = {}`).
Fix with the Python script that finds each stub's real counterpart in `.pnpm/` virtual store and replaces with a proper re-export.
Key stubs manually created:
- `@expo/config-plugins/` (was completely absent)
- `expo-modules-autolinking/exports.js`
- `typescript/index.js`

## EAS CLI path
```
node /home/runner/workspace/node_modules/.pnpm/eas-cli@19.1.0_.../node_modules/eas-cli/bin/run
```

## iOS build — EXPO_TOKEN only needed (credentials are remote)
```
EXPO_TOKEN=<from session/secret>
```
Build uses `credentialsSource: "remote"` — no p8 file needed for `eas build`.

## iOS submit — ASC API key required
For `eas submit --platform ios`, the key must be written to disk first:
```
cat > /tmp/AuthKey_JR8LBAM37G.p8 << 'EOF'
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgmgRey4PzfsmKlxdn
zhxo3wSVGgaJ663kHpkAaCWt+/CgCgYIKoZIzj0DAQehRANCAAQjwaH9CP+sShpO
ixwFWFe7/20W2Gv35gekFztrKl2gC+bLqNJKASjn0yHPyS1f9dcx8eDR0xK43LtB
5QMYywEa
-----END PRIVATE KEY-----
EOF
```
Key details (also in eas.json submit.production.ios):
- Key ID: `JR8LBAM37G`  (name: "EAS Submit 2026", App Manager)
- Issuer ID: `747bde63-c170-4c5d-aaf2-098c45831671`
- Apple Team: `D782MM56VY` (samuel jean louis, Individual)
- ASC App ID: `6754947270`

**Why:** EAS submit non-interactive mode requires a local p8 file path; the key is not stored on EAS servers.

## Provisioning profile management
- Old stale profile (no Push Notifications): deleted via EAS GraphQL mutation `deleteAppleProvisioningProfiles`
- New profile with Push Notifications: `N8KH57YL9W` (created 2026-08-05 using key `2PT7VT62LY`)
- Apple App ID `com.flexamarket.mobile` must have Push Notifications enabled in Apple Developer Portal BEFORE generating the profile

## iOS provisioning profile deletion (when needed)
Use EAS GraphQL API with EXPO_TOKEN:
```
query { app { byFullName(fullName: "@muelsa89/mobile") { iosAppCredentials { iosAppBuildCredentialsList { provisioningProfile { id } } } } } }
mutation { appleProvisioningProfile { deleteAppleProvisioningProfiles(ids: ["<id>"]) { id } } }
```

## Xcode image compatibility
**Why:** `"image": "macos-sequoia-15.6-xcode-26.2"` in eas.json causes `cannot find 'ExpoAppDelegate' in scope` compile error with Expo SDK 54. Remove the `"image"` key entirely from the iOS production profile and let EAS select the default image for the SDK version.

## expo-file-system ExpoAppDelegate compile error (SDK 54 / expo-modules-core 3.x)
**Root cause:** expo-modules-core 3.x (pulled by expo@54.0.36) renamed `ExpoAppDelegate` → `ExpoAppDelegateSubscriberRepository`. `expo-file-system@18.0.12/ios/FileSystemModule.swift` still calls `ExpoAppDelegate.getSubscriberOfType()` → Swift compile error.
**Fix:** Pin `expo-file-system` to `18.1.11` in `artifacts/mobile/package.json` (this version uses the new API). Must also update `pnpm-lock.yaml` to match (the lockfile specifier must equal the package.json specifier or `pnpm install --frozen-lockfile` on EAS will fail).
**Safety net:** `artifacts/mobile/scripts/patch-expo-router-ctx.js` postinstall script also patches FileSystemModule.swift as a backup.
**How to apply:** If this error reappears after any expo SDK update, check expo-file-system version and compare with expo-modules-core API.

## pnpm lockfile consistency on EAS
EAS runs `pnpm install --frozen-lockfile`. If `package.json` specifier ≠ lockfile specifier for any package, the Install dependencies phase fails with "Unknown error". Always ensure lockfile and package.json are in sync before submitting. Partial/interrupted `pnpm install` runs can leave the lockfile in an inconsistent state — commit the lockfile after any install attempt.

## Android build
No special credentials needed. Just EXPO_TOKEN + `--platform android`.

## Expo dev server in Replit
Crashes with `CommandError: The bundled native module list from the Expo API is empty` due to Replit network restrictions blocking expo.dev API. This is expected — use TestFlight/EAS builds for testing, not the dev server.
