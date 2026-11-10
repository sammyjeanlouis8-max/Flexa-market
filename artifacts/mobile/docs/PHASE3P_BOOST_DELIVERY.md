# Phase 3P — Critical Boost auto-delivery fix + Android validation

**Branch:** `cursor/native-phase3p-boost-fix-09ff`  
**Base:** Phase 3O tip / PR #189 (`5c85ff44`)  
**Safety:** No merge · no DigitalOcean deploy · no Play submit · no production row mutation · no real payments

## 1. Confirmed root cause (evidence)

Regular seller Advantage+ / video-only campaigns were stamped with the **seller’s department and commune** on `listings.boost_audience_state` / `boost_audience_city`.

`GET /api/videos/feed` applies `buildVideoListingEligibility` → `regularStateCondition` / `regularCityCondition`: viewers only see a promo when their profile state/city matches **or** those columns are `NULL`.

Admin / Super Admin free boosts left listing geo **null** (country-wide), so they appeared automatically. Seller Advantage+ rows did not — even when paid, approved, `is_boosted=true`, and within the delivery window. This is **not** a role ACL bug; it is a delivery-geo asymmetry.

| Path | Pre-fix geo on listing | Feed reach |
|------|--------------------------|------------|
| Admin free boost (`POST /admin/listings/:id/boost`) | country set; state/city typically null | Country-wide |
| Seller Advantage+ `POST /boost/initiate` | seller `state` + `location` forced | Seller commune only |
| Seller `POST /boost/video-only` | Haiti → `req.user.state ?? "Ouest"` + location | Seller dept only |
| Custom audience | Explicit departments/cities | Intentional narrow |

Secondary gates (unchanged, still enforced): `payment_status='paid'`, `is_boosted`, `boost_video_url`, moderation approved, start/expiry window, stock for non-ghost listings, `pending_review` until payment verify.

## 2. Files / services affected

- `artifacts/api-server/src/lib/boostTargeting.ts` — `applyAdvantagePlusCountryWideDelivery`, `isAdvantagePlusGeoOverconstrained`; validateAudience clears Advantage+ geo
- `artifacts/api-server/src/lib/boostFeedEligibility.ts` — pure Super Admin diagnostics
- `artifacts/api-server/src/routes/boost.ts` — initiate + video-only country-wide Advantage+
- `artifacts/api-server/src/routes/boosterPro.ts` — scheduled status when `startsAt` future
- `artifacts/api-server/src/routes/boostAnalytics.ts` — scheduled status + start fields
- `artifacts/api-server/src/routes/listings.ts` — legacy listing boost Advantage+ null cities
- `artifacts/api-server/src/routes/admin.ts` — free-boost custom vs Advantage+ geo; feed audit endpoints
- Tests: `boostFeedEligibility.test.ts`, `boostDeliveryPaths.test.ts`

## 3. Fixes implemented

1. Advantage+ delivery is **country-wide** (null dept/city) for sellers — same pool rules as Admin free boosts.
2. Custom targeting still requires / preserves departments/cities.
3. Campaign UI status can report **`scheduled`** when paid but `startsAt`/`boostStartAt` is in the future (feed already gated on start).
4. Super Admin read-only diagnostics:
   - `GET /api/admin/boosts/feed-delivery-audit`
   - `GET /api/admin/boosts/:boostId/feed-eligibility`

## 4. Affected seller campaigns (production)

**Not verifiable from this agent environment** (no production DB credentials / no live row mutation).

After deploy of diagnostics, Super Admin should call `feed-delivery-audit` and record `advantagePlusGeoOverconstrainedCount` + zero-impression active rows. Until then: **count = unknown (pending production read-only audit)**.

## 5. Recovery plan (requires explicit approval)

1. Run `GET /api/admin/boosts/feed-delivery-audit` (Super Admin).
2. Export campaigns with `advantage_plus_geo_overconstrained`.
3. After written approval only, clear geo columns for those Advantage+ rows (not budgets, not expiry):
   - `listings.boost_audience_state/city/cities → NULL`
   - `boosts.audience_state/city/cities → NULL`
4. Re-check per-campaign `feed-eligibility`; impressions must remain organic (do not fabricate).
5. Custom-geo campaigns with zero impressions: leave targeting; document “no matching viewers” — do not widen without seller consent.

## 6. Firebase (FCM) validation status

**PARTIALLY_NATIVE — physical device not verified in this phase.**  
Code paths (token register/refresh/logout, channels, deep links) unchanged from 3O. Checklist: `ANDROID_PUSH_DEVICE_TEST_PLAN.md`.

## 7. OTP / authentication status

Twilio phone OTP + `phoneToken` dual-channel preserved (Phase 3M). Animated country-flag globe preserved. **Physical OTP delivery not claimed verified** in this agent run.

## 8. Product variations

Still **MISSING**. Schema has optional `item_size` only — no SKU/variant inventory API. No endpoints invented.

## 9. Payment blockers

Unchanged: wallet top-up, subscription purchase, paid Boost launch, music purchase, eSIM → **BLOCKED** (Play digital goods / missing provider). Physical Stripe + BNPL preserved.

## 10. Route inventory (honest)

| Status | Count |
|--------|------:|
| FULLY_NATIVE | 75 |
| PARTIALLY_NATIVE | 1 (`push-fcm`) |
| PLACEHOLDER | 1 (`website-embed`) |
| MISSING | 1 (`product-variations`) |
| BLOCKED | 5 |

**75 / 1 / 1 / 1 / 5 of 83** — Boost delivery fix is backend; does not change native route counts.

## 11. Automated tests

See CI / local vitest for `boostFeedEligibility`, `boostDeliveryPaths`, plus prior boost/video suites. Distinguish from physical Android.

## 12. Physical Android requirements (remaining)

1. FCM E2E per `ANDROID_PUSH_DEVICE_TEST_PLAN.md`
2. Twilio OTP on device (request/verify/session)
3. Seller Advantage+ boost → confirm video appears for viewer in another department
4. Regression: Super Admin / Seller Center / Support / TV / Music / Orders / Auth globe

## 13. Remaining blockers

- Production geo recovery SQL (needs approval + live audit count)
- FCM physical proof
- Product variations API
- Play Billing for digital goods
- eSIM provider
- Legacy Vercel CI “Account is blocked” (DigitalOcean remains production)

## 14. Recommended Phase 3Q

1. Approved production Advantage+ geo recovery + monitoring dashboard on Super Admin native
2. Physical Android FCM + OTP session with signed evidence
3. Multi-SKU contract design (then native UI)
4. Play Billing counsel for digital goods only
