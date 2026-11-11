# Native iOS PR — variants + push report

**PR:** #221 · **Branch:** `cursor/ios-all-pages-native-e34a`  
**HEAD SHA:** `739fd54abe9bbad8c85d59042f594f1fa20d6b51`  
**Build target:** keep **1.0.1 (101)** — `eas.json` preview has no `autoIncrement`; production still has remote `autoIncrement` (do **not** run production profile next). Local `app.json` `buildNumber` is ignored when `appVersionSource: remote`.

## 0) App Store Connect / TestFlight build 101 gate (2026-11-11)

| Question | Result |
|---|---|
| Does ASC already have a usable **1.0.1 (101)**? | **No.** Only EAS attempt for bn **101** is `1a0d41c8-8373-4333-b275-783c133ae806` → **ERRORED**, **no IPA**, commit `bff575e4…` (not `739fd54a`). |
| Highest successful ASC submit observed | **1.0.1 (63)** finished submit → ASC App ID `6754947270` (Aug 2026). No submit for 101. |
| EAS remote `buildNumber` now | **101** (still). Number **not** bumped — ASC never consumed a successful 101. |
| Signed build from `739fd54a` + internal TestFlight | **Blocked** by invalid Distribution certificate (same serial as Nov 4 / Nov 10 failures). |
| Real iPhone seller→buyer variant E2E | **Not run** (no IPA / no device on this agent). |
| DigitalOcean prod `listing_variants` | **Not applied** (guardrail). Local `flexa_variants_test` only. |

**Exact signing error** (`XCODE_BUILD_ERROR`):

```text
Signing certificate is invalid. Signing certificate "iPhone Distribution: samuel jean louis (D782MM56VY)", serial number "1F7F477CE7E64CB2ADBB05055D814744", is not valid for code signing. It may have been revoked or expired. (in target 'FlexaMarket' from project 'FlexaMarket')
```

Failed EAS builds with that error:
- bn **101** · https://expo.dev/accounts/muelsa89/projects/mobile/builds/1a0d41c8-8373-4333-b275-783c133ae806
- bn **64** (2026-11-10) · https://expo.dev/accounts/muelsa89/projects/mobile/builds/8e801655-c14d-4a27-b1bf-0e853b68c85a

**Owner actions (Mac + Apple team `D782MM56VY`):**
1. `cd artifacts/mobile && eas credentials -p ios`
2. Remove Dist Cert serial `1F7F477CE7E64CB2ADBB05055D814744`; create a new Apple Distribution cert + provisioning for `com.flexamarket.mobile`
3. Register the physical iPhone on the team if using internal/ad-hoc
4. From `739fd54a`: `eas build -p ios --profile preview --non-interactive` (keeps remote **101**)
5. Submit IPA → confirm Internal TestFlight shows **1.0.1 (101)** for testers
6. Point the binary at a **test** API that already has `listing_variants` (preview env today uses `EXPO_PUBLIC_DOMAIN=flexamarket.com` = prod without migration)

Agent credentials: `EXPO_TOKEN` only; `eas credentials` needs interactive Apple login; no ASC API key in this environment.

## 1) PR checks

| Check | Status | Cause / action |
|---|---|---|
| Vercel – flexa-market-api-server-2jmn | **FAILURE** | Vercel account blocked (`why-is-my-account-deployment-blocked`). Unrelated to iOS native; agent cannot relaunch. Owner must unblock Vercel account or remove obsolete Vercel project links. |
| Vercel – flexa-market-api-server-fihd | **FAILURE** | Same account-blocked cause. |
| Vercel – flexa-market-api-server-g97n | **FAILURE** | Same account-blocked cause. |
| Mobile release preflight (`Verify iOS release inputs`) | **Did not appear on latest head** at first audit; will re-trigger on push that touches `artifacts/mobile/**`. Local: `release:check` + `typecheck` + mobile tests pass. |

Production backend remains DigitalOcean (`flexamarket.com/api`), not Vercel.

## 2) Product variations — isolated test DB (production NOT migrated)

### Backend database
- ORM: Drizzle (`@workspace/db`) → **PostgreSQL**
- Production: DigitalOcean App Platform Postgres for Flexa Market API
- Agent test DB only: local Postgres 16 database `flexa_variants_test`

### Migration file
`artifacts/api-server/sql/2026-11-10_listing_variants.sql`

### Commands run (isolated)

```bash
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "CREATE DATABASE flexa_variants_test;"
# stub listings table for FK, then:
sudo -u postgres psql -d flexa_variants_test -v ON_ERROR_STOP=1 \
  -f artifacts/api-server/sql/2026-11-10_listing_variants.sql
# Result: CREATE TABLE + 2 indexes, exit 0
```

### Flow checks on test DB (SQL-level, exit 0)
- Seller insert size/color/price/stock variants ✅
- Buyer select M/Red → price 120 / stock 2 ✅
- Stock 0 → `REJECT_INSUFFICIENT_STOCK` ✅
- Stock decrement after “purchase” ✅
- Listing without variants still readable (variant_count=0) ✅
- PUT-style replace (delete+insert) ✅
- FK cascade on listing delete ✅
- Rollback proven: `DROP TABLE listing_variants CASCADE` then re-apply ✅

