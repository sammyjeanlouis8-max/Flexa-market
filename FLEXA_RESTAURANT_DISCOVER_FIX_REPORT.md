# Flexa Restaurant — Discover production error fix

## Root cause (production evidence)

`GET https://flexamarket.com/api/restaurants?country=HT` returned **HTTP 403**:

```json
{
  "error": "Flexa Restaurant is not available in Haiti. Regulatory approval has not been granted.",
  "code": "COUNTRY_DISABLED",
  "countryPolicy": {
    "countryCode": "HT",
    "status": "under_review",
    "enabled": false,
    "restaurantsEnabled": false
  },
  "restaurants": []
}
```

`RESTAURANT_PUBLIC_LAUNCH` was already `true`, but **Haiti country policy** in Neon remained `under_review` / `enabled=false`.

The Discover UI then misclassified that 403 as a generic load failure and showed the red banner:
“Unable to load nearby businesses. Please try again.”

## Secondary production issue (homepage route)

`GET https://flexamarket.com/restaurant/` returned **HTTP 403** from nginx because a physical static folder `dist/public/restaurant/categories/` made `/restaurant/` resolve as a directory listing (denied).  
`/restaurant/discover` and `/restaurant/index.html` were already **200**.

## Fixes

### PR #323 (merged → deploy SHA `84c358cb`)

1. Migration `restaurant_country_ht_public_launch.v1` — approve/enable Haiti for restaurants, food trucks, home kitchens, catering (US/CA stay suspended).
2. Migration `beauty_country_ht_public_launch.v1` — approve/enable Haiti for Séduire Beauty.
3. Defaults in `restaurantCountryPolicy.ts` updated so Haiti seeds as public.
4. Discover without country → **200 empty** with `COUNTRY_REQUIRED` (not 400).
5. Web + mobile Discover: classify `COUNTRY_*` / regulatory 403 as soft empty/restricted — not red load error.
6. Empty state actions: Change location / Expand radius / Use GPS / Browse.

### Follow-up (this branch)

1. nginx: exact `/restaurant` + `/restaurant/` → SPA `index.html`; keep `/restaurant/categories/*` as static assets; disable absolute/port redirects.
2. Beauty discover without country → **200 empty** with `COUNTRY_REQUIRED` (parity with restaurants).
3. Locale copy aligned to “No restaurants/beauty businesses available near you yet.”
4. Mobile restaurant empty-state actions + default country Haiti.

## Post-deploy production API evidence (after #323)

```json
GET /api/restaurants?country=HT → 200
{ "restaurants": [], "total": 0, "freeLaunch": true, "platformFees": { "commission": 0 } }

GET /api/restaurants/launch → HT publiclyActive: true, status: approved, enabled: true

GET /api/beauty/businesses?country=HT → 200
{ "businesses": [], "total": 0 }

GET /api/beauty/countries → HT enabled/approved/publiclyActive: true
```

## UI validation

- Restaurant Near You (Haiti): empty state **without** red error; actions present.
- Beauty Near you (Haiti): empty state **without** red error.
- Before: user screenshot of red “Unable to load nearby businesses.”
- After screenshots: `/opt/cursor/artifacts/prod-restaurant-near-you-haiti.png`, `/opt/cursor/artifacts/prod-beauty-near-you-haiti.png`
