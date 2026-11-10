# Phase 3E — iOS native finish (Expo)

Branch: `cursor/ios-native-finish-cdf4`  
Reference Android preview: **1.0.1 (48)** behavior preserved in shared RN code.  
Bundle ID unchanged: `com.flexamarket.mobile` · EAS project `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e`  
`app.json` / `eas.json` **not modified** (authorization required for audio background mode + RevenueCat plugin).

## Newly native / upgraded

| Route | Status | Notes |
|---|---|---|
| `/auth/forgot-password` | FULLY_NATIVE | `/api/recovery/*` wizard |
| `/videos` | FULLY_NATIVE | Vertical feed, `?video=` pin, SA allCountries |
| Home strip | FULLY_NATIVE | Exactly **2** latest eligible promo videos |
| `/boost`, `/my-boosts` | PARTIAL | Draft/manage/analytics; Android paid blocked |
| `/edit-listing/[id]` | FULLY_NATIVE | Camera + library, upload retry keeps form |
| `/music` + mini player | PARTIAL | expo-av; needs `UIBackgroundModes: audio` auth |
| `/calculator` | FULLY_NATIVE | Local math |
| `/admin` | PARTIAL | Role gate + All Videos country filter |
| `/subscription` | PARTIAL | RevenueCat product IDs + availability probe |

## Still external (allowed)

- EULA / Terms → `expo-web-browser` (legal docs, not marketplace WebView)
- Stripe hosted checkout → `WebBrowser` (payment provider)
- Maps / tel / WhatsApp from tracking

## Blockers needing human / Apple

1. **RevenueCat in Expo**: add `react-native-purchases` + `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` EAS secret; do not change `app.json` until authorized. Legacy Swift shell still has working IAP.
2. **Background music on iPhone**: authorize adding `"audio"` to `ios.infoPlist.UIBackgroundModes`.
3. **iOS build number**: local `app.json` shows iOS `buildNumber: "4"` while production `autoIncrement` is remote — report conflicts before changing.
4. Real-device IAP restore + APNs cold-start deep links need a signed iOS build (not Expo Go).

## Commands

```bash
pnpm --filter @workspace/mobile run typecheck
cd artifacts/mobile && node --test tests/*.test.js tests/*.test.ts
```
