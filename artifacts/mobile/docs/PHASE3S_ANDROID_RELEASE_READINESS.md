# Phase 3S — Final native gaps + Android release readiness

**Branch:** `cursor/native-phase3s-device-validate-09ff`  
**Base:** Phase 3R / PR #196  
**Safety:** No merge · no DigitalOcean deploy · no Play submit · no fake billing/eSIM/SKU

## Inventory (verified)

| Status | Count | Notes |
|--------|------:|-------|
| FULLY_NATIVE | **76** | +1: intentional website route now opens platform browser (not WebView) |
| PARTIALLY_NATIVE | **2** | `push-fcm` (device unverified) · `product-variations` (itemSize-only) |
| PLACEHOLDER | **0** | website no longer NativePlaceholder stub |
| MISSING | **0** | |
| BLOCKED | **5** | Play Billing ×4 + eSIM |

**Total: 83** · Overall FULLY **76/83 ≈ 91.6%** · Not 100% overall.

## Partial screens — Phase 3S work

### `product-variations` (still PARTIAL)
- Safe UX: size/color presets compose into existing `itemSize` text via `PUT /api/listings/:id`.
- **Not done / blocked by API:** multi-SKU, stock-per-variant, cart line SKUs — only `listings.item_size` text column exists.

### `push-fcm` (still PARTIAL)
- Code path: `expo-notifications` → Expo token → `POST /api/push/expo-token` with retries + Android channels.
- Notifications screen: retry registration + **local-only** device validation checklist (`physicalDeviceVerified` always false in code).
- **Still required:** physical Android FCM receipt + EAS FCM V1 credential confirmation in Expo dashboard.

## Website route
- `/website` opens `https://flexamarket.com` via `expo-web-browser` (Chrome Custom Tabs).
- No embedded marketplace WebView.

## Blocked screens — exact prerequisites

| ID | Code ready? | External prerequisite | Fake/complete? |
|----|-------------|----------------------|----------------|
| `wallet-topup` | Native wallet UX + Android digital-purchase guard | Google Play Billing / policy-approved alternate for digital top-up; server `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE` | **No** — do not fake |
| `subscription-billing` | Cancel-at-period-end native; paid checkout blocked | Play Billing companion (or RevenueCat Android) + store listing | **No** |
| `boost-paid` | Unpaid/admin boost paths native; paid initiate blocked | Play Billing for paid boosts | **No** |
| `music-purchase` | Browse/play/upload native; buy blocked | Play Billing for digital music goods | **No** |
| `esim` | Honest DEFERRED shell | Carrier/eSIM provider contract + SKU/QR APIs | **No** |

**Code vs approval**
- In-repo code cannot finish these five without store policy + provider contracts.
- Approvals needed: Play Console billing setup, Expo/EAS FCM V1, eSIM vendor, optional multi-SKU backend design (separate from Play).

## CI classification (PR #196 / 3S)

| Check | Class | Action |
|-------|-------|--------|
| Vercel `flexa-market-api-server-*` “Account is blocked” | **Obsolete legacy** | Ignore — production is DigitalOcean |
| Mobile release preflight / Verify iOS release inputs | **Essential** | Must pass |
| DigitalOcean / security / API contracts | **Essential** | Preserve |

## Android build readiness (`com.flexa.market`)

| Item | Status |
|------|--------|
| Package | `com.flexa.market` |
| versionName / versionCode | `1.0.1` / **39** (unchanged this phase) |
| `google-services.json` | Present for package `com.flexa.market` |
| `eas.json` | `development` / `preview` (APK) / `production` (AAB) |
| Local SDK / `adb` / EAS login on agent | **Missing** — cannot produce APK/AAB in this environment |
| APK/AAB artifact this run | **Not produced** (blocker: no Android SDK + EAS not logged in) |
| Local Gradle probe | `./gradlew :app:assembleDebug` → **FAILED**: `SDK location not found` (no `ANDROID_HOME` / `local.properties`) |
| Play submit | **Not attempted** (requires explicit approval) |

### Exact next actions to produce a development APK
1. `eas login` as Expo owner `muelsa89` (or CI with `EXPO_TOKEN`).
2. From `artifacts/mobile`: `eas build --platform android --profile preview` (internal APK) — **do not** `--auto-submit`.
3. Install on physical device; run checklist in Notifications; record FCM message ID evidence.
4. Only after approval: production AAB + Play internal track.

## Physical-device validation (this agent)

**Not executed.** No USB device / emulator / EAS install session was available. Do not treat checklist toggles as proof.

Required human matrix: signup, login, OTP, FCM, navigation, seller upload, video upload, Boost feed, audio sync, checkout, tracking, seller ship, support chat, admin perms, background music.

## Automated evidence (this phase)
- See `tests/phase3sDeviceValidation.test.js`
- `tsc --noEmit`, `release:check`, focused node tests
