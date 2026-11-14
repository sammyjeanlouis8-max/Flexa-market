# Native ↔ WebView screen inventory (PR #236)

Source: Expo Router `artifacts/mobile/app`, `AppDrawer`, marketplace `App.tsx` / `PremiumSideMenu`.  
Compiled with [Inventory native vs WebView routes](bc-603211f6-8cb8-5e13-8e68-2e978383c81b).

## Counts

| Metric | Count |
|---|---:|
| `app/**/*.tsx` files (incl. layouts) | **84** |
| Native screen files (excl. `_layout`, `+not-found`) | **81** |
| Redirect-only aliases | **8** |
| Real native screens (non-redirect) | **73** |
| Web wouter routes (`App.tsx`, excl. catch-all) | **~150** |

The “84 screens” figure matches **all app TSX files**. Audit comparison uses **81** route modules (**73** after dropping redirects).

## Full mapping

| # | Native route | Native file | WebView / web route | Role | Country gate |
|---:|---|---|---|---|---|
| 1 | `/` | `(tabs)/index.tsx` | `/` | any | Marketplace country |
| 2 | `/search` | `(tabs)/search.tsx` | `/search` | any | Marketplace country |
| 3 | `/inbox` | `(tabs)/inbox.tsx` | `/messages` | buyer/seller | — |
| 4 | `/(tabs)/cart` | `(tabs)/cart.tsx` | `/cart` | any | DR blocks cart checkout |
| 5 | `/cart` | `cart.tsx` | `/cart` | any | alias → tabs cart |
| 6 | `/profile` | `(tabs)/profile.tsx` | `/settings` hub | any | Account country |
| 7 | `/auth/login` | `auth/login.tsx` | `/auth/login` | guest | — |
| 8 | `/auth/register` | `auth/register.tsx` | `/auth/register` | guest | — |
| 9 | `/auth/login-phone` | `auth/login-phone.tsx` | `/auth/login-phone` | guest | Phone ISO → country |
| 10 | `/auth/forgot-password` | `auth/forgot-password.tsx` | `/auth/forgot-password` | guest | — |
| 11 | `/listing/[id]` | `listing/[id].tsx` | `/listings/:id` | any | DR→Stripe; Haiti delivery UI |
| 12 | `/checkout` | `checkout.tsx` | `/cart?checkout=1` (no `/checkout`) | buyer | Blocks Dominican checkout |
| 13 | `/checkout-success` | `checkout-success.tsx` | `/checkout/success` | buyer | — |
| 14 | `/stripe-checkout` | `stripe-checkout.tsx` | embedded on PDP | buyer | Required for DR |
| 15 | `/orders` | `orders.tsx` | `/orders` | buyer | — |
| 16 | `/orders/[id]` | `orders/[id].tsx` | `/orders/:id` | buyer | Haiti PIN when present |
| 17 | `/favorites` | `favorites.tsx` | `/saved` | buyer | — |
| 18 | `/saved` | `saved.tsx` | `/saved` | buyer | → `/favorites` |
| 19 | `/wallet` | `wallet.tsx` | `/wallet` | buyer/seller | Haiti MonCash on web |
| 20 | `/wallet-transfer` | `wallet-transfer.tsx` | `/wallet/transfer` | buyer/seller | — |
| 21 | `/wallet-history` | `wallet-history.tsx` | `/wallet/history` | buyer/seller | — |
| 22 | `/chat/[id]` | `chat/[id].tsx` | `/messages/:id` | buyer/seller | — |
| 23 | `/addresses` | `addresses.tsx` | `/settings/addresses` | buyer | Haiti/DR chips |
| 24 | `/edit-profile` | `edit-profile.tsx` | `/profile/edit` | buyer/seller | — |
| 25 | `/language-picker` | `language-picker.tsx` | `/settings/preferences` | any | — |
| 26 | `/esim` | `esim.tsx` | **NATIVE-ONLY** | any | Stub |
| 27 | `/notifications` | `notifications.tsx` | **NATIVE-ONLY** inbox | buyer/seller | — |
| 28 | `/settings` | `settings.tsx` | `/settings` | any | Country picker |
| 29 | `/settings/security` | `settings/security.tsx` | `/settings/security` | buyer/seller | — |
| 30 | `/settings/notifications` | `settings/notifications.tsx` | `/settings/notifications` | buyer/seller | — |
| 31 | `/settings/privacy` | `settings/privacy.tsx` | `/settings/privacy` | buyer/seller | — |
| 32 | `/settings/payments` | `settings/payments.tsx` | `/settings/payments` | buyer/seller | — |
| 33 | `/settings/help` | `settings/help.tsx` | `/settings/help` | any | — |
| 34 | `/settings/videos` | `settings/videos.tsx` | `/settings/videos` | seller | → `/my-videos` |
| 35 | `/delivery-tracking` | `delivery-tracking.tsx` | `/delivery/tracking/:id` | buyer/seller/driver | Haiti FM statuses |
| 36 | `/track` | `track.tsx` | `/track` | any | Public |
| 37 | `/track/[trackingNumber]` | `track/[trackingNumber].tsx` | `/track/:trackingNumber` | any | Public |
| 38 | `/sell` | `sell.tsx` | `/sell` | seller | HTG/DOP by country |
| 39 | `/sell-edit/[id]` | `sell-edit/[id].tsx` | `/sell?edit=:id` | seller | Same |
| 40 | `/my-listings` | `my-listings.tsx` | `/profile/:id` (no `/my-listings`) | seller | — |
| 41 | `/my-drafts` | `my-drafts.tsx` | `/my-drafts` | seller | — |
| 42 | `/my-boosts` | `my-boosts.tsx` | `/booster` | seller | — |
| 43 | `/boost` | `boost.tsx` | `/boost/:listingId` | seller | Wallet/country gate |
| 44 | `/boost-analytics` | `boost-analytics.tsx` | `/boost-analytics` | seller | — |
| 45 | `/boost-video` | `boost-video.tsx` | `/booster/create` | seller | Haiti dept/commune |
| 46 | `/booster` | `booster.tsx` | `/booster` | seller | → `/boost-video` |
| 47 | `/videos` | `videos.tsx` | `/videos` | any | Country feed |
| 48 | `/videos/watch` | `videos/watch.tsx` | `/videos/watch` | any | Country feed |
| 49 | `/my-videos` | `my-videos.tsx` | `/settings/videos` | seller | — |
| 50 | `/offers` | `offers.tsx` | `/offers` | buyer/seller | — |
| 51 | `/sales` | `sales.tsx` | `/sales` | seller | — |
| 52 | `/analytics` | `analytics.tsx` | `/settings/analytics` | seller | — |
| 53 | `/kyc` | `kyc.tsx` | `/kyc` | buyer/seller | — |
| 54 | `/subscription` | `subscription.tsx` | `/subscription` | buyer/seller | Play purchase blocked |
| 55 | `/admin` | `admin.tsx` | `/admin` (+ `/admin/*`) | admin/mod/support | — |
| 56 | `/driver-apply` | `driver-apply.tsx` | `/delivery/apply` | driver | Haiti drawer only |
| 57 | `/driver-dashboard` | `driver-dashboard.tsx` | `/driver/dashboard` | driver | Haiti drawer only |
| 58 | `/driver/dashboard` | `driver/dashboard.tsx` | `/driver/dashboard` | driver | → `/driver-dashboard` |
| 59 | `/delivery/apply` | `delivery/apply.tsx` | `/delivery/apply` | driver | → `/driver-apply` |
| 60 | `/delivery/deliveries` | `delivery/deliveries.tsx` | `/delivery/deliveries` | driver | → `/driver-dashboard` |
| 61 | `/calculator` | `calculator.tsx` | `/calculator` | auth | — |
| 62 | `/help-center` | `help-center.tsx` | `/help-center` | any | — |
| 63 | `/support` | `support.tsx` | `/support` | buyer/seller | — |
| 64 | `/support/[id]` | `support/[id].tsx` | `/support/:id` | buyer/seller | — |
| 65 | `/chatbot` | `chatbot.tsx` | `/chatbot` | auth | — |
| 66 | `/legal/[slug]` | `legal/[slug].tsx` | `/privacy-policy`, `/terms`, `/eula`, … | any | — |
| 67 | `/jobs` | `jobs.tsx` | `/jobs` | auth | Web Haiti-only; native no UI gate |
| 68 | `/leaderboard` | `leaderboard.tsx` | `/leaderboard` | any | — |
| 69 | `/commission-promo` | `commission-promo.tsx` | `/commission-promo` | seller | — |
| 70 | `/loans` | `loans.tsx` | `/loans` | seller | Haiti \| DR server |
| 71 | `/credit-score` | `credit-score.tsx` | `/credit-score` | seller | Haiti \| DR |
| 72 | `/tv` | `tv.tsx` | `/tv` | any | — |
| 73 | `/music` | `music.tsx` | `/music` | any | — |
| 74 | `/bnpl` | `bnpl.tsx` | `/bnpl` | buyer | Eligibility API |
| 75 | `/flex-card-repay` | `flex-card-repay.tsx` | `/flex-card/repay` | buyer | — |
| 76 | `/shop/[id]` | `shop/[id].tsx` | `/profile/:id` | any | — |
| 77 | `/profile/[id]` | `profile/[id].tsx` | `/profile/:id` | any | → `/shop/[id]` |
| 78 | `/delete-account` | `delete-account.tsx` | `/delete-account` | buyer/seller | — |
| 79 | `/agents` | `agents.tsx` | `/wallet/agents` | buyer/seller | Often Haiti-centric |
| 80 | `/manager` | `manager.tsx` | `/manager` | manager | — |
| 81 | `/website` | `website.tsx` | **NATIVE-ONLY** | any | System browser |

