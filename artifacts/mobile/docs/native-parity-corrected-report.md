# Flexa Market mobile parity — corrected report

**Captured:** 2026-11-21 (America/New_York)  
**Account:** superadmin test (`FLEXA_TEST_SUPERADMIN`), user id 1, country Haiti, language EN  
**Shared order:** `#FM-000040` / API id `40` (Ventilateur) · Support ticket id `1` · Listing `73`  
**Viewport:** 390×844 @2x  
**Evidence platform:** Website `https://flexamarket.com` vs Expo web preview of shared React Native (Android + iOS codebase)  
**Device APK/IPA:** **BLOCKED** — Android emulator ADB offline; no iOS simulator in this environment  

**100% visual+behavioral match is NOT claimed.** This report corrects prior invalid Sign-In comparisons, inventories routes, and records PASS / FAIL / BLOCKED honestly.

---

## 1. Invalid comparisons — retracted

Prior batch 2/3 (and parts of batch 1) compared native screens to **unsigned** website captures that showed Sign In, settings auth-gates, Home, empty cart, or invalid checkout session.

| Prior capture | Problem | Correction |
|---------------|---------|------------|
| Batch2 My Orders / Order details | WEB = Sign In | Re-captured authenticated `/orders` + `/orders/40` (same IDs on both sides) |
| Batch2 Tracking | WEB = Home (`/`) | Re-captured `/delivery/tracking/40` |
| Batch2 Favorites, Addresses, Inbox, Notifications, Account | WEB = Sign In / settings gate | Re-captured with `flexamarket_token` seeded |
| Batch3 Sell, listings, sales, offers, support, edit profile, FlexaBot | WEB = Sign In / landing gates | Re-captured authenticated (edit profile still BLOCKED on web) |
| Batch1 Checkout address/shipping/payment | WEB = empty `/cart` | Marked **FAIL/BLOCKED** until web checkout step URLs are reachable with same cart |
| Batch1 Order confirmation | WEB = “Payment not confirmed” | Marked **BLOCKED** without a live Stripe success session |

Script: `scripts/parity-auth-recapture.mjs`  
Corrected shots: `releases/parity-corrected-screens/`  
Machine JSON: `releases/parity-corrected-screens/parity-corrected-report.json`

---

## 2. Screen classification & inventory

Expected product surfaces from the parity brief were enumerated (**88** rows across groups).  
Actual Expo Router modules under `app/` (**55**, excluding layouts / not-found).  
**Do not invent routes to reach 84.** Architecture map remains the source of truth for shipped modules.

Full JSON: `docs/parity-screen-inventory.json`

| Group | Expected | Intended |
|-------|----------|----------|
| Navigation & account | 12 | Native |
| Shopping | 9 | Native |
| Checkout | 5 | Native (+ Stripe system browser) |
| Orders | 5 | Native |
| Selling | 10 | Native (boost paid BLOCKED on Android) |
| Communication | 5 | Native |
| Media | 14 | Music Native; Flexa TV PLACEHOLDER; paid boost BLOCKED |
| Operations | 9 | Driver/admin PLACEHOLDER |
| Read-only WebView | 13 | SafeWebView allowlist |
| Release-restricted | 6 | Wallet / Card FM / eSIM / loans / digital purchases **BLOCKED** — preserved |

### Release restrictions (preserved)

- Wallet, Card FM, transfers, eSIM catalog: **BLOCKED** (not reopened via WebView)  
- Android digital goods (boost pay, subscriptions, music buy): **BLOCKED** until Play Billing  
- Stripe physical checkout: system browser / Custom Tabs only  

---

## 3. Same-state authenticated re-capture results

Legend: **PASS** = same screen/state verified and no material visual/behavior mismatch remaining after fixes in this PR.  
**FAIL** = correct screen/IDs but confirmed mismatch vs website reference.  
**BLOCKED** = could not complete fair test (auth, missing route, no device, no checkout session).

