# Native batch 1 — pass report

**Platform:** Expo React Native (shared Android + iOS codebase)  
**Evidence build:** Expo web preview @ `http://127.0.0.1:8081` (Hermes transform) + production website `https://flexamarket.com`  
**Viewport:** 390×844 @2x  
**Backend:** DigitalOcean APIs via `https://flexamarket.com/api`  
**Captured:** 2026-11-21 (America/New_York)

Architecture map: `docs/native-webview-architecture-map.json`  
Screenshots: `releases/native-batch1-screens/*_side_by_side.png`

## Architecture (this PR)

| Target | Scope |
|--------|--------|
| **Native** | Navigation chrome, auth, browse, PDP, cart/checkout, orders, seller tools, messaging/tickets, Music/TV (placeholders where unfinished), driver tools (placeholders), account, admin placeholders |
| **WebView (SafeWebView)** | Privacy, Terms, About, Help Center articles, shipping/returns/refund policy text, seller policies, prohibited items, community guidelines, how-to guides |
| **Blocked** | Wallet, Card FM, transfers, digital purchases — never reopened via WebView |
| **Stripe** | Hosted Stripe in system browser / Custom Tabs — not Flexa WebView |

Actual Expo route modules: **53** (not invented to 84). Inventory previously claimed 82 features.

## First 10 native screens

| # | Screen | Native route | Result | Notes |
|---|--------|--------------|--------|-------|
| 1 | Home | `/` | **Pass** | Green header, menu, 2-col grid, category strip + Shop by Category, product photos |
| 2 | Categories | `/categories` | **Pass** | New native route; chips + 2-col listings by slug |
| 3 | Search results | `/search` | **Pass** | 2-col results; Categories entry; query `ventilateur` |
| 4 | Product details | `/listing/[id]` | **Pass** | Thumbnails change main image; Message + Add to Cart above safe area; seller opens storefront |
| 5 | Seller storefront | `/seller/[id]` | **Pass** | New native route matching `/profile/:id` web |
| 6 | Cart | `/cart` | **Pass** | Line items, qty, Stripe checkout CTA |
| 7 | Checkout address | `/checkout` step address | **Pass (UI)** | Multi-step screen; address form evidence via `checkout-steps-preview` (Expo web deep-link race on `/checkout`) |
| 8 | Shipping options | `/checkout` step shipping | **Pass (UI)** | Motorcycle / Car methods |
| 9 | Payment selection | `/checkout` step payment | **Pass (UI)** | Stripe-only; wallet/Card FM explicitly excluded |
| 10 | Order confirmation | `/checkout-success` | **Pass** | Test order params; Stripe-only copy |

## Unverified / limited

- **Android emulator ADB** stayed offline during this run — evidence is Expo web preview of the same RN screens, not a device APK session.
- **Live `/checkout` deep-link on Expo web** throws Root Layout race; production path is **Cart → Checkout** (`router.push` from mounted Cart). Full signed-in Stripe pay end-to-end not re-run here (`/auth/me` rate-limited 429 during capture).
- **Website vs app country:** website geo often USA; app default Haiti — product grids differ by market.
- **Phone login / biometric** still missing native UI (not WebView).
- **Jobs / CalcAI / commission promo / referrals** removed from WebView allowlist (unclassified vs architecture lists).

## Fixes in this batch

- WebView allowlist reduced to legal/FAQ/guides only  
- Native forgot-password route  
- Categories + seller storefront routes  
- Home green header + menu + category UI  
- PDP thumbnail gallery + tappable seller  
- Cart checkout gate: token-only (tolerate rate-limited `/auth/me`)  
- Checkout multi-step preserved (address → shipping → payment → review)
