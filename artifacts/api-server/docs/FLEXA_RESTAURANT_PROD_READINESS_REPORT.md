# Flexa Restaurant — Production Readiness Report

**Branch:** `cursor/restaurant-prod-ready-5a20`  
**Base:** `main`  
**Feature flag:** `RESTAURANT_PUBLIC_LAUNCH = false` (Super Admin / Admin / Moderator only)

## Initial issues discovered

| Issue | Severity |
| --- | --- |
| Restaurant `CREATE TABLE` migrations pushed **after** the startup apply loop → tables never created; `GET /api/restaurants` returned 500 in production | Critical |
| Flexa Restaurant nav/API publicly reachable before Super Admin approval | Critical |
| Owners could self-`publish` without admin application approval | High |
| Dish models could be marked available without food images | High |
| Order status updates lacked transition enforcement / immutable history | High |
| Country filter could be bypassed via query param by non-staff | High |
| No dedicated listing routes for Restaurants / Food Trucks / Home Kitchens | Medium |

## Critical / high issues corrected in this PR

1. **Migrations run before apply loop** (+ smoke test). Also adds `restaurant_order_status_history`.
2. **Staff-only feature flag** on web nav, mobile drawer, page gate, and API (`requireRestaurantAccess` / `requireRestaurantAuthAccess`). Launch payload includes `publicLaunch: false`.
3. **Admin application workflow** (`PATCH /api/admin/restaurants/:id/application`) with statuses: submitted / under_review / additional_info_required / published / rejected / suspended.
4. **Owner submit** sets `submitted` (not public) unless staff force-publishes.
5. **Country lock** for non-staff discovery; profile country preferred.
6. **Dish image required** before a dish can be `defaultAvailable`.
7. **Public menu hides** items without photos / sold out.
8. **Order status transitions** enforced; history rows appended.
9. **Dedicated category pages:** `/restaurant/restaurants`, `/restaurant/food-trucks`, `/restaurant/home-kitchens`.
10. Discover **retry** on error; i18n `staffPreviewOnly` EN/HT/FR/ES.

## Automated test results

```
artifacts/api-server: restaurantAccess + restaurantsRoutes.smoke + restaurantSchedule
→ 14 passed
```

Marketplace `restaurantAccess.test.ts` added (run with marketplace vitest when available).

## Feature checklist (honest)

| Area | Status | Notes |
| --- | --- | --- |
| Staff feature flag (UI + API) | PASS | Verified in unit/smoke tests; `RESTAURANT_PUBLIC_LAUNCH=false` |
| Schema migrations ordering | PASS | Smoke asserts before apply loop |
| Category listing pages | PASS | Routes + Discover `initialType` |
| Country filtering | PASS | Server-enforced for non-staff |
| Home kitchen address privacy | PASS | Existing shaping preserved |
| Food truck operating location | PASS | Existing owner patch preserved |
| Admin IDV + suspend + approve | PASS | Admin UI + API |
| Cart one-business + backend price calc | PASS | Existing order create recalculates from DB |
| Order idempotency | PASS | Existing `idempotencyKey` |
| Owner-managed delivery (no Flexa drivers) | PASS | Intentional; matches prior Pro Max policy |
| Stripe native food checkout | FAIL / remaining | Still “pay restaurant directly”; Stripe food checkout not wired |
| Full Flexa driver assignment for restaurant orders | FAIL / remaining | Explicitly owner-managed; driver PIN stack not attached |
| Variants / toppings customization groups | FAIL / remaining | Notes field only today |
| Integer minor-unit money columns | FAIL / remaining | Still `REAL` amounts |
| Full dashboard (revenue/refunds/txns) | PARTIAL | Owner stats + orders; not full ledger UI |
| Real-time websocket order push | PARTIAL | Notification rows; no dedicated restaurant socket channel |
| Public production activation | BLOCKED | Waiting explicit Super Admin approval to flip flag |
| App Store mobile release | NOT TESTED | Not authorized |

## Files modified (high level)

- `artifacts/api-server/src/lib/migrations.ts`
- `artifacts/api-server/src/lib/restaurantAccess.ts` (new)
- `artifacts/api-server/src/routes/restaurants.ts`
- `artifacts/api-server/src/tests/*`
- `artifacts/marketplace/src/lib/restaurantAccess.ts` (new)
- `artifacts/marketplace/src/components/{Layout,PremiumSideMenu,restaurant/RestaurantPageGate}.tsx`
- `artifacts/marketplace/src/pages/{AdminRestaurants,restaurant/*}`
- `artifacts/marketplace/src/App.tsx`
- `artifacts/marketplace/src/i18n/restaurantLocales.ts`
- `artifacts/mobile/lib/restaurantAccess.ts` (new)
- `artifacts/mobile/components/shell/AppDrawer.tsx`

## Deployment stance

- **Do not flip** `RESTAURANT_PUBLIC_LAUNCH` without explicit Super Admin approval.
- After merge to `main`, DigitalOcean deploy will create tables and keep module **staff-preview only**.
- Public URL may load for staff; regular users are redirected / denied (403).

## Remaining blockers before claiming full production readiness

1. Stripe food checkout + webhook reconciliation for restaurant orders.
2. Optional Flexa driver integration **if** product decides to replace owner-managed delivery.
3. Menu variants / extras schema + UI.
4. Money stored as integer minor units.
5. Explicit public launch approval (`RESTAURANT_PUBLIC_LAUNCH=true` in api + web + mobile together).
