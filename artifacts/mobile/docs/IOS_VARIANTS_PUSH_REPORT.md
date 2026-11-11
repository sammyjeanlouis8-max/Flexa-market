# Native iOS PR — variants + push report

**PR:** #221 · **Branch:** `cursor/ios-all-pages-native-e34a`  
**Build target:** keep **1.0.1 (101)** — `eas.json` preview has no `autoIncrement`; production still has remote `autoIncrement` (do **not** run production profile next). Local `app.json` `buildNumber` is ignored when `appVersionSource: remote`.

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

1. Install TestFlight / internal preview build **1.0.1 (101)** for `com.flexamarket.mobile` (do not use production profile — would autoIncrement past 101).
2. Sign in with a real Flexa account.
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
