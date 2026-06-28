---
name: Flexa delivery pickup location (GPS overwrite bug)
description: Why a traveling seller's delivery pickup (collecte) showed the wrong city, and the field that causes it.
---

## The conflated field: users.location
- `users.location` (text) is overloaded: it is BOTH (a) the seller's pickup/business address AND (b) the buyer's browsing "city" used by the feed `scope=city` server-side filter. There is no separate pickup-address field in the schema.
- **Delivery pickup (collecte) is derived from `sellerUser.location`** in `artifacts/api-server/src/routes/transactions.ts` (pickupCity = sellerUser?.location ?? listing.city ...; appears in ~3 spots). The buyer purchase also sends `deliveryPickupCity: listingCity` from `ListingDetail.tsx`, but the server still prefers seller.location.

## The bug (reported: "livrezon pran location telefòn, pa adres mwen mete")
- `Home.tsx` `detectAndUpdateLocation()` (auto location mode) reverse-geocoded the phone GPS to a city and **PATCHed `/api/me/location` with `location` + `state`, silently overwriting `users.location`.** When a seller travels abroad, their pickup then showed wherever the phone was (e.g. West Palm Beach) instead of their entered business city (e.g. Delmas, Haiti).
- **Fix:** the GPS auto-detect now PATCHes ONLY `latitude`/`longitude` (kept for distance-based "nearby" browsing). It no longer writes `location`/`state`. `users.location` stays as the address the user set in their profile.
- Left intact on purpose: the **manual** city picker (`handleManualCitySelect`) still writes `location` — that is a deliberate user action, and the feed `scope=city` needs it. Only the silent GPS path was the bug.
- Existing already-corrupted accounts must re-set their profile city once; the fix only stops future corruption.
- Mobile app does NOT call `/api/me/location`, so this is a web-only fix.
