# Flexa Market — Product Eligibility & Marketplace Compliance

**Branch:** `cursor/product-eligibility-compliance-9bdb`  
**Constraint:** Do not invent legal restrictions; do not auto-approve uncertain regulated goods; no production data changes / no deploy from this doc alone.

---

## 1. Official policy references (platform store compliance)

These are **store / UGC program policies**, not country-specific criminal codes. Flexa Market’s product rules align with common marketplace UGC obligations:

| Source | Relevant sections (verify current text on publisher site) |
|---|---|
| [Google Play Developer Program Policies](https://play.google.com/about/developer-content-policy/) | User Generated Content; Restricted Content; Illegal Activities; Intellectual Property |
| [Google Play — User Generated Content](https://support.google.com/googleplay/android-developer/answer/9876937) | UGC policy, moderation, in-app reporting / blocking |
| [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | **1.2** User Generated Content; **5** Legal; Safety / objectionable content |
| Flexa Market | In-app `/prohibited-items` (existing seller-facing policy page) |

**Principle:** Uncertain or jurisdiction-sensitive categories are **REQUIRES_REVIEW** (human), never auto-approved as ALLOWED by guesswork.

---

## 2. Audit summary (before changes)

| Area | Finding |
|---|---|
| Create path | `POST /listings` + web `Sell.tsx`; mobile Sell is WebView → same web rules |
| Status fields | `status`: available / sold / removed / hidden; `moderationStatus`: approved / pending / rejected |
| Rules engine | `lib/moderation.ts` — weapons, drugs, animals, sexual, violence, hate + medium carve-outs |
| AI | Optional OpenAI; **fail-open to rules** (not sole gate) |
| Public feeds | Require `available` + `approved` |
| Gaps | No durable ALLOWED/REQUIRES_REVIEW/PROHIBITED class; updates skip re-moderation; pending counts toward listing limits; boost not gated on approval; no seller appeal/resubmit; report seller UI weak |

Desired lifecycle enums are **mapped** onto existing columns plus new `eligibility_class` / `lifecycle_status` (additive) so production rows stay valid.

---

## 3. Safe implementation plan

1. Add centralized `productEligibility.ts` (rules-first, AI assist only).
2. Persist `eligibility_class` + `lifecycle_status` (+ appeal fields).
3. Run eligibility on **create and content update**.
4. Gate boost / ads / public discovery on published (= available + approved).
5. Fix active-listing counts to exclude non-approved.
6. Seller appeal + resubmit (re-run eligibility).
7. Report listing / report seller / block seller (API already; strengthen seller report UX).
8. Automated tests for allowed / prohibited / restricted / suspended / reported paths.
9. Keep Android/iOS on shared web Sell + same APIs (no platform bypass).

---

## 4. Classification model

| Class | Meaning | Publication |
|---|---|---|
| **ALLOWED** | Ordinary compliant goods (clothing, electronics, furniture, books, household) | Auto-publish when validation passes |
| **REQUIRES_REVIEW** | Regulated-seeming / ambiguous (food, cosmetics, medical-adjacent, vehicles, toys resembling weapons, etc.) | Pending human review — **not** auto-approved |
| **PROHIBITED** | Illegal drugs, real weapons/ammo, explicit sexual products, live animals for sale, stolen/counterfeit indicators, hate/violence-for-hire signals | Rejected / not discoverable |

---

## 5. Lifecycle mapping (additive)

| Lifecycle | How stored |
|---|---|
| DRAFT | Client localStorage only (unchanged) — server draft deferred |
| PENDING_REVIEW | `moderation_status=pending`, `lifecycle_status=pending_review` |
| APPROVED | `moderation_status=approved` (may still be unpublished) |
| PUBLISHED | `status=available` + `moderation_status=approved` + `lifecycle_status=published` |
| REJECTED | `moderation_status=rejected`, usually `status=removed` |
| SUSPENDED | Admin suspension: `lifecycle_status=suspended`, removed from discovery |
| SOLD | `status=sold` |
| ARCHIVED | Seller/admin archive: `status=removed`, `lifecycle_status=archived` |

---

## 6. Remaining manual compliance reviews

- Country-specific licensing (pharmacy, alcohol, tobacco, firearms licenses) — **manual / legal counsel**
- Trademark / brand authentication disputes — admin ops
- Native Expo Sell UI beyond WebView — out of scope; compliance is server-enforced for all clients
- Raising Google/Apple privacy questionnaires — product/legal ops

---

## 7. Final implementation report

### Files changed (high level)
- `artifacts/api-server/src/lib/productEligibility.ts` — centralized policy
- `artifacts/api-server/src/lib/migrations.ts` — eligibility/lifecycle/appeal columns
- `lib/db/src/schema/listings.ts` — schema fields
- `artifacts/api-server/src/routes/listings.ts` — create/update re-check, appeal/resubmit, discovery gates
- `artifacts/api-server/src/routes/boost.ts` — boost only for published listings
- `artifacts/api-server/src/routes/admin.ts` — approve/reject sync + suspend
- `artifacts/api-server/src/tests/productEligibility.test.ts`
- `artifacts/marketplace/src/pages/ListingDetail.tsx` — Report seller
- `artifacts/marketplace/src/pages/Profile.tsx` — rejection reason + appeal/resubmit/edit
- `docs/PRODUCT_ELIGIBILITY_COMPLIANCE.md`

### Migrations
- `listings.eligibility_class`, `lifecycle_status`, `rejection_code`, appeal_* columns
- Backfill from existing moderation/status
- Indexes on lifecycle/eligibility

### Validations implemented
- Title ≥ 3, description ≥ 10, ≥1 image (create still requires 2 photos at API edge)
- Rules-first PROHIBITED (drugs, weapons, animals, sexual, violence, hate, counterfeit/stolen language)
- Category-driven REQUIRES_REVIEW (food/cosmetics/medical/vehicles…) — **never auto-ALLOW**
- Re-evaluation on content update; boost blocked unless published
- Active listing caps count only approved+available (non-suspended)

### Tests
- `pnpm exec vitest run src/tests/productEligibility.test.ts src/tests/moderation.test.ts` → **25 passed**

### Cross-platform
- Android/iOS Sell WebView + web Sell share the same `/api/listings` eligibility — no client-only bypass

### Not done / deferred
- Server-side DRAFT rows (client localStorage remains)
- Full native Expo sell form (WebView continues)
- Country licensing matrices (legal review)
- OpenAPI enum regeneration for new response fields (fields returned in formatListing)
