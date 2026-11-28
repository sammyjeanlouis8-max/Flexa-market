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

Beauty discover already returned **200** `{ businesses: [], total: 0 }` for Haiti (no red error on hub).

## Fixes

1. Migration `restaurant_country_ht_public_launch.v1` — approve/enable Haiti for restaurants, food trucks, home kitchens, catering (US/CA stay suspended).
2. Migration `beauty_country_ht_public_launch.v1` — approve/enable Haiti for Séduire Beauty.
3. Defaults in `restaurantCountryPolicy.ts` updated so Haiti seeds as public.
4. Discover without country → **200 empty** with `COUNTRY_REQUIRED` (not 400).
5. Web + mobile Discover: classify `COUNTRY_*` / regulatory 403 as soft empty/restricted — not red load error.
6. Empty state: “No restaurants available near you yet.” + Change location / Expand radius / Use GPS / Browse.

## Validation

- api-server `src/tests/restaurant*` → pass
- After deploy: launch `countryPolicy.HT.publiclyActive` must be `true`; discover Haiti must be **200**.
