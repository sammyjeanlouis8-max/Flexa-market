# Phase 3Q — Production Boost recovery, auto-delivery & cross-platform validation

**Branch:** `cursor/native-phase3q-boost-recovery-09ff`  
**Base:** Phase 3P tip / Draft PR #191  
**Safety:** No merge · no DigitalOcean deploy · no Play submit · **no production row mutation**

## 1. Phase 3P verification

Preserved and re-tested:

| Check | Result |
|-------|--------|
| Seller Advantage+ country-wide (null dept/commune) | Pass — `applyAdvantagePlusCountryWideDelivery` + initiate/video-only |
| Custom targeting keeps departments/communes | Pass |
| Admin vs seller eligibility parity for Advantage+ | Pass (same null-geo feed rules) |
| Payment / moderation / expiry / schedule gates | Pass (unchanged feed SQL) |
| Country targeting always respected | Pass (`buildVideoListingEligibility` country condition) |

## 2. Production affected campaign count

**Not available in this agent environment** — `DATABASE_URL` / production credentials are not mounted here.

To obtain the count after API deploy (or via SQL):

1. Super Admin: `GET /api/admin/boosts/feed-delivery-audit`
2. Or Super Admin: `GET /api/admin/boosts/advantage-plus-geo-recovery-preview`
3. Or DBA: `scripts/boost-recovery/01_preview.sql` (`BEGIN READ ONLY`)

Fields returned (no email/phone): campaign id, advertiser id, targeting mode, country, department, commune, status, dates, impressions, exclusion reason.

## 3–5. Read-only recovery preview / proposed changes / rollback

| Artifact | Role |
|----------|------|
| `GET …/feed-delivery-audit` | Affected list + `recoveryPreview` |
| `GET …/advantage-plus-geo-recovery-preview` | Exact before→after geo clears |
| `scripts/boost-recovery/01_preview.sql` | Read-only SQL audit |
| `scripts/boost-recovery/02_apply.sql` | **Approval-gated**; ends in `ROLLBACK` until ops commit |
| `scripts/boost-recovery/03_rollback.sql` | Session snapshot restore |

**Proposed changes (Advantage+ only):** clear listing + boost dept/city/cities → NULL. Preserve country, ownership, moderation, payment, budgets, impressions, dates, analytics.

**Expired + zero impressions:** flagged `businessReviewRequired` — do **not** silently extend.

**Idempotent:** re-apply is no-op when geo already null.

## 6. Boost feed / Home two-video

| Surface | Change |
|---------|--------|
| Web Home | `limit=2` + hard `slice(0,2)`; tap → `/videos?video=` → watch feed |
| Native Home | Max two promo cards → `/promo-feed?video=` |
| Native `/promo-feed` | Paginated public feed; viewability single active player |

## 7. Audio synchronization

| Platform | Fix |
|----------|-----|
| Web `VideoFeed` | `useLayoutEffect` hard pause/mute; far cards clear `src`; AbortController cancels stale impression/analytics |
| Native `NativeVideoPlayer` | `active` prop stops/unloads previous; promo-feed mounts one active player |

Automated: source contracts. Physical device scroll A→B: **still required**.

## 8. Cross-platform validation evidence

| Layer | Status |
|-------|--------|
| Automated unit/contract tests | Pass (see CI / local vitest + node:test) |
| Web / iPhone Safari / Android Chrome / Native | Physical — pending |
| Seller / Admin / Super Admin scenarios | Physical — pending |
| Previously affected campaigns | Pending production read-only audit |

## 9. Remaining blockers

- Production read-only audit count (needs live Super Admin or DB)
- Explicit approval of recoveryPreview IDs before any APPLY
- Business review for expired paid zero-impression campaigns
- Physical FCM / OTP / scroll-audio device evidence
- Product variations API; Play digital goods; eSIM
- Legacy Vercel “Account is blocked” (DigitalOcean remains production)

## 10. Exact production deployment steps (awaiting approval)

1. Merge stack through #191 → this PR after review (human merge only).
2. Deploy DigitalOcean App Platform API + marketplace as today (no Vercel).
3. Super Admin run recovery preview endpoints; export CSV of approved boost IDs.
4. Human approval of ID list + confirmation expired rows go to business review.
5. DBA: edit `02_apply.sql` IN lists → run in transaction → verify counts → `COMMIT`.
6. Re-run preview (expect 0 overconstrained for approved set).
7. Smoke: seller Advantage+ appears for viewer in another department; Home shows ≤2 promos.

## 11. Required approvals

- [ ] Approve code PR stack merge
- [ ] Approve DigitalOcean deploy
- [ ] Approve recoveryPreview ID list for geo clear
- [ ] Approve business actions for expired unpaid-exposure campaigns (if any)
- [ ] Do **not** approve silent expiry extensions

## Inventory

Unchanged honesty: **75 / 1 / 1 / 1 / 5 of 83** (promo-feed is an additional native surface under existing promo/video domain; not claimed as a new FULLY_NATIVE inventory row until recount is intentional).
