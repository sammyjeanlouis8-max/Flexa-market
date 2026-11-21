# Native batch 2 — pass report

**Platform:** Expo React Native (shared Android + iOS codebase)  
**Evidence build:** Expo web preview @ `http://127.0.0.1:8081` (Hermes transform) + production website `https://flexamarket.com`  
**Viewport:** 390×844 @2x  
**Backend:** DigitalOcean APIs via `https://flexamarket.com/api`  
**Captured:** 2026-11-21 (America/New_York)

Architecture map: `docs/native-webview-architecture-map.json`  
Screenshots: `releases/native-batch2-screens/*_side_by_side.png`  
Catalog: `lib/batch2Pages.ts`

## Scope (batch 2)

Next 10 native screens after shopping: auth, account hub, orders, tracking, favorites, addresses, inbox, notifications. Auth-gated UI evidence uses `batch2-preview/[slug]` (same RN components / mock layout as production routes) so Expo web can capture without a live session.

## Next 10 native screens

| # | Screen | Native route | Result | Notes |
|---|--------|--------------|--------|-------|
| 1 | Login | `/auth/login` | **Pass** | AuthGlobe header + form; matches web closely (phone login still missing on app) |
| 2 | Register | `/auth/register` | **Pass** | Native signup form aligned with web |
| 3 | Account | `/(tabs)/profile` | **Pass** | Guest hub with Sign in CTA + native menu (Music, orders, favorites, addresses, …) |
| 4 | My Orders | `/orders` | **Pass (UI)** | Filters + order cards via `batch2-preview/orders` (web `/orders` redirects to login when signed out) |
| 5 | Order details | `/orders/[id]` | **Pass (UI)** | Detail layout via `batch2-preview/order-detail` |
| 6 | Delivery tracking | `/delivery-tracking` | **Pass (UI)** | Haiti delivery timeline via `batch2-preview/tracking` |
| 7 | Favorites | `/favorites` | **Pass (UI)** | 2-col `ListingCard` grid; preview uses sample listings |
| 8 | Addresses | `/addresses` | **Pass (UI)** | Address cards + Add address; web settings gate when signed out |
| 9 | Inbox | `/(tabs)/inbox` | **Pass (UI)** | Flexa Chat filters + threads via `batch2-preview/inbox` |
| 10 | Notifications | `/notifications` | **Pass (UI)** | Notification rows via `batch2-preview/notifications` |

## Unverified / limited

- **Auth-gated website pages** (`/orders`, `/messages`, `/saved`, `/settings/addresses`, `/settings/notifications`) show login or settings sign-in walls when capturing unsigned — expected. App column uses batch2 preview / guest account hub for visual evidence.
- **Android emulator ADB** still offline — evidence is Expo web preview of the same RN screens, not a device APK session.
- **Live signed-in capture** not re-run (`/auth/me` rate-limited earlier in this agent run).
- **Phone login / biometric** still missing native UI (called out in batch 1 as well).

## Fixes / additions in this batch

- `lib/batch2Pages.ts` — catalog of the 10 batch-2 screens  
- `app/batch2-preview/[slug].tsx` — authenticated-UI previews for screenshot capture  
- Favorites screen uses 2-col `ListingCard` grid  
- `tests/nativeBatch2Screens.test.js` — catalog + route existence checks  
- `scripts/native-batch2-screenshots.mjs` — Playwright side-by-side capture  

## Verification

- `node --test tests/nativeBatch2Screens.test.js` — 3/3 pass  
- `tsc -p tsconfig.json --noEmit` — clean  
- 10/10 side-by-side PNGs written under `releases/native-batch2-screens/`
