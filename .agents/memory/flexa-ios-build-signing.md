---
name: Flexa iOS build signing
description: iOS GitHub Actions build signing issues on macos-15/Xcode 16.4 and the fastlane fix
---

# iOS Build Signing — Xcode 16.4 on macos-15

## The Problem
`xcodebuild archive` with `CODE_SIGN_STYLE=Automatic` + any manual `CODE_SIGN_IDENTITY` override causes:
> "FlexaMarket is automatically signed for development, but a conflicting code signing identity Apple Distribution has been manually specified."

Without any identity override, Xcode 16.4 on the CI runner looks for an "iOS App Development" profile (requires registered devices), failing with:
> "Your team has no devices from which to generate a provisioning profile."

**Why:** Xcode 16.4 changed how automatic signing resolves profile types in CI. It no longer automatically selects Distribution for archive builds without a certificate already installed in the keychain.

## The Fix (fastlane)
Use fastlane with these steps in order:
1. `create_keychain` — temporary CI keychain
2. `app_store_connect_api_key` — load ASC key (key `JR8LBAM37G`, issuer `747bde63-c170-4c5d-aaf2-098c45831671`)
3. `get_certificates(type: "distribution")` — download/install Distribution cert
4. `get_provisioning_profile(app_store: true)` — download App Store profile
5. `update_code_signing_settings(use_automatic_signing: false, ...)` — switch project to Manual signing
6. `build_ios_app` — NO `codesigning_identity` override
7. `upload_to_testflight(skip_waiting_for_build_processing: true)`

**Why `update_code_signing_settings` is critical:** It mutates the .xcodeproj to `CODE_SIGN_STYLE=Manual` before build, eliminating the Automatic/Distribution conflict.

## Key Values
- Apple Team ID: D782MM56VY
- Bundle ID: com.flexamarket.mobile
- ASC App ID: 6754947270
- APNs Key ID: FPC9SK6XAC (created 2026-08-11, Production environment)
- DO App ID: 4a94f9b4-6ede-453e-9e8c-f1439d3ade6d

## APNs Token Flow (native Swift app)
- Swift app gets APNs token → stores in `NotificationDelegate.shared.apnsToken`
- `App.swift.didRegisterForRemoteNotificationsWithDeviceToken` posts `Notification.Name.apnsTokenReceived`
- `WebViewController` listens via `NotificationCenter` and calls `injectPushToken(token)` (fixes race condition where token arrives after page load)
- Website JS (`useExpoPushToken.ts`) listens for `window.__onApnsToken(token)` and POSTs to `/api/push/apns-token`
- Server stores `apns:HEX_TOKEN` in `expo_push_tokens` table
- `expo-push.ts.sendExpoPushToUser` splits tokens by prefix: `apns:` → `sendApnsToTokens` in `apns.ts`
- `apns.ts` uses Node.js built-in `http2` + JWT (ES256) to call `api.push.apple.com`

## APNs Environment Variables (set on DO production)
- `APNS_KEY_ID` = FPC9SK6XAC
- `APNS_TEAM_ID` = D782MM56VY
- `APNS_BUNDLE_ID` = com.flexamarket.mobile
- `APNS_KEY_P8` = p8 file content (SECRET type in DO)

## xcpretty pitfall
`| xcpretty || true` in GitHub Actions silently swallows xcodebuild errors and reports success even when the archive fails. Always use `2>&1 | tee /tmp/xcode.log` and check for `ARCHIVE FAILED` explicitly.