### Rollback
```sql
-- Test DB
DROP TABLE IF EXISTS listing_variants CASCADE;

-- Production (DO NOT RUN until Sammy approves after reviewing this report)
BEGIN;
DROP TABLE IF EXISTS listing_variants CASCADE;
COMMIT;
```

### Native + API code status (already in repo)
| Step | Code ready? | Test proof |
|---|---|---|
| Seller create/edit size·color·price·stock | Yes — `/product-variations` + `PUT /listings/:id/variants` | Code tests + isolated SQL ✅ · live DO schema ❌ pending approval |
| Buyer pick combo + see price/stock | Yes — `app/listing/[id].tsx` | Code wiring tests ✅ · device UI vs live API ❌ |
| Cart/checkout keep `variantId`; server re-checks price/stock | Yes — `CartContext` + `transactions.ts` | Code + SQL stock rules ✅ · live checkout E2E ❌ |
| Listings without variants | Yes — variant optional | SQL + code ✅ |

**Inventory:** `product-variations` stays **PARTIALLY_NATIVE** until DigitalOcean migration is approved/applied **and** device QA passes. **FULLY count not bumped.**

## 3) iPhone push notifications

### Path in repo
1. `expo-notifications` permission + Expo push token (`lib/pushPrep.ts`, EAS project `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e`)
2. `POST /api/push/expo-token` (Expo) and/or `POST /api/push/apns-token` (raw APNs, stored as `apns:…`)
3. Send: `artifacts/api-server/src/lib/expo-push.ts` splits Expo vs APNs (`sendApnsToTokensWithResults`)
4. Tap / cold start: `PushBootstrap` → `pathFromNotificationData` → Expo Router screen
5. iOS entitlements: `aps-environment: production` + `UIBackgroundModes: remote-notification`

### Config notes
- Android FCM: `google-services.json` / package `com.flexa.market`
- iOS: Expo credentials + APNs key on server (`APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID` / `APNS_KEY_P8` on DO)
- Agent **cannot** run a physical iPhone TestFlight session in this VM → `push-fcm` stays **PARTIALLY_NATIVE** (no FULLY bump)

### Exact steps for Sammy (real iPhone + test build 101)

> **Gate:** TestFlight **1.0.1 (101)** is **not** available yet — see §0. Complete Dist Cert repair + preview build/submit first. Do **not** use production profile (would autoIncrement past 101).

1. After §0 succeeds: Install TestFlight / internal preview build **1.0.1 (101)** for `com.flexamarket.mobile`.
2. Sign in with a real Flexa account (against a backend that has `listing_variants` if testing variations).
3. Allow notifications when prompted.
4. Confirm token registered: Settings → Notifications screen may show diagnostics; or ask support/admin to confirm `expo_push_tokens` row for your user (Expo `ExponentPushToken[…]` and/or `apns:…`).
5. **Foreground:** keep app open on Home. Have admin/support send a test push (or use server script) with payload:
   ```json
   {
     "title": "Flexa test order",
     "body": "Tap to open order",
     "data": { "screen": "orders", "orderId": "<REAL_ORDER_ID>" }
   }
   ```
   Expect banner/alert while open.
6. **Background:** press Home, send same style push, expect banner.
7. **Killed:** swipe away app, send push, expect banner.
8. **Tap:** notification must open `/orders/<REAL_ORDER_ID>` (not Home).
9. Repeat with chat payload: `{ "screen": "chat", "conversationId": "<ID>" }` → must open `/chat/<ID>`.

If any state fails, capture screenshot + whether token is Expo vs `apns:` and reply on the PR.

## 4) Blockers update (iOS build list)

| ID | Status | Dependency remaining |
|---|---|---|
| `music-purchase` | **Removed from blockers** → **FULLY_NATIVE** | Flexa Music is **free** this phase; upload/playback covered by `flexa-music` (no IAP). |
| `wallet-topup` | BLOCKED | Policy-compliant top-up (Apple IAP consumable / Play Billing or approved alternate) + server confirm path |
| `boost-paid` | BLOCKED | Paid boost StoreKit/Play product IDs + purchase confirm API (unpaid draft/boost UI already native) |
| `esim` | BLOCKED | eSIM provider contract + catalog/checkout/QR APIs |
| `product-variations` | PARTIAL | Approve+apply SQL on DigitalOcean + device QA |
| `push-fcm` (incl. iOS APNs) | PARTIAL | Physical iPhone matrix above + EAS/APNs credential confirmation |

### Inventory counts after this report
- FULLY_NATIVE: **79** (only `music-purchase` promoted with free-music policy proof in docs/tests)
- PARTIALLY_NATIVE: **2**
- BLOCKED: **3**
- PLACEHOLDER / MISSING: **0**
- Total features: **84** · **79/84 ≈ 94.0%** — still **not 100%**
