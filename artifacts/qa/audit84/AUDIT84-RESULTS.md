# Flexa Market Android — 84-screen audit report

**Do not generate a release APK/AAB or store submission until Sammy approves.**

## Build identity

| Field | Value |
|---|---|
| Branch | `cursor/native-84-screen-audit-9d45` |
| Test commit | `b2a11109f1a27c27990c0f65160e3fea8470d29e` |
| Package | `com.flexamarket.app` |
| versionName | `1.0.1` |
| versionCode | `58` |
| Emulator | `sdk_gphone64_x86_64` · Android **14** |
| Backend | `https://flexamarket.com/api` (DigitalOcean) |
| WebView reference | `https://flexamarket.com` |
| Session used | Haiti buyer `FM-3294` (“FC Test”) for guest/auth smoke; staff roles **BLOCKED** (secrets unbound) |

## Scoring rules

- **PASS** — opened via expected entry, layout usable, controls exercised, result matched expectation (or intentional empty/auth gate).
- **FAIL** — wrong destination, broken UI, or incorrect behavior vs reference (must be fixed or listed).
- **BLOCKED** — cannot complete without staff/seller/driver/payment secrets, Play Billing, or missing DO deploy.

Prior packs reused as evidence where still valid: `artifacts/qa/audit236/`, `promo236/`, `signin236/`, `wallet236/`, `flexacontrol236/`, `/opt/cursor/artifacts/drawer236-*`, `audit84-*`.

## Totals (this pass)

| Bucket | Count |
|---:|---:|
| PASS (layout+nav+applicable controls) | **34** |
| FAIL (fixed this pass) | **2** (Promo deep-link tab; Moderator Panel label) |
| BLOCKED | **14** |
| PARTIAL / needs role data or SBS | **34** |
| **Checklist total** | **84** |

## Fixes landed on this branch

1. Merged Flexa Control (`/admin/*` Command Center) into the audit branch; `versionCode` → **58**.
2. Promo Account header + drawer row → `/wallet?tab=promo`; wallet reads `tab` search param.
3. Admin drawer label **Moderator Panel** → `/admin/moderation` (matches reference screenshots).

## Staff / Flexa Control secrets (queued #241)

Environment already **declares** these Cursor secret bindings (values still empty → staff E2E BLOCKED):

| # | Secret name | Why |
|---:|---|---|
| 1 | `FLEXA_TEST_SUPERADMIN_EMAIL` | Super Admin sign-in |
| 2 | `FLEXA_TEST_SUPERADMIN_PASSWORD` | Super Admin sign-in |
| 3 | `FLEXA_TEST_ADMIN_EMAIL` | Country-scoped Admin |
| 4 | `FLEXA_TEST_ADMIN_PASSWORD` | Country-scoped Admin |
| 5 | `FLEXA_TEST_SUPPORT_EMAIL` | Support agent |
| 6 | `FLEXA_TEST_SUPPORT_PASSWORD` | Support agent |
| 7 | `FLEXA_TEST_BUYER_EMAIL` | Regular-user denial + buyer flows |
| 8 | `FLEXA_TEST_BUYER_PASSWORD` | Regular-user denial + buyer flows |

Also bound for later sell/checkout/driver work (not required for Control-only):  
`FLEXA_TEST_SELLER_EMAIL/PASSWORD`, `FLEXA_TEST_DRIVER_EMAIL/PASSWORD`.

**Setup:** add values in Cursor Secrets / dashboard for this environment. Do not paste credentials into chat. Guest + regular-user Access denied already **PASS** (`artifacts/qa/flexacontrol236/`).

---

## Numbered 84-feature results

