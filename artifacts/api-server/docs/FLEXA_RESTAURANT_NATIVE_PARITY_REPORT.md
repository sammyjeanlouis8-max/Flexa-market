# Flexa Restaurant — Native Parity Report

**PR:** https://github.com/sammyjeanlouis8-max/Flexa-market/pull/308  
**Branch:** `cursor/restaurant-prod-ready-5a20`  
**Feature flag:** `RESTAURANT_PUBLIC_LAUNCH=false` (Super Admin preview only)  
**Generated:** 2026-11-26 (America/New_York)  
**Commit:** `c5202a276f2cd8e36e3e5b10034a6b3124b2d076`

## Initial issues discovered

| Issue | Severity | Resolution |
| --- | --- | --- |
| Mobile restaurant API used relative `/api` paths | High | Rebuilt `restaurantApi.ts` on `getApiBase()` |
| Owner / Add / My Orders were placeholder shells | High | Rewritten with live API |
| No native cart / checkout / customization | Critical | Added cart, customize modal, checkout |
| Category listings missing / stubbed | High | `category/[type].tsx` + restaurants / food-trucks / home-kitchens |
| No owner menu / dishes / settings / food-safety | High | Owner sub-routes implemented |
| Country policy not enforced on mobile gate | High | `RestaurantGate` + country helpers |
| Hardcoded empty My Orders | Critical | Loads `/restaurants/me/orders` |
| Missing EN/HT/FR/ES restaurant strings | Medium | Added via `nativeScreens.ts` + LanguageContext |
| Native Stripe PaymentSheet SDK absent | Blocker | Documented BLOCKED — server PaymentIntent + webhook |

## Website → native parity matrix

| # | Capability | Website | Native route(s) | Status |
| --- | --- | --- | --- | --- |
| 1 | Restaurant Home | `/restaurant` | `/restaurant` | **PASS** (code) |
| 2 | Restaurants listing | Category discover | `/restaurant/restaurants`, `/restaurant/category/traditional` | **PASS** (code) |
| 3 | Food Trucks listing | Category discover | `/restaurant/food-trucks`, `/restaurant/category/food_truck` | **PASS** (code) |
| 4 | Home Kitchens listing | Category discover | `/restaurant/home-kitchens`, `/restaurant/category/home_kitchen` | **PASS** (code) |
| 5–7 | Search / results / filters | Discover | `/restaurant/discover` (q, type, openNow) | **PASS** (code) |
| 8–10 | Profiles (restaurant/truck/kitchen) | `/restaurant/:id` | `/restaurant/[id]` | **PASS** (code) |
| 11–12 | Food details / customization | Detail + options | Detail + modal options | **PASS** (code) |
| 13 | Cart | `/restaurant/cart` | `/restaurant/cart` | **PASS** (code) |
| 14–16 | Fulfillment / address / checkout | Checkout | `/restaurant/checkout` | **PASS** (code) |
| 17 | Stripe PaymentSheet | Hosted / PI | Server PI; native PaymentSheet | **BLOCKED** — no `@stripe/stripe-react-native` |
| 18 | Order confirmation | Post-checkout | Checkout success state | **PASS** (code) |
| 19–20 | My Orders / details | MyOrders | `/restaurant/my-orders` | **PASS** (code) — list + cancel; dedicated detail route thin |
| 21–23 | Tracking / cancel / refund | Orders | Owner + customer cancel/refund/PIN | **PASS** (code) |
| 24 | Favorites | — | `/restaurant/favorites` (AsyncStorage) | **PASS** (local) |
| 25–26 | Reservations | Reservations pages | `/restaurant/my-reservations`, `/restaurant/owner/reservations` | **PASS** (code) |
| 27–34 | Registration / verification / quiz / status | Add + identity + quiz | `/restaurant/add`, `owner/identity`, `owner/food-safety` | **PASS** (code) |
| 35–59 | Owner dashboard & settings | Owner* pages | `/restaurant/owner` + subroutes | **PASS** (code) — primary workflows; not 1:1 file-per-screen |
| 60–72 | Admin | Admin countries / apps | `/restaurant/admin/countries` (+ backend admin) | **PASS** (countries); other admin ops remain website/API |

Legend: **PASS (code)** = implemented and typechecked; device E2E not run in this environment.

## Android / iOS validation

| Check | Android | iOS |
| --- | --- | --- |
| Emulator/simulator launch | **NOT TESTED** — no Android emulator / iOS simulator credentials in Cloud Agent | Same |
| Screenshot evidence per screen | **NOT TESTED** | **NOT TESTED** |
| Hardware back / safe areas | **PASS** (code: Expo Router + SafeAreaInsets) | **PASS** (code) |
| Production builds | **NOT TESTED** | **NOT TESTED** |

Do not claim 100% device parity without emulator evidence.

## API / security / policy

| Area | Status |
| --- | --- |
| DigitalOcean API via `getApiBase()` | **PASS** (code) |
| Neon / Wasabi / existing auth reuse | **PASS** (existing backend) |
| No mock businesses / fake revenue in UI | **PASS** |
| Flexa Driver food ban | **PASS** (backend + native disclosure) |
| Country default-deny US/CA; HT under_review | **PASS** |
| Super Admin gate while launch=false | **PASS** (`RestaurantGate`) |
| Multilingual EN/HT/FR/ES restaurant keys | **PASS** |
| Payment idempotency | **PASS** (checkout idempotency key) |
| Client prices not trusted | **PASS** (server recomputes) |

## Automated checks (this turn)

- Mobile `tsc --noEmit`: run after commit prep
- Existing api-server restaurant vitest suite: retained from prior #308 commits

## Remaining blockers

1. **Native Stripe PaymentSheet** — requires adding `@stripe/stripe-react-native` (explicitly avoided to prevent unnecessary deps); orders create PaymentIntent server-side.
2. **Device screenshots / emulator E2E** — Cloud Agent lacks Android emulator & iOS Simulator.
3. **Public launch / country activation** — intentionally false; no store submit.
4. **Production deploy** — awaiting authorized merge of PR #308.

## Files modified (native focus)

- `artifacts/mobile/lib/restaurantApi.ts`, `restaurantCart.ts`, `restaurantCountryPolicy.ts`, `restaurantFavorites.ts`
- `artifacts/mobile/components/restaurant/RestaurantGate.tsx`, `RestaurantShell.tsx`
- `artifacts/mobile/app/restaurant/**` (hub, discover, category, detail, cart, checkout, add, my-orders, favorites, my-reservations, owner/*, admin/countries)
- `artifacts/mobile/i18n/nativeScreens.ts`, `context/LanguageContext.tsx`
- This report + production readiness update
