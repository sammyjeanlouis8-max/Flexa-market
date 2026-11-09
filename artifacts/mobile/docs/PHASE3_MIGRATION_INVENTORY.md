# Flexa Market — Phase 3 Native Migration Inventory

**PR:** #172 · **Branch:** `cursor/native-auth-globe-android-09ff`  
**Backend:** `https://flexamarket.com/api`  
**Machine-readable:** [`phase3-migration-inventory.json`](./phase3-migration-inventory.json)

## Verification

| Check | Result |
|---|---|
| Phase 1–2 screens intact | Yes — Login, Signup, AuthGlobe, Home, Search, Cart, Checkout still native |
| Phase 3A intact | Orders, Order detail, Favorites, Notifications |
| Phase 3B | Wallet, Addresses, Edit Profile, Stripe single-item, Language |
| eSIM | **DEFERRED** — honest `/esim` screen; no fake catalog |
| TypeScript | Run in CI / local `pnpm typecheck` |
| WebView restored for marketplace? | No — entry remains Expo Router |

## Status legend

| Status | Meaning |
|---|---|
| **FULLY_NATIVE** | Real RN UI + API wiring |
| **PARTIALLY_NATIVE** | Native UI incomplete / critical deep-links stubbed |
| **PLACEHOLDER** | `NativePlaceholder` or redirect stub |
| **MISSING** | On website/API, no native route |
| **BLOCKED** | Android policy / digital-purchase guard / deferred provider |

## Snapshot counts (after Phase 3B)

| Status | Count |
|---|---|
| FULLY_NATIVE | 20 |
| PARTIALLY_NATIVE | 5 |
| PLACEHOLDER | 18 |
| MISSING | 33 |
| BLOCKED | 5 |
| **Total features audited** | **81** |

## Phase 3B completed

- **Wallet / Card FM** — `/wallet` balance + history + transaction detail; top-up CTA explains Android block (no fake recharge)
- **Addresses** — `/addresses` list/add/edit/delete/default + HT/DO country
- **Edit Profile** — `/edit-profile` name/phone/location/bio/avatar/language/password via existing APIs
- **Stripe single-item** — `/stripe-checkout` + listing “Buy with card” (DR primary); hosted Stripe URL via `expo-web-browser`
- **Language** — `/language-picker` + LanguageProvider
- **eSIM** — `/esim` marked **DEFERRED** (no plans/prices/QR)

## Explicitly BLOCKED / DEFERRED (do not fake)

- Wallet card top-up initiate → `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE`
- Paid boost / subscription / music digital purchases
- Flexa eSIM provider purchases (**DEFERRED**)
- Firebase delivery claims beyond Expo token registration prep

## Recommended next wave (Phase 3C — do not auto-start)

1. Inbox + Chat (real-time messaging)
2. Public shop profile
3. Remaining settings subpages (privacy/help)
4. Seller tools wave remains 3D

## Discovery sources

- Expo Router under `artifacts/mobile/app`
- Marketplace website routes
- API server under `artifacts/api-server/src/routes`
- Android digital purchase guard middleware
