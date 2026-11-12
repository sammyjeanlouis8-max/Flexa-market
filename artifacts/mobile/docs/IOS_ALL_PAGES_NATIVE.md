# iOS all-pages native (honest completion)

**Branch:** `cursor/ios-all-pages-native-e34a`  
**Base:** Phase 3U / PR #199 (`cursor/native-phase3u-final-native-09ff`)  
**Adds:** RevenueCat iOS IAP from `cursor/ios-native-finish-cdf4` + push cold-start pending-path

## Inventory after this work

| Status | Count | Notes |
|--------|------:|-------|
| FULLY_NATIVE | **79** | StoreKit subscription-billing + free `music-purchase` |
| PARTIALLY_NATIVE | **2** | `push-fcm` (device unverified) · `product-variations` (SQL pending) |
| PLACEHOLDER | **0** | |
| MISSING | **0** | |
| BLOCKED | **3** | wallet-topup, boost-paid, esim |

**Total: 84** · Overall FULLY **79/84 ≈ 94.0%** — **not 100%**.

Every Expo Router marketplace screen is a real native RN UI (no WebView feature shells, no `NativePlaceholder` routes). Remaining non-FULLY items are external blockers, not missing pages.

## What this branch adds

1. `lib/iap.ts` + `plugins/withRevenueCatIos.js` + `react-native-purchases@9.15.3`
2. `/subscription` — iOS purchase/restore via RevenueCat; Android browse/cancel only
3. `AuthContext` — `Purchases.logIn(String(flexaUserId))` / logout parity with Swift shell
4. `PushBootstrap` — cold-start path held until auth restore finishes
5. `app.json` — registers RevenueCat iOS plugin (`UIBackgroundModes` already includes `audio`)

## Still blocked / partial (do not claim done)

| ID | Why |
|----|-----|
| `wallet-topup` | Digital funds top-up needs billing policy path |
| `boost-paid` | No boost StoreKit/Play products wired |
| `esim` | No provider contract in-repo |
| `product-variations` | Needs approved `listing_variants` SQL on DigitalOcean |
| `push-fcm` | Needs physical-device FCM/APNs E2E proof |

## Owner actions for closer to 100%

1. Confirm ASC / EAS signing, then preview IPA with `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
2. Approve + apply `listing_variants` SQL
3. Physical push matrix (iOS APNs + Android FCM)
4. Play Billing / Apple IAP products for boost + music if those monetize in-app
5. eSIM provider contract

## Safety

No merge · no DigitalOcean deploy · no App Store / Play submit from this agent · no invented payment APIs.
