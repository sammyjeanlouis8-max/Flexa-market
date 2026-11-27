# Flexa AI Product Verification — Production Readiness (Balanced)

**Branch:** `cursor/ai-product-verification-balanced-5a20`  
**Default Super Admin mode:** Balanced Enforcement (intended production default after monitoring calibration)  
**Principle:** Make selling easier, safer, and more accurate — not more complicated. Strict on safety, fraud, prohibited items, and obvious category violations. Flexible on photography, writing quality, minor classification differences, and legitimate seller behavior.

---

## 1. Decision model

| Decision | Seller effect |
|---|---|
| **APPROVED** | Immediate publish when mandatory checks pass |
| **APPROVED_WITH_SUGGESTIONS** | Publish + optional tips (never auto-applied) |
| **CORRECTION_REQUIRED** | HTTP 400 — fix taxonomy / substantial mismatch / missing required fields; form data preserved |
| **UNDER_REVIEW** | Listing saved pending human review (e.g. vehicles / high risk) |
| **REJECTED** | Block confirmed prohibited / serious policy violations; appeal available |
| **ANALYSIS_FAILED** | Deterministic checks continue; low-risk may publish via fallback; high-risk held |

Recommendations are **never mandatory** and **never silently rewrite** seller fields.

### Seller-friendly guarantees

| Rule | Behavior |
|---|---|
| No permanent reject on AI category alone | Category mismatch → `CORRECTION_REQUIRED` or challenge → publish; never `REJECTED` for category AI |
| Challenge incorrect AI tips | Seller can confirm category (`categoryChallengeAcknowledged`) and publish |
| No pro photography required | Any valid product image is enough |
| No arbitrary description length | Presence only; short copy is an optional tip |
| No forced rewrite of legitimate descriptions | Soft tips only |
| Price/stock-only updates | Skip AI / eligibility re-check |
| Low AI confidence | Not treated as suspicious; low-risk publishes |
| Human review reserved for | Significant safety, fraud, regulatory, or policy concerns |

---

## 2. Mandatory blocks (every mode)

Active in Monitoring Only, Balanced, and Strict:

1. No valid product image  
2. Missing required product information  
3. Invalid category / subcategory IDs  
4. Subcategory not under selected parent  
5. Clear substantial product–category mismatch (balanced/strict)  
6. Confirmed prohibited product / serious policy violation  

Non-blocking: short descriptions, spelling/grammar, Haitian Creole and other supported languages, nonprofessional photos, odd angles, background objects, packaging, used/damaged goods, unknown brands, minor category differences, low AI confidence.

---

## 3. Super Admin controls

| Endpoint | Purpose |
|---|---|
| `GET /admin/product-verification-policy` | Read mode, thresholds, budgets, fallback |
| `PUT /admin/product-verification-policy` | Update policy (Super Admin only) |

Configurable: mode (`monitoring_only` \| `balanced` \| `strict`), confidence thresholds, always/soft review category slugs, AI fallback allow low-risk, queue for later analysis, daily/monthly AI budgets, false-positive monitoring.

Stored in `platform_settings` key `product_verification_policy_v1`.

**Recommended rollout:** start `monitoring_only` → calibrate false positives/negatives → switch to `balanced` for production.

---

## 4. AI availability / fallback

Marketplace does **not** depend on external AI:

- Deterministic rules + taxonomy validation always run  
- Seller drafts remain local until publish  
- Existing eligibility / country / security gates unchanged  
- Low-risk: controlled fallback publish when AI fails (`fallbackAllowLowRisk`)  
- High-risk / regulated: hold for manual review  
- Mandatory safety restrictions never bypassed  

Seller assist: `POST /flexa-ai/product-assist` (rules-first tips; optional; never blocks form).

---

## 5. Seller UX (Sell flow)

- No extra verification pages  
- Image assist starts automatically after upload  
- Seller continues editing while analysis runs  
- One-click accept recommended category (optional)  
- Correction / reject responses keep entered data  
- Appeal: `POST /listings/:id/appeal`  
- Resubmit: `POST /listings/:id/resubmit` (re-runs balanced verification)

---

## 6. Existing listings

`softReviewExistingListing()`:

- Minor classification differences → notify / suggestions only  
- Confirmed prohibited → reject path  
- High unresolved safety → hold for review  
- **No** automatic delete/suspend for soft AI disagreements  

---

## 7. Test coverage

| Suite | Focus |
|---|---|
| `productEligibility.test.ts` | Allowed / prohibited / validation; balanced cosmetics soft-publish; strict cosmetics hold; vehicles review |
| `productVerification.test.ts` | Decisions, Creole, short desc tips, outage fallback, substantial mismatch, soft existing path |

Run: `pnpm --filter @workspace/api-server test -- productVerification productEligibility` (or package vitest script).

---

## 8. Preserved protections

- Country restrictions and listing-country binding  
- Stripe / delivery / subscription limits  
- Media enqueue / unapproved media privacy  
- Fraud engine assess on create  
- Public discovery still requires approved + available  
- Restaurant / other marketplace features unchanged  

---

## 9. Calibration checklist (before Strict)

- [ ] Monitoring phase on representative marketplace sample  
- [ ] Measure false positives (blocked legitimate sellers)  
- [ ] Measure false negatives (prohibited that published)  
- [ ] Tune `substantialMismatchConfidence` / category slug lists  
- [ ] Confirm AI budgets and fallback flags with Super Admin  
- [ ] Enable Balanced Enforcement for production  

---

## 10. Files

- `lib/productVerificationPolicy.ts` — modes & Super Admin policy  
- `lib/productVerification.ts` — decisions, suggestions, soft existing  
- `lib/productEligibility.ts` — soften review under balanced/monitoring + AI outage  
- `routes/listings.ts` — taxonomy parent check + verification on create/update/resubmit  
- `routes/admin.ts` — policy GET/PUT  
- `routes/flexaAi.ts` — product-assist  
- `marketplace/src/pages/Sell.tsx` — assist banner + one-click category  
