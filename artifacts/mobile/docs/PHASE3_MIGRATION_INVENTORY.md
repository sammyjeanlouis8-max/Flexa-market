# Flexa Market — Phase 3 Native Migration Inventory

**PR:** #172 · **Branch:** `cursor/native-auth-globe-android-09ff`  
**Backend:** `https://flexamarket.com/api`  
**Machine-readable:** [`phase3-migration-inventory.json`](./phase3-migration-inventory.json)

## Verification (before Phase 3 work)

| Check | Result |
|---|---|
| Phase 1–2 screens intact | Yes — Login, Signup, AuthGlobe, Home, Search, Cart, Checkout still native |
| TypeScript | Pass |
| Focused native tests | Pass |
| WebView restored for marketplace? | No — entry remains Expo Router |
| Placeholder routes remaining | 23 |

## Status legend

| Status | Meaning |
|---|---|
| **FULLY_NATIVE** | Real RN UI + API wiring |
| **PARTIALLY_NATIVE** | Native UI incomplete / critical deep-links stubbed |
| **PLACEHOLDER** | `NativePlaceholder` or redirect stub |
| **MISSING** | On website/API, no native route |
| **BLOCKED** | Android policy / digital-purchase guard / deferred Firebase |

## Snapshot counts (inventory JSON)

| Status | Count |
|---|---|
| FULLY_NATIVE | 14 |
| PARTIALLY_NATIVE | 6 |
| PLACEHOLDER | 22 |
| MISSING | 34 |
| BLOCKED | 4 |
| **Total features audited** | **80** |

> Counts classify **product features**, not only Expo route files. Expo also has 23 placeholder *route files*; some map 1:1 to PLACEHOLDER features above.

## Phase 1–2 (preserve)

- Login / Signup / AuthGlobe (adaptive)
- Home / Search / Listing detail (partial Message)
- Account hub (partial deep-links)
- Settings country
- Delivery tracking
- Cart / Checkout / Order confirmation (wallet / Card FM)

## Highest-priority gaps for Phase 3

1. **Orders + Order detail** (checkout success already links here)
2. **Favorites**
3. **Wallet** (balance already used in checkout; top-up blocked)
4. **Inbox + Chat**
5. **Sell + image upload + my listings**
6. **Stripe single-item / DR listing buy** (unblocks Dominican checkout)
7. **Notifications list** (FCM still later)
8. **Edit profile / Addresses book / Legal / Delete account**

## Explicitly BLOCKED (do not fake)

- Wallet card top-up initiate → `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE`
- Paid boost initiate/confirm
- Subscription web/wallet checkout (use `/subscription/android/*` later)
- Music digital purchases
- Firebase / `google-services.json` (deferred)

## Recommended waves

See `recommendedPhase3Order` in the JSON:

- **3A** Post-purchase continuity  
- **3B** Money + identity  
- **3C** Communication  
- **3D** Seller tools  
- **3E** Growth + compliance content  
- **4+** Admin / driver / blocked billing / media  

## Discovery sources

- Website router: `artifacts/marketplace/src/App.tsx`
- Native routes: `artifacts/mobile/app/**`
- API modules: `artifacts/api-server/src/routes/**`
- Roles: `artifacts/api-server/src/middlewares/auth.ts`, `users.role`


## Phase 3A complete

Native **Orders**, **Order Details** (buyer PIN + carrier tracking), **Favorites**, and **Notifications** center.
Firebase: `google-services.json` present for `com.flexa.market` / project `flexa-market-8873a`; Expo push token registration prepared. Push delivery not claimed.
