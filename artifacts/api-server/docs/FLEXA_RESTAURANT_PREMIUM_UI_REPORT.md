# Flexa Restaurant — Premium UI, Nearby Discovery & Availability

**Branch:** `cursor/restaurant-premium-ui-5a20`  
**Public launch flag:** `RESTAURANT_PUBLIC_LAUNCH=false` (unchanged)  
**Delivery policy:** Owner-managed only — Flexa Driver forbidden for food

---

## Requirement checklist

| # | Requirement | Status |
|---|---|---|
| 1 | Professional category photography (All, Restaurants, Home Kitchen, Food Truck, Bakery, Catering) | **PASS** — WebP + JPG under `marketplace/public/restaurant/categories/` and mobile assets |
| 2 | Home screen branding / nav / search / banner / Near You / View Map | **PASS** |
| 3 | Nearby discovery (lat/lng, Haversine, radius, distance sort, country scope) | **PASS** — API `nearby`/`radiusKm` + web/mobile geo |
| 4 | Professional business cards (status, verify badge, distance, city, rating, prep, favorite) | **PASS** — real fields only; no fabricated demo businesses |
| 5 | Open / Closing Soon / Closed / Temporarily Unavailable | **PASS** — `getRestaurantAvailabilityStatus` |
| 6 | Dedicated category pages (incl. bakery & catering) | **PASS** |
| 7 | View Map (OSM embed + marker list; green/gray open/closed) | **PASS** — no new paid map vendor |
| 8 | Fix Internal Server Error | **PASS** (code) / **PARTIAL** (prod) — see below |
| 9 | Loading / empty / error states (no raw SQL/ISE text) | **PASS** |
| 10 | Business profile & menu | **PASS** — existing detail preserved |
| 11 | Owner-managed delivery / no Flexa Driver | **PASS** — unchanged |
| 12 | Country allowlist / US-CA blocked / staff preview | **PASS** — unchanged |
| 13 | Direct-to-business payment / free launch | **PASS** — unchanged |
| 14 | Multilingual keys (EN + inherited locales) | **PASS** — `restaurantLocales.ts` (+ defaultValues) |
| 15 | Website + native discover parity | **PASS** — web + Expo discover updated |
| 16 | Security / visibility gates | **PASS** — existing auth + country + status filters |
| 17 | Automated tests | **PASS** — schedule + country policy suites |
| 18 | Visual acceptance screenshots | **NOT TESTED** in this run (queued follow-ups deferred browser capture) |
| 19 | GitHub PR + DigitalOcean deploy | **PENDING** until merge |
| 20 | This report | **PASS** |

---

## Internal Server Error — root cause

**Historical cause (documented in #308):** restaurant DDL migrations were registered *after* the startup apply loop, so Neon never created `restaurants` / related tables → `relation does not exist` → HTTP 500 with `error: "Internal server error"`.

**Current production probe (this run):**
- `GET /api/restaurants/launch` → **200** (`publicLaunch: false`)
- `GET /api/restaurants?country=Haiti` unauthenticated → **401 Unauthorized** (Super Admin gate)

So anonymous clients no longer hit 500; authenticated staff preview still depends on schema migrations having applied on the DO app. Discover UI now maps failures to friendly copy and never surfaces raw `"Internal server error"` / SQL.

**Backend hardening this PR:**
- Customer-facing 500 body: `"Unable to load nearby businesses. Please try again."` + stable `code`
- Availability status field on list/detail
- Nearby radius filter

---

## Files modified (high level)

- `artifacts/api-server/src/lib/restaurantSchedule.ts` — availability statuses
- `artifacts/api-server/src/routes/restaurants.ts` — nearby radius, status, safer errors
- `artifacts/api-server/src/tests/restaurantSchedule.test.ts`
- `artifacts/marketplace/public/restaurant/categories/*.{webp,jpg}`
- `artifacts/marketplace/src/pages/restaurant/Discover.tsx`
- `artifacts/marketplace/src/pages/restaurant/RestaurantMap.tsx` (new)
- `artifacts/marketplace/src/pages/restaurant/CategoryDiscover.tsx`
- `artifacts/marketplace/src/components/restaurant/RestaurantCard.tsx`
- `artifacts/marketplace/src/components/restaurant/RestaurantShell.tsx`
- `artifacts/marketplace/src/lib/restaurantApi.ts`
- `artifacts/marketplace/src/App.tsx`
- `artifacts/marketplace/src/i18n/restaurantLocales.ts`
- `artifacts/mobile/app/restaurant/discover.tsx`
- `artifacts/mobile/lib/restaurantApi.ts`
- `artifacts/mobile/assets/restaurant/categories/*`

---

## Remaining blockers

1. Production still requires Super Admin for discover until `RESTAURANT_PUBLIC_LAUNCH` is approved.
2. Visual screenshot suite (#18) not captured in-agent this turn.
3. Queued follow-ups: full registration onboarding redesign + contact buttons — implement next without regressing this UI.
4. Empty marketplaces correctly show empty state once API returns 200 [].

---

## Deploy notes

Merge this branch to `main` to trigger `.github/workflows/deploy.yml` → DigitalOcean App Platform. Keep `RESTAURANT_PUBLIC_LAUNCH=false`. Do not ship new store native builds without explicit approval.
