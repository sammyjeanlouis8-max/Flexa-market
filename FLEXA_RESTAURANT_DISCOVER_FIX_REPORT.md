# Flexa Restaurant — Discover production error fix

## Root cause

`GET https://flexamarket.com/api/restaurants?country=HT` returned **HTTP 403** `COUNTRY_DISABLED` because Neon `restaurant_country_availability` for Haiti was still `under_review` / `enabled=false`, even though `RESTAURANT_PUBLIC_LAUNCH` was already true.

The Discover UI treated that 403 as a generic load failure → red banner “Unable to load nearby businesses. Please try again.”

Secondary issue: `GET /restaurant/` returned **nginx 403** because static assets live under `dist/public/restaurant/categories/`, so `/restaurant/` was served as a directory listing.

## Corrected files

### PR #323 → merge `84c358cb`
- `artifacts/api-server/src/lib/migrations.ts` — `restaurant_country_ht_public_launch.v1`, `beauty_country_ht_public_launch.v1`
- `artifacts/api-server/src/lib/restaurantCountryPolicy.ts` — Haiti defaults approved
- `artifacts/api-server/src/routes/restaurants.ts` — soft `COUNTRY_REQUIRED` 200 empty
- Marketplace + mobile Discover empty-state / error classification

### PR #324 → merge `4c7f92a4` (tip commit `7edb53ec`)
- `artifacts/marketplace/nginx.seo.conf` — `/restaurant` + `/restaurant/` → SPA
- `artifacts/api-server/src/routes/beauty.ts` — soft `COUNTRY_REQUIRED` 200 empty
- Locales / Beauty hub / mobile empty actions

## Production API evidence (live)

```json
GET /api/restaurants?country=HT → 200
{ "restaurants": [], "total": 0, "freeLaunch": true }

GET /api/restaurants/launch → HT status=approved, enabled=true, publiclyActive=true

GET /api/beauty/businesses?country=HT → 200
{ "businesses": [], "total": 0 }

GET /api/beauty/businesses (no country) → 200
{ "businesses": [], "total": 0, "code": "COUNTRY_REQUIRED" }

GET /restaurant/ → 200 SPA shell
```

## UI validation

- Restaurant Near You: “No restaurants available near you yet.” + Change location / Expand radius / Use my current location / Browse available businesses. No red error.
- Beauty Near you: “No beauty businesses available near you yet.” No red error.
- Empty collections are successful API responses (zero published businesses in HT), not failures.

## Deploy status

- #323 Deploy to DigitalOcean: success (`84c358cb`)
- #324 Deploy to DigitalOcean: success (`4c7f92a4`) — https://github.com/sammyjeanlouis8-max/Flexa-market/actions/runs/46152993097
- Tests: api-server restaurant/beauty smoke + country policy — 27 passed
