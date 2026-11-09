# Phase 2 — Milestone 4 Report

**Branch:** `cursor/native-android-migration-audit-b867`  
**PR:** #171  
**Updated:** 2026-11-09 (America/New_York)  
**Package:** `com.flexamarket.app` (not published)  
**App name:** Flexa Market  

---

## 1. Completed features

### Shopping cart
- Native `CartProvider` with AsyncStorage persistence (`flexamarket_cart`)
- Add / remove / quantity update (max 30) with stock checks when known
- Availability refresh against `GET /listings/:id` (removes sold/missing)
- Country mismatch warnings; empty state; totals (client estimate)
- Entry from listing detail + Profile

### Checkout (4 steps)
1. Shipping address (Haiti department/commune selection preserved)
2. Shipping options (Haiti local methods + delivery fee estimate via `POST /delivery/calculate-price`)
3. Payment — Stripe hosted checkout (`POST /stripe/checkout`) or Flexa Wallet (`POST /listings/:id/purchase` / multi-item `POST /cart/checkout`)
4. Confirmation + deep links to order detail

Server remains authoritative for prices, inventory, commissions, and payment. No card data stored in-app. Digital goods initiation paths remain blocked (not exposed in UI; helper covered by unit tests).

### Orders
- Buying / Selling lists (`GET /orders/purchases`, `GET /orders/sales`)
- Order detail: status, ship-to, commission/earnings, Haiti PIN (buyer only when policy says so), FM delivery tracking link, carrier tracking events when API returns them (never invented)
- Buyer cancel (`POST /transactions/:id/cancel`), confirm delivery, seller ship/reject where eligible
- Existing `delivery-tracking` screen retained for PIN/driver timeline

### Compliance / ecosystem
- No WebView primary UI for cart/checkout/orders
- Website, DO, Postgres, Wasabi, iOS, production payments configs untouched
- No AAB / merge / publish

---

## 2. Files created or modified (high level)

**Created:** `context/CartContext.tsx`, `lib/checkoutMath.ts`, `lib/haitiCommunes.ts`, `app/checkout.tsx`, `tests/checkoutMath.test.ts`, this doc.

**Reworked:** `app/cart.tsx`, `app/orders.tsx`, `app/orders/[id].tsx`, `app/stripe-checkout.tsx` (redirect), `app/sales.tsx` (redirect), listing detail buy/cart actions, `_layout.tsx` (+ CartProvider), profile cart link, progress/test docs.

---

## 3. APIs integrated

| API | Use |
|---|---|
| `GET /listings/:id` | Cart availability / stock |
| `GET /commission/quote` | Payment step estimate |
| `POST /delivery/calculate-price` | Haiti/local delivery fee estimate |
| `POST /stripe/checkout` | Hosted Stripe physical checkout |
| `POST /listings/:id/purchase` | Wallet single-item purchase |
| `POST /cart/checkout` | Multi-item wallet checkout |
| `GET /orders/purchases` / `sales` | Order lists |
| `GET /orders/:id` | Detail + Haiti PIN policy fields |
| `GET /orders/:id/tracking` | Carrier events when present |
| `POST /transactions/:id/cancel` | Buyer cancel |
| `POST /orders/:id/confirm-delivery` | Buyer confirm |
| `POST /orders/:id/ship` | Seller ship + tracking |
| `POST /orders/:id/seller-reject` | Seller reject/refund |
| `GET /delivery/tracking/:id` | Existing FM delivery screen |

---

## 4. Tests executed

| Suite | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| Unit: `checkoutMath` + prior sell/listings tests | **PASS** (14/14) |
| `nativePolicy.test.js` | **PASS** (3/3) |
| Live API auth gates: purchases, cart/checkout, stripe/checkout, commission quote → **401** without session | **PASS** |
| Authenticated paid checkout E2E | **NOT RUN** (no test buyer credentials; would create real charges/orders) |
| Android emulator UI | **NOT RUN** |
| Device UI | **NOT RUN** |
| AAB / Play publish | **NOT RUN** (forbidden) |

---

## 5. Remaining blockers

- Authenticated checkout E2E on emulator/sandbox Stripe when authorized
- Firebase for `com.flexamarket.app`
- Chat, Wallet top-up UI, KYC, Boost, Music, Notifications, Admin (later milestones)
- MonCash/NatCash/USDT manual verification UX not exposed in M4 (unfinished/ops-heavy on web)
- BNPL (Klarna/Affirm/Afterpay) intentionally not activated

---

## 6. Security & Google Play risks

| Risk | Notes |
|---|---|
| Real payments | Only via existing Stripe/wallet APIs; no card storage |
| Duplicate orders | Client submit lock + server idempotency / payment_ref uniqueness |
| Digital goods | Not offered; server guard still protects initiation routes |
| Incomplete feature parity | Still NO-GO for Play submission |
| New package ≠ approval | Remains true |
| Haiti PIN | Buyer-only display; no carrier POD substitution |

**Submission stance:** **NO-GO** for AAB / Play.

---

## 7. Branch / PR status

- Branch: `cursor/native-android-migration-audit-b867`
- PR: #171 (isolated; not for production merge without approval)

## 8. Recommended next milestone (await approval)

**Milestone 5 — Chat / Messaging + Notifications**  
Native inbox, listing chat threads, push re-wire after Firebase package cutover — still no AAB/publish.
