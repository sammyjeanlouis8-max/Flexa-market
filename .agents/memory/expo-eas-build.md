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

## Required env vars for iOS builds (non-interactive)
```
EXPO_TOKEN=<from secret>
EXPO_ASC_API_KEY_PATH=/tmp/AuthKey_2PT7VT62LY.p8
EXPO_ASC_KEY_ID=2PT7VT62LY
EXPO_ASC_ISSUER_ID=747bde63-c170-4c5d-aaf2-098c45831671
EXPO_APPLE_TEAM_TYPE=INDIVIDUAL
EXPO_APPLE_TEAM_ID=D782MM56VY
```

**Why:** EAS non-interactive mode requires all these; missing any one causes an interactive prompt that crashes in Replit.
**The .p8 file** must be written to disk first: `cat > /tmp/AuthKey_2PT7VT62LY.p8 << 'EOF' ... EOF`
The p8 content is stored as Replit secret `EXPO_ASC_KEY_P8`.

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

## Android build
No special credentials needed. Just EXPO_TOKEN + `--platform android`.

## Expo dev server in Replit
Crashes with `CommandError: The bundled native module list from the Expo API is empty` due to Replit network restrictions blocking expo.dev API. This is expected — use TestFlight/EAS builds for testing, not the dev server.