## Native redirects

| From | To |
|---|---|
| `/booster` | `/boost-video` |
| `/saved` | `/favorites` |
| `/cart` (stack) | `/(tabs)/cart` |
| `/settings/videos` | `/my-videos` |
| `/profile/[id]` | `/shop/[id]` |
| `/driver/dashboard` | `/driver-dashboard` |
| `/delivery/apply` | `/driver-apply` |
| `/delivery/deliveries` | `/driver-dashboard` |

## Notable MISSING-NATIVE (web-only)

Auth: `/auth/suspended`, `/auth/set-new-password`. Booster extras: `/booster/audiences`, `/booster/help`, `/boost-analytics/:id`, `/videos/favorites`. Orders: `/orders/:id/label`, `/orders/:id/delivered`. Delivery: `/delivery/job/:id`, `/driver/status`. Settings: `/settings/identity`, Stripe return URLs. Media: `/music/upload`, `/music/earnings`. Admin: all `/admin/*` subpanels beyond coarse `/admin`. Dev: `/dev/*`.

## NATIVE-ONLY / path mismatch

`/esim`, `/website`, `/notifications` inbox, `/checkout` (web inline on cart), `/stripe-checkout`, `/language-picker`, `/my-listings`, `/boost-video` vs `/booster/create`, `/listing/[id]` vs `/listings/:id`, `/inbox`/`/chat/[id]` vs `/messages`.