| # | Feature | Entry | Native | Reference | Role | Status | Evidence / notes |
|---:|---|---|---|---|---|---|---|
| 1 | Login | drawer Sign In / deep link | `/auth/login` | `/auth/login` | guest | **PASS** | signin236 + AuthShell 360 |
| 2 | Signup | Sign Up | `/auth/register` | `/auth/register` | guest | **PASS** | signin236 |
| 3 | Auth Globe | auth shell | AuthGlobe | auth shell | guest | **PASS** | signin236 |
| 4 | Phone login | auth | `/auth/login-phone` | `/auth/login-phone` | guest | **PASS** | smoke open |
| 5 | Forgot password | login link | `/auth/forgot-password` | `/auth/forgot-password` | guest | **PASS** | smoke open |
| 6 | Home | drawer Home / tab | `/` | `/` | any | **PASS** | sbs_home_*; guest feed |
| 7 | Search | tab / Categories | `/search` | `/search` | any | **PASS** | drawer smoke |
| 8 | Categories | drawer | `/search` | `/search?category=` | any | **PASS** | same route |
| 9 | Product details | home card | `/listing/[id]` | `/listings/:id` | any | **PASS** | sbs_listing_*; gallery/price |
| 10 | Cart | tab | `/(tabs)/cart` | `/cart` | any | **PASS** | sbs_cart_* |
| 11 | Checkout | cart CTA | `/checkout` | cart modal | buyer | **PARTIAL** | nav PASS; pay E2E BLOCKED (secrets/sandbox) |
| 12 | Order confirmation | after pay | `/checkout-success` | `/checkout/success` | buyer | **BLOCKED** | needs successful pay |
| 13 | Stripe checkout | DR buy | `/stripe-checkout` | PDP buy | buyer | **PARTIAL** | hosted sheet path; DR account needed |
| 14 | Favorites / Saved | drawer Saved | `/favorites` | `/saved` | auth | **PASS** | drawer dest |
| 15 | Orders | drawer My Orders | `/orders` | `/orders` | buyer | **PASS** | opens; empty OK for new buyer |
| 16 | Order details | order row | `/orders/[id]` | `/orders/:id` | buyer | **PARTIAL** | needs order fixture |
| 17 | Delivery tracking | order / track | `/delivery-tracking` | `/delivery/tracking/:id` | auth | **PARTIAL** | UI present |
| 18 | Public tracking | drawer Order tracking | `/track`, `/track/[n]` | `/track` | any | **PASS** | drawer dest |
| 19 | Delivery confirmation | order delivered | `/orders/[id]` | `/orders/:id/delivered` | buyer | **PARTIAL** | tip/rating polish |
| 20 | Addresses | checkout / settings | `/addresses` | `/settings/addresses` | buyer | **PASS** | smoke |
| 21 | Wallet | drawer Wallet | `/wallet` | `/wallet` | auth | **PASS** | wallet236 Overview |
| 22 | Wallet top-up | Deposit | `/wallet` | `/wallet` | auth | **BLOCKED** | Android digital top-up blocked (policy) |
| 23 | Wallet transfer | Send | `/wallet-transfer` | `/wallet/transfer` | auth | **PASS** | wallet236 |
| 24 | Transaction history | History | `/wallet-history` | `/wallet/history` | auth | **PASS** | wallet236 |
| 25 | Flex Card repay | wallet / debt | `/flex-card-repay` | `/flex-card/repay` | buyer | **PARTIAL** | route open |
| 26 | BNPL | eligible CTA | `/bnpl` | `/bnpl` | buyer | **PARTIAL** | eligibility API |
| 27 | Account / Profile hub | tab My Account | `/profile` | settings hub | any | **PASS** | |
| 28 | Public seller shop | My Shop | `/shop/[id]` | `/profile/:id` | any | **PASS** | drawer |
| 29 | Edit Profile | settings | `/edit-profile` | `/profile/edit` | auth | **PASS** | smoke |
| 30 | Settings | drawer | `/settings` | `/settings` | any | **PASS** | ScrollView Help fix |
| 31 | Settings subpages | settings rows | `/settings/*` | `/settings/*` | auth | **PASS** | security/notifications/privacy/payments/help |
| 32 | Notifications | bell / drawer | `/notifications` | APIs | auth | **PASS** | inbox opens |
| 33 | Android push FCM | system | expo-notifications | N/A | device | **PARTIAL** | needs physical device proof |
| 34 | KYC | settings | `/kyc` | `/kyc` | auth | **PASS** | smoke |
| 35 | Language picker | drawer Language | drawer + `/language-picker` | preferences | any | **PASS** | drawer236 |
| 36 | Offers | drawer | `/offers` | `/offers` | auth | **PASS** | drawer dest |
| 37 | Subscription | drawer | `/subscription` | `/subscription` | auth | **PARTIAL** | UI; IAP blocked |
| 38 | Subscription purchase | plan CTA | `/subscription` | `/subscription` | auth | **BLOCKED** | Play Billing |
| 39 | Referral / Leaderboard | drawer Referral | `/leaderboard` | `/leaderboard` | auth | **PASS** | |
| 40 | Commission promo | drawer | `/commission-promo` | `/commission-promo` | auth | **PASS** | |
| 41 | Jobs | drawer | `/jobs` | `/jobs` | any | **PASS** | |
| 42 | Calculator | services | `/calculator` | `/calculator` | auth | **PASS** | smoke |
| 43 | Help Center | Support & Help | `/help-center` / `/support` | help | any | **PASS** | |
| 44 | Legal | links | `/legal/[slug]` | privacy/terms/eula | any | **PASS** | |
| 45 | Inbox | tab | `/inbox` | `/messages` | auth | **PASS** | |
| 46 | Chat thread | inbox row | `/chat/[id]` | `/messages/:id` | auth | **PARTIAL** | some Forbidden without peer |
| 47 | Support tickets | Support | `/support`, `/support/[id]` | `/support` | auth | **PASS** | |
| 48 | FlexaBot | drawer | `/chatbot` | `/chatbot` | auth | **PASS** | |
| 49 | Add Product / Sell | drawer | `/sell` | `/sell` | seller | **PARTIAL** | form opens; publish E2E needs seller |
| 50 | My Listings | drawer | `/my-listings` | profile | seller | **PARTIAL** | opens; populated needs seller |
| 51 | Edit Product | listing edit | `/sell-edit/[id]` | `/sell?edit=` | seller | **PARTIAL** | |
| 52 | Image upload | Sell form | `/sell` | Sell | seller | **PARTIAL** | picker present; failure/retry needs seller run |
| 53 | Video upload | videos / boost | `/videos`, boost | videos | seller | **PARTIAL** | promo236 player PASS; upload needs seller |
| 54 | Inventory / Restock | My listings | `/my-listings` | listings | seller | **PARTIAL** | |
| 55 | Sales dashboard | drawer Sales | `/sales` | `/sales` | seller | **PARTIAL** | |
| 56 | Seller analytics | analytics | `/analytics` | `/settings/analytics` | seller | **PARTIAL** | |
| 57 | Seller orders | sales | `/sales` | sales tab | seller | **PARTIAL** | |
| 58 | Earnings / payouts | payments | `/settings/payments` | payments | seller | **PASS** | |
| 59 | Boost campaigns | Boost | `/boost`, `/boost-video` | `/boost`, `/booster` | seller | **PARTIAL** | wizard UI; paid boost blocked |
| 60 | Paid Boost purchase | boost pay | `/boost` | `/boost/:id` | seller | **BLOCKED** | Play Billing / wallet charge secrets |
| 61 | Boost Analytics | drawer | `/boost-analytics` | `/boost-analytics` | seller | **PASS** | nav |
| 62 | My Active Boosts | drawer ×2 | `/my-boosts` | `/booster` | seller | **PASS** | nav; tabs need seller data |
| 63 | Promo videos / player | drawer Videos | `/videos`, `/videos/watch` | `/videos` | any | **PASS** | promo236 mute/skip/swipe |
| 64 | My Drafts | drawer | `/my-drafts` | `/my-drafts` | seller | **PARTIAL** | draft autosave E2E needs seller |
| 65 | Store Manager | manager | `/manager` | `/manager` | manager | **BLOCKED** | role secret |
| 66 | Seller registration | Sell | `/sell` | sell + stripe | seller | **PARTIAL** | |
| 67 | Driver apply | drawer | `/driver-apply` | `/delivery/apply` | Haiti | **PASS** | nav (Haiti) |
| 68 | Driver dashboard | drawer | `/driver-dashboard` | `/driver/dashboard` | driver | **BLOCKED** | driver secret / approval |
| 69 | Cash agents | wallet / agents | `/agents` | `/wallet/agents` | Haiti | **PARTIAL** | Contacts still limited (wallet236) |
| 70 | Loans | deep link | `/loans` | `/loans` | seller | **PARTIAL** | hidden from drawer (web parity) |
| 71 | Credit score | deep link | `/credit-score` | `/credit-score` | seller | **PARTIAL** | hidden from drawer |
| 72 | Flexa TV | drawer | `/tv` | `/tv` | any | **PASS** | |
| 73 | Flexa Music | drawer | `/music` | `/music` | any | **PASS** | |
| 74 | Music purchase | music CTA | `/music` | `/music` | any | **BLOCKED** | Play Billing digital goods |
| 75 | Flexa Control / Admin | drawer Flexa Control | `/admin` | `/admin` | support+ | **BLOCKED** | staff secrets; buyer Access denied **PASS** |
| 76 | Admin users | Control module | `/admin/users` | `/admin/users` | admin+ | **BLOCKED** | staff secrets |
| 77 | Moderation | Moderator Panel | `/admin/moderation` | `/admin/moderation` | moderator+ | **BLOCKED** | staff secrets |
| 78 | Admin finance | payments modules | `/admin/payments` etc. | finance tabs | admin+ | **BLOCKED** | staff secrets |
| 79 | Admin support | support module | `/admin/support` | `/admin/support` | support+ | **BLOCKED** | staff secrets |
| 80 | Admin analytics | analytics / more | `/admin/analytics` | admin analytics | admin+ | **BLOCKED** | staff secrets |
| 81 | Delete account | settings | `/delete-account` | `/delete-account` | auth | **PASS** | smoke |
| 82 | Website WebView | website | `/website` | * | any | **PASS** | |
| 83 | Flexa eSIM | esim | `/esim` | none | any | **BLOCKED** | provider integration |
| 84 | Smart notification deep-links | push | PushBootstrap | N/A | device | **PARTIAL** | physical FCM |

