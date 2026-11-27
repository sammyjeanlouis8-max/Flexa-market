# Flexa Restaurant — Production Readiness Report

**PR:** https://github.com/sammyjeanlouis8-max/Flexa-market/pull/308  
**Branch:** `cursor/restaurant-prod-ready-5a20`  
**Feature flag:** `RESTAURANT_PUBLIC_LAUNCH = false` → **Super Admin only**

## Final business policy

1. Flexa Restaurant stays unavailable in every jurisdiction until regulatory requirements are verified and Super Admin explicitly enables the country (`status=approved` + `enabled=true`).
2. Restaurants / Food Trucks / Home Kitchens manage their own food delivery/pickup.
3. Flexa Driver must never transport restaurant food.
4. Operational country flags do **not** eliminate legal responsibilities of Flexa Technology LLC or food businesses.

## Requirement scorecard

| Requirement | Status | Evidence |
| --- | --- | --- |
| Default-deny country allowlist | **PASS** | `restaurantCountryPolicy.ts` + DB seed US/CA suspended, HT under_review, others not_reviewed |
| United States disabled | **PASS** | Seed + create/order/discover gates reject US when not approved |
| Canada disabled | **PASS** | Same as US |
| Haiti pending (not publicly active) | **PASS** | `under_review`, `enabled=false`; no public activation without Super Admin |
| Never auto-activate new countries | **PASS** | Upsert requires explicit Super Admin action; approve needs review notes or document URL |
| Super Admin Country Availability UI | **PASS** | `/admin/restaurants/countries` + APIs under `requireSuperAdmin` |
| Jurisdictions (state/province/region/municipality) | **PASS** | `restaurant_jurisdiction_availability` + admin upsert |
| Category toggles (restaurant/truck/home kitchen) | **PASS** | Per-country boolean flags + `isBusinessCategoryEnabled` |
| Licenses / food safety / review notes / docs / suspend / audit | **PASS** | Country fields + requirements + regulatory audit log |
| Compliance statuses | **PASS** | not_reviewed / under_review / approved / restricted / suspended |
| Hide nav / search / registration / orders in restricted markets | **PASS** | Super Admin preview gate + country gates on discover/create/publish/orders; US/CA omitted from registration dropdown |
| Validate business country (not profile-only bypass) | **PASS** | Discover blocks country≠profile for non-staff; create/orders use restaurant.country |
| Preserve existing orders when suspended | **PASS** | New orders blocked; existing order/refund/PIN endpoints remain for owners/customers/staff |
| Business-managed delivery + pickup only | **PASS** | Prior #308 delivery policy retained |
| Flexa Driver food ban | **PASS** | `POST /api/delivery` guard + order field bans |
| Food responsibility acknowledgment | **PASS** | Quiz + `food_responsibility_accepted_at` + publish check |
| Stripe / minor units / options / PIN | **PASS** (code) | Prior commit `52898f1f` + this branch |
| Live Stripe E2E | **NOT TESTED** | No Stripe test secrets in agent |
| Screenshots of all workflows | **NOT TESTED** | No authenticated Super Admin browser session |
| Production deploy health | **NOT TESTED** | Awaiting authorized merge |
| Legal compliance claim | **NOT CLAIMED** | Haiti remains under_review; no jurisdiction marked approved in seed |

## Country configuration (seed)

| Code | Name | Status | Enabled | Public |
| --- | --- | --- | --- | --- |
| US | United States | suspended | false | no |
| CA | Canada | suspended | false | no |
| HT | Haiti | under_review | false | no |
| * | All others | not_reviewed (default-deny) | false | no |

## Automated tests

```
vitest: restaurantAccess, restaurantMoney, restaurantCountryPolicy, restaurantsRoutes.smoke, restaurantSchedule
```

## Urgent discovery / registration fix (this turn)

| Issue | Root cause | Fix |
| --- | --- | --- |
| Prod `GET /api/restaurants` → 500 | On `main`, restaurant `CREATE TABLE` migrations were registered **after** the startup apply loop, so Neon never created `restaurants` | Already corrected on this branch: restaurant DDL (incl. country availability) is pushed **before** `for (const m of migrations)`. Deploy #308 to production. |
| Discover showed empty + error together | UI treated failed fetch as zero results | Mutually exclusive loading / error+Retry / empty / results |
| Add Restaurant Basics showed API text, no fields | React bug: `<motionFormFields />` lowercase tag never mounts as a component | Renamed to `BasicsFormFields` + full multi-step form with draft autosave |

**Production probe (before deploy):** `curl https://flexamarket.com/api/restaurants?country=Haiti` → `500 {"error":"Internal server error"}`; `/api/restaurants/launch` → 200.

## Native Android / iOS parity (continued on #308)

See `artifacts/mobile/docs/FLEXA_RESTAURANT_NATIVE_PARITY_REPORT.md`.

| Area | Status |
| --- | --- |
| Native screens (no WebView primary) | **PASS** (code) — Expo Router RN screens |
| Cart → checkout → order confirmation | **PASS** (code) |
| Owner dashboard / menu / dishes / settings / quiz | **PASS** (code) |
| My Orders live API | **PASS** (code) |
| Category listings (restaurants / trucks / kitchens) | **PASS** (code) |
| Delivery disclosure + driver ban copy (EN/HT/FR/ES) | **PASS** |
| Native Stripe PaymentSheet | **BLOCKED** — SDK not in repo; server PaymentIntent retained |
| Emulator / simulator screenshots | **NOT TESTED** |
| App store submission | **NOT AUTHORIZED** |

## Deployment stance

Keep `RESTAURANT_PUBLIC_LAUNCH=false`. Do not publicly activate any country without documented regulatory verification and Super Admin approval. No new paid infrastructure. Do not submit Android/iOS builds to public stores without explicit authorization.
