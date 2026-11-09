# Phase 2 — Milestone 2 Report

**Branch:** `cursor/native-android-migration-audit-b867`  
**PR:** #171  
**Updated:** 2026-11-09 (America/New_York)  
**Package:** `com.flexamarket.app` (config only; not published)  
**App name:** Flexa Market  
**Gates:** No merge / deploy / release AAB / Play publish without Sammy approval  

---

## 1. Completed screens & functionality

| Screen | Functionality |
|---|---|
| Home | Native feed via `GET /listings`, category chips, pull-to-refresh, pagination, skeletons, retry, country button |
| Search | Keyword + category chips + filters (condition, min/max price, city), pagination, retry |
| Categories | Full list from `GET /categories` |
| Category detail | Subcategory chips + filtered listings |
| Product details | Gallery, price, meta, seller, description, view ping, favorite toggle (auth), Android back, retry |
| Country picker | Canonical country names, detect suggestion, guest storage, first-time `PATCH /me/country` |
| Language picker | Local `LanguageContext` + optional `PATCH /auth/language` sync |
| Login | Native email/password + EULA ack against existing accounts |
| Profile | Account summary, links to country/language/categories + placeholders for later waves |

Navigation: expo-router tabs + stack, `ErrorBoundary`, safe areas, `useAndroidBack` on stack screens. **No WebView primary UI.**

---

## 2. Files created or modified (high level)

**Created:** `lib/countries.ts`, `lib/listingsQuery.ts`, `context/MarketplaceContext.tsx`, `hooks/useListingsFeed.ts`, `hooks/useAndroidBack.ts`, `components/StateView.tsx`, `components/CategoryChips.tsx`, `app/categories/index.tsx`, `app/categories/[slug].tsx`, `app/country-picker.tsx`, `tests/listingsQuery.test.ts`, this doc.

**Modified:** Home/Search/Profile/Login/Listing detail, root `_layout`, `lib/api.ts`, language picker, progress/compliance docs.

**Preserved:** Backend, website, Postgres, Wasabi, iOS bundle, digital-purchase guard, quarantined `LegacyWebViewShell.tsx`.

---

## 3. API integrations tested (live HTTPS)

| Call | Result |
|---|---|
| `GET /api/categories` | **200** — 22 parent categories |
| `GET /api/listings?country=Haiti` | **200** — total 36 |
| `GET /api/listings?country=HT` | **200** — total **0** (confirms ISO bug; fixed in app) |
| `GET /api/listings?country=Haiti&category=fashion` | **200** — total 9, slugs `fashion` |
| `GET /api/listings?country=Haiti&q=man` | **200** — total 6 |
| `GET /api/listings/1` | **200** — Haiti listing, 5 images |
| `GET /api/auth/detect-country` | **200** — detected USA (cloud IP / VPN flag) |
| `POST /api/auth/login` (unknown email) | **401** — expected rejection |

Favorite toggle / authenticated country PATCH not exercised without test credentials.

---

## 4. Actual automated test results

| Suite | Result |
|---|---|
| `npm run typecheck` (`@workspace/mobile`) | **PASS** |
| `node --test tests/listingsQuery.test.ts` | **PASS** (6/6) |
| Emulator / device UI navigation | **NOT RUN** |
| EAS AAB / Play upload | **NOT RUN** (forbidden) |

Do **not** treat device UX as verified.

---

## 5. Remaining work & blockers

- Sell, Inbox/Chat, Orders, Wallet, KYC, Boosts, Register, Settings (native waves)
- Phone-verified `POST /auth/change-country` for accounts that already have a country
- Firebase `google-services.json` for `com.flexamarket.app`
- Device/emulator proof of Back / gestures / offline
- Digital goods remain blocked until Play Billing verified
- Chat / offer / checkout on product details (documented stubs)

---

## 6. Google Play compliance risks

| Risk | Notes |
|---|---|
| Incomplete feature parity | Reviewer may judge thin marketplace if submitted now |
| Residual unused WebView code | Quarantined; not entry — keep out of routes |
| New package ≠ approval | Still requires native remediation narrative |
| Digital payments | Must stay blocked without Play Billing |
| Device evidence missing | Required before any Play submission |

**Submission stance:** **NO-GO**.

---

## 7. Recommended next milestone (wait for approval)

**Milestone 3 — Sell + Media:** native create/edit listing, Android Photo Picker, camera/video capture, Wasabi upload path, draft/publish rules — still no AAB/publish.