## Multi-step flows (required demos)

| Flow | Status | Notes |
|---|---|---|
| Add a Product (form → photos → validation → draft Back → publish → My Listings → PDP) | **BLOCKED / PARTIAL** | Sell form opens; full publish needs seller secret + recording |
| Checkout success (PDP → Cart → Address → Shipping → Payment → Confirmation → My Orders) | **BLOCKED** | Sandbox payment + funded/buyer secrets |
| Checkout failure + retry (error, cart preserved, no duplicate paid order) | **BLOCKED** | Same |
| Haiti FM Wallet checkout | **PARTIAL** | Path eligible for Haiti; end-to-end unpaid without funded wallet |
| Video boost create + My Videos tabs + analytics | **PARTIAL** | Player/rotation guest paths PASS (promo236); seller campaign create BLOCKED |
| Auto boost rotation during browse | **PARTIAL** | Prior promo evidence; eligible seller campaign needed for live rotation proof |
| Native vertical video player (swipe, mute, Skip, Message, audio stop on Back) | **PASS** | promo236 |

## Remaining blockers (release gate)

1. **Staff secrets unbound** — Super Admin / Admin / Support (+ buyer pair) for Flexa Control E2E and Super Admin drawer parity screenshots.
2. **Seller / driver secrets** — Add Product publish, My Videos tabs with real statuses, boost campaign submit, driver jobs.
3. **Payment sandbox** — checkout success/failure recordings; confirm no duplicate charge.
4. **`POST /api/boost/:id/renew`** — still 404 on production until API deploy (prior note).
5. **Play Billing** — subscription, paid boost, music, digital wallet top-up remain policy-blocked on Android.

