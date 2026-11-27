# Flexa Restaurant — Business Registration / Onboarding Report

**Branch:** `cursor/restaurant-onboarding-fix-5a20`  
**Date:** 2026-11-27 (America/New_York)  
**RESTAURANT_PUBLIC_LAUNCH:** remains **disabled** (Super Admin preview only)

---

## Root cause of missing form fields

| Finding | Detail |
| --- | --- |
| Historical bug | Basics step used lowercase `<basicsFormFields />` / `<motionFormFields />`, so React treated it as an unknown DOM element and **rendered no form fields**. Fixed earlier on main (`BasicsFormFields` PascalCase). |
| Remaining product gaps (this PR) | Wizard was still **5 steps** with location mixed into Basics; hours used a cramped 2-column time grid that overlapped on narrow screens; food-safety notice text was duplicated; Identity/Food Safety links lacked `?rid=` until after final create; mobile used URL text fields instead of Wasabi uploads; API create only hard-required name/country/city. |

This PR does **not** hide validation errors. Continue is blocked per step; backend enforces incomplete payloads and image-before-review.

---

## Implemented corrections

### Web (`AddRestaurant.tsx`)
- **6 steps:** Business → Location → Hours → Identity → Food Safety → Review
- Photographic **category cards** (Restaurant, Home Kitchen, Food Truck, Bakery, Catering)
- Required **business name**, type, cuisine, description, phone; optional email
- **Logo + cover** upload cards (Wasabi), replace/remove, initials logo generator
- Location: country allowlist (US/CA blocked), region, city, address, **pickup address**, lat/lng, **Use current location**, WhatsApp; Home Kitchen privacy notice
- **Per-day hours** (Mon–Sun) with closed / 24h / overnight; stacked time inputs (no overlap)
- Fulfillment, delivery zones/fees/prep, dine-in/reservations where applicable
- Draft create before Identity so `?rid=` works; Save Draft; local draft autosave `v2`
- Review preview with edit shortcuts; **Submit for review** → `status: submitted` (not auto-publish)

### Mobile (`artifacts/mobile/app/restaurant/add.tsx`)
- Matching 6-step flow, ImagePicker + Wasabi (`uploadLocalFile`), per-day hours, pickup address, geolocation, safe-area footer

### Backend (`restaurants.ts`)
- Whitelist of five business types
- Create requires region, address, phone, description, cuisine
- Optional `contactEmail` stored in `permitsNote` (`contactEmail:…`) — no new paid infra
- Submit requires logo or cover; soft-gate for under-review jurisdictions; US/CA still hard-blocked
- `foodResponsibilityAccepted` on PATCH; publish still requires IDV + food safety

### i18n
- EN + HT + FR + ES strings for new step labels, validation, submit, location, hours

---

## Database migrations

| Item | Status |
| --- | --- |
| New paid infrastructure | None |
| New required columns | None (email via `permitsNote` prefix) |
| Existing restaurant / hours / delivery / IDV / food-safety tables | Reused |

---

## API validation

| Check | Status |
| --- | --- |
| Invalid business category | `400 INVALID_BUSINESS_TYPE` |
| Incomplete create payload | `400 INCOMPLETE_BUSINESS_INFO` |
| US/CA public registration | `403 COUNTRY_DISABLED` |
| Image before review submit | `400 IMAGE_REQUIRED` |
| Owner-managed delivery default | `ownerManagedDelivery: true` |
| Auto-publish on submit | No — `submitted` only |

---

## Wasabi upload verification

| Check | Status |
| --- | --- |
| Web uses `/api/storage/uploads/request-url` + put | PASS (existing `uploadRestaurantFoodImage`) |
| Mobile uses `uploadLocalFile` | PASS |
| Initials logo uploaded as SVG file (not data-URL stored as permanent DB URL) | PASS |
| Persist after refresh / re-login | NOT TESTED in live browser this run (code path stores returned object URL) |

---

## Screenshots

| Artifact | Status |
| --- | --- |
| Step 1–6 registration screenshots | **NOT TESTED** — live authenticated Super Admin session not available in this agent run |
| Owner dashboard screenshots | **NOT TESTED** (OwnerDashboard already exists; no visual capture this run) |

Do not treat placeholders as evidence. Capture on staging after merge with a staff preview account.

---

## Test results

| Suite | Result |
| --- | --- |
| `restaurantOnboardingValidation.test.ts` | PASS |
| `restaurantCountryPolicy.test.ts` / `restaurantSchedule.test.ts` | PASS |
| `AddRestaurant.onboarding.test.ts` (structure) | PASS (7/7) |
| Marketplace production build (`vite build`) | PASS |
| Full E2E all five business types | NOT TESTED |
| Admin approval → public publish | NOT TESTED (launch flag off) |
| Unauthorized country / API | Covered by unit/source assertions; live HTTP NOT TESTED |
| iOS / Android device | NOT TESTED (code parity shipped) |

---

## Requirement matrix

| Requirement | Result |
| --- | --- |
| Business name / logo / cover / type cards | PASS |
| Cuisine, description, phone, optional email | PASS |
| Initials logo for small businesses | PASS |
| ≥1 image before review | PASS (API + UI) |
| Country / region / city / address / pickup / map / geolocation | PASS |
| Home Kitchen address privacy | PASS |
| Food truck operating location after reg | PASS (existing endpoint; note in UI) |
| US/CA unavailable | PASS |
| Per-day hours, closed, 24h, overnight | PASS |
| Temp closure / fulfillment / zones / fees / prep | PASS |
| Holiday hours UI | FAIL (not a dedicated UI; owners can mark days closed) |
| Owner-managed delivery only / no Flexa Driver | PASS |
| Identity reuse + private docs | PASS (existing IDV + rid links) |
| Country/type-specific food safety (not identical) | PASS (copy + lighter home-kitchen note; full quiz on dedicated page) |
| Review preview + edit + submit | PASS |
| Statuses draft / under review / correction / approved / rejected / suspended | PASS (existing status model; submit → `submitted`) |
| Owner status notifications | NOT TESTED / partial (existing infra; no new push this PR) |
| Draft autosave + recovery | PASS (localStorage / AsyncStorage) |
| Owner dashboard sections | PASS (existing OwnerDashboard) |
| Multilingual EN/HT/FR/ES | PASS (key strings); other Market langs inherit EN defaults |
| RESTAURANT_PUBLIC_LAUNCH disabled | PASS |
| Native store submission | BLOCKED (not authorized) |

---

## PR / commit / deploy

| Item | Value |
| --- | --- |
| PR URL | https://github.com/sammyjeanlouis8-max/Flexa-market/pull/312 |
| Commit SHA | `9444cbf4f867223d0ed6b3fcfb019dd3d6ad4005` |
| Deployment | Pending merge of #312 to `main` → DigitalOcean `deploy.yml`. Staging validation required before treating as live. |
| Remaining blockers | Authenticated screenshot/E2E suite; holiday-hours UI; public launch still gated; contact-system follow-up queued separately |

---

## Remaining blockers

1. Capture real screenshots on staging with Super Admin preview login.
2. End-to-end registration for all five types against Neon + Wasabi.
3. Explicit holiday-hours editor (currently day closed / temporary closure only).
4. Keep `RESTAURANT_PUBLIC_LAUNCH=false` until regulatory approval.
