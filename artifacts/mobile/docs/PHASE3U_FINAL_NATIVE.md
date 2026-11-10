# Phase 3U — Final native gaps (honest completion)

**Branch:** `cursor/native-phase3u-final-native-09ff`  
**Base:** Phase 3T / PR #198  
**Safety:** No merge · no DigitalOcean deploy · no Play submit · no production SQL apply without approval

## Inventory after 3U code

| Status | Count | Notes |
|--------|------:|-------|
| FULLY_NATIVE | **77** | includes new wallet prepaid redeem (`/wallet-redeem`) |
| PARTIALLY_NATIVE | **2** | `push-fcm` (device unverified) · `product-variations` (schema migration pending) |
| PLACEHOLDER | **0** | |
| MISSING | **0** | |
| BLOCKED | **5** | wallet-topup, subscription-billing, boost-paid, music-purchase, esim |

**Total: 84** (was 83 + wallet-redeem route) · Overall FULLY **77/84 ≈ 91.7%** — **not 100%**.

## Task results

### Product variations
- Additive table `listing_variants` + SQL `artifacts/api-server/sql/2026-11-10_listing_variants.sql` (**not applied**).
- API: `GET/PUT /api/listings/:id/variants` with `VARIANTS_SCHEMA_PENDING` when table missing.
- Native seller manager + buyer picker + cart `variantId` + checkout validation/stock decrement when schema ready.
- Remains **PARTIALLY_NATIVE** until migration is explicitly approved and applied.

### Firebase / FCM
- Code path complete: permissions, register/refresh, logout cleanup, channels, deep links, no inbox duplicates.
- Status stays **PARTIALLY_NATIVE** — physical-device delivery **not verified**.

### Payments (policy audit)
| Flow | Classification | Android status |
|------|----------------|----------------|
| Stripe / BNPL / cart wallet **physical goods** | Physical | Already native |
| Flexa Card **repay** | Debt repay | Native |
| Prepaid **recharge-card redeem** | Allowed (not Play IAP) | **Native `/wallet-redeem` added** |
| Wallet card/MonCash **top-up** | Digital funds | BLOCKED |
| Subscriptions / paid Boost / music buy | Digital goods | BLOCKED |

### eSIM
- No provider in-repo. Honest BLOCKED shell (no fake QR/plans). Misleading “backend preserved” copy removed.

### Android APK
- `EXPO_TOKEN` still **missing** in agent VM → EAS preview **not run**. No build ID / APK URL.

## Required owner actions for 100% overall
1. Approve + apply `listing_variants` SQL on DigitalOcean (then re-audit variations → FULLY).
2. Inject `EXPO_TOKEN` into agent session → EAS preview APK.
3. Physical Android matrix (esp. FCM).
4. Play Billing / eSIM provider contracts for remaining BLOCKED flows.