| Screen | Web ref | Native | Main action | Result |
|--------|---------|--------|-------------|--------|
| My Orders (All) | `/orders` | `/orders` | Open list; same `#FM-000040` + `#FM-000001` | **FAIL*** |
| Order details #40 | `/orders/40` | `/orders/40` | Open same order | **FAIL*** |
| Favorites | `/saved` | `/favorites` | Open saved grid | **FAIL** |
| Addresses | `/settings/addresses` | `/addresses` | Open address book | **FAIL** |
| Inbox | `/messages` | `/inbox` | Open conversations | **FAIL** |
| Notifications | `/settings/notifications` | `/notifications` | Open feed | **FAIL** |
| Account / Settings | `/settings` | `/profile` | Open hub | **FAIL** |
| Sell | `/sell` | `/sell` | Open create form | **FAIL** |
| Seller sales | `/sales` | `/sales` | Open dashboard | **FAIL** |
| Private offers | `/offers` | `/offers` | Open offers | **FAIL** |
| Support tickets | `/support` | `/support` | Open tickets | **FAIL** |
| Support ticket #1 | `/support/1` | `/support/1` | Open thread | **FAIL** |
| FlexaBot | `/chatbot` | `/chatbot` | Open bot | **FAIL** |
| Cart (seeded listing 73) | `/cart` | `/cart` | View line item | **FAIL** |
| PDP gallery listing 73 | `/listings/73` | `/listing/73` | View product | **FAIL** |
| Delivery tracking | `/delivery/tracking/40` | `/delivery-tracking` | Open tracking | **FAIL** |
| My listings | `/sell` (no distinct web URL) | `/my-listings` | Open inventory | **FAIL** |
| Edit profile | `/profile/edit` | `/edit-profile` | — | **BLOCKED** |
| Checkout address/shipping/payment (web steps) | cart checkout sheet | `/checkout` multi-step | — | **BLOCKED** |
| Order confirmation (live Stripe) | `/checkout/success` | `/checkout-success` | — | **BLOCKED** |
| Android device proof | — | — | — | **BLOCKED** |
| iOS device proof | — | — | — | **BLOCKED** |

\*Orders/detail: **same-state content is verified** (same filter All, same order IDs). Marked FAIL because chrome (top icons / bottom tabs), card density, timeline, and payment-summary layout still differ from the website reference. List UI was tightened in this PR (heading, green filters, outline Delivered badge, ref+price row); cancelled Flexa-delivery card no longer contradicts Delivered status; escrow released banner added.

### Edit profile BLOCKED — steps tried

1. Seeded `localStorage.flexamarket_token` (same token that loads `/orders`).  
2. Opened `/profile/edit` → redirected to `/auth/login`.  
3. Tried `/settings/profile`, `/settings/edit` → 404.  
4. `/settings` still shows “Sign in to access your settings” in Playwright despite token (orders/settings split).  
5. Native `/edit-profile` loads with seeded token.  
→ **BLOCKED** for fair WEB|APP pair until website edit-profile accepts the same session.

### Totals (this corrected pass)

| | Count |
|--|------:|
| Authenticated same-state pairs attempted | 18 |
| Content same-state verified (not Sign-In) | 17 |
| Visual/behavior **PASS** (100% match) | **0** |
| **FAIL** (mismatch vs web reference) | **17** |
| **BLOCKED** | **1** (+ checkout/confirmation/device rows above) |
| Expected inventory rows | 88 |
| Actual Expo route modules | 55 |

---

## 4. Fixes applied in this correction pass

- Authenticated parity recapture script (rejects Sign-In WEB columns)  
- Orders list closer to website: “My Orders” heading, green active chips, outline Delivered badge + date, ref+price row  
- Order detail: hide cancelled Flexa delivery when order already delivered/completed; show escrow released banner  
- Account hub: Settings title, avatar initial, action tiles (Add product / videos / boosts / drafts), link subtitles, Sign out moved to footer  
- Inventory JSON + this corrected report  
- Prior batch 2/3 “Pass” claims for auth-gated WEB columns are **retracted**

### Known remaining mismatches (outstanding)

1. Native stack screens omit website top chrome (bell/cart badges) and often omit website bottom tab bar  
2. Account hub vs Settings: structure improved but still not 1:1 (menu labels, Security & Login rows, payment rows)  
3. Order detail lacks website timeline stepper / “Total you pay” summary layout  
4. Order `#FM-000001` API currency is HTG (`G98.99`); website shows `$98.99` — native follows API  
5. Phone login missing on native Sign In  
6. Flexa TV / driver / admin still placeholders  
7. Checkout web step URLs not captured as discrete same-state pairs  
8. `/profile/edit` web session incompatible with token seed used elsewhere  
9. Android/iOS device screenshots not available this run  

---

## 5. How to re-run

```bash
# token from FLEXA_TEST_SUPERADMIN login → /tmp/fm_token.txt
cd artifacts/mobile
npx expo start --web --port 8081 --clear
cd /tmp/pw-shot && OUT_DIR=/opt/cursor/artifacts/parity-corrected \
  REPO_OUT=/path/to/artifacts/mobile/releases/parity-corrected-screens \
  ORDER_ID=40 SUPPORT_ID=1 node parity-auth-recapture.mjs
```

Claim **100% match** only when every required row is PASS on Android and iOS device builds with matching visual overlays — not yet.
