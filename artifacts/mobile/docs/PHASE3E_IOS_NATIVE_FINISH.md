# Phase 3E — iOS native finish (Expo)

Branch: `cursor/ios-native-finish-cdf4` · PR #201  
Bundle ID: `com.flexamarket.mobile` · Team: `D782MM56VY` · EAS: `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e`

## RevenueCat / IAP

- Dependency: `react-native-purchases@9.15.3`
- Plugin: `./plugins/withRevenueCatIos.js` injects public `RevenueCatApiKey` into Info.plist from env
- Env: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` set on EAS for production/preview/development
- Public Apple SDK key source: legacy `artifacts/ios-native/Sources/Info.plist` (`appl_…`)
- App user association: `Purchases.logIn(String(flexaUserId))` — same as Swift shell; webhook uses `event.app_user_id`
- Products: `com.flexamarket.subscription.standard.monthly` / `…premium.monthly`
- UI success only after `CustomerInfo` entitlement / active subscription confirmation

## Background audio

- `app.json` → `ios.infoPlist.UIBackgroundModes` includes `audio` (kept `remote-notification`, `fetch`)
- Mini player: `staysActiveInBackground: true`

## Push cold start

- `PushBootstrap` uses `getLastNotificationResponseAsync` + pending path until auth restore finishes

## Build number / ASC

| Source | Value |
|---|---|
| Local `app.json` buildNumber | `4` (ignored; `appVersionSource: remote`) |
| EAS remote counter | `64` after failed attempt |
| EAS build 64 | **ERRORED** — invalid Distribution Certificate `1F7F477C…` |
| EAS build 101 (2026-11-04) | **ERRORED** — same invalid certificate; IPA never produced → almost certainly never uploaded to App Store Connect |
| Last finished EAS iOS | build **63** (2026-08-11) |

ASC portal confirmation of whether 101 appears in App Store Connect remains **pending** without interactive Apple login.

## Signing blocker (blocks installable preview)

Distribution certificate stored in EAS is rejected by Xcode:

> Signing certificate "iPhone Distribution: samuel jean louis (D782MM56VY)", serial "1F7F477CE7E64CB2ADBB05055D814744", is not valid for code signing.

Do **not** revoke blindly from this agent. On your Mac, run interactive credential repair (create replacement if Apple already invalidated the old cert):

```bash
cd artifacts/mobile
eas login
eas credentials -p ios
# pick production → Distribution Certificate → Set up a new certificate if current is invalid
# keep Team D782MM56VY
```

For **preview/internal** install on your iPhone (no TestFlight):

```bash
cd artifacts/mobile
eas device:create --apple-team-id D782MM56VY
# follow link / QR to register this iPhone UDID, then:
eas build -p ios --profile preview
```

## Verification

```bash
pnpm --filter @workspace/mobile run typecheck
cd artifacts/mobile && node --test tests/*.test.js tests/*.test.ts
pnpm --filter @workspace/mobile run release:check
```