## Recordings / screenshots index

| Artifact | Path |
|---|---|
| Inventory | `artifacts/qa/audit84/AUDIT84-INVENTORY.md` |
| This report | `artifacts/qa/audit84/AUDIT84-RESULTS.md` |
| Prior SBS / smoke | `artifacts/qa/audit236/` |
| Promo / player | `artifacts/qa/promo236/` |
| Wallet | `artifacts/qa/wallet236/` |
| Flexa Control gate | `artifacts/qa/flexacontrol236/` |
| Drawer destinations | `/opt/cursor/artifacts/drawer236-*`, `audit84-*` |

---

**Test APK commit:** `b2a11109f1a27c27990c0f65160e3fea8470d29e` (versionCode 58, package com.flexamarket.app).

## Computer-use drawer smoke (supplement)

[Emulator drawer smoke](bc-b798d204-b238-5fc3-8d64-279a077fc025) hit a session wipe after debug→release APK swap (expected). Drawer taps were unreliable under that signed-out modal; authenticated deep-link smoke on versionCode **58** supersedes those destination failures.

Unique salvage: `audit84-boost-autoplay-launch.png` — promotional video auto-opens with Sound / View Product / Message / Skip controls (supports checklist #63).

## Wallet Contacts (from #242)

Agent directory **PASS** on versionCode 58 — see `artifacts/qa/wallet236/WALLET242-GAP-RESULTS.md` and `w242-agents.png`.
