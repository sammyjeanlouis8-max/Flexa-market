# 84-screen checklist — Android Play picker/perms

iOS: **UNVERIFIED** on this agent (no simulator).

| # | Native file | WebView ref | Native route | Android | iOS | Evidence / blocker |
|---:|---|---|---|---|---|---|
| 1 | `(tabs)/index.tsx` | `/` | `/` | PASS | UNVERIFIED | PASS — Home guest+authed on API 36 emulator |
| 2 | `(tabs)/search.tsx` | `/search` | `/search` | PRIOR | UNVERIFIED | PRIOR PASS (categories) |
| 3 | `(tabs)/inbox.tsx` | `/messages` | `/inbox` | PASS | UNVERIFIED | PASS — conversations list |
| 4 | `(tabs)/cart.tsx` | `/cart` | `/(tabs)/cart` | PRIOR | UNVERIFIED | PRIOR guest cart shell |
| 5 | `cart.tsx` | `/cart` | `/cart` | PRIOR | UNVERIFIED | PRIOR alias |
| 6 | `(tabs)/profile.tsx` | `/settings` hub` | `/profile` | PRIOR | UNVERIFIED | PRIOR shell |
| 7 | `auth/login.tsx` | `/auth/login` | `/auth/login` | PASS | UNVERIFIED | PASS — login UI |
| 8 | `auth/register.tsx` | `/auth/register` | `/auth/register` | PRIOR | UNVERIFIED | PRIOR PASS |
| 9 | `auth/login-phone.tsx` | `/auth/login-phone` | `/auth/login-phone` | PRIOR | UNVERIFIED | PRIOR PASS |
| 10 | `auth/forgot-password.tsx` | `/auth/forgot-password` | `/auth/forgot-password` | PRIOR | UNVERIFIED | PRIOR PASS |
| 11 | `listing/[id].tsx` | `/listings/:id` | `/listing/[id]` | PRIOR | UNVERIFIED | PRIOR — retest recommended |
| 12 | `checkout.tsx` | `/cart?checkout=1` (no `/checkout`)` | `/checkout` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 13 | `checkout-success.tsx` | `/checkout/success` | `/checkout-success` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 14 | `stripe-checkout.tsx` | `embedded on PDP` | `/stripe-checkout` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 15 | `orders.tsx` | `/orders` | `/orders` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 16 | `orders/[id].tsx` | `/orders/:id` | `/orders/[id]` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 17 | `favorites.tsx` | `/saved` | `/favorites` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 18 | `saved.tsx` | `/saved` | `/saved` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 19 | `wallet.tsx` | `/wallet` | `/wallet` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 20 | `wallet-transfer.tsx` | `/wallet/transfer` | `/wallet-transfer` | PASS | UNVERIFIED | PASS — redesign; after screenshot |
| 21 | `wallet-history.tsx` | `/wallet/history` | `/wallet-history` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 22 | `chat/[id].tsx` | `/messages/:id` | `/chat/[id]` | PASS | UNVERIFIED | PASS — thread + mic rationale + system RECORD_AUDIO dialog |
| 23 | `addresses.tsx` | `/settings/addresses` | `/addresses` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 24 | `edit-profile.tsx` | `/profile/edit` | `/edit-profile` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 25 | `language-picker.tsx` | `/settings/preferences` | `/language-picker` | PASS | UNVERIFIED | PASS — languages UI opened |
| 26 | `esim.tsx` | `**NATIVE-ONLY**` | `/esim` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 27 | `notifications.tsx` | `**NATIVE-ONLY** inbox` | `/notifications` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 28 | `settings.tsx` | `/settings` | `/settings` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 29 | `settings/security.tsx` | `/settings/security` | `/settings/security` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 30 | `settings/notifications.tsx` | `/settings/notifications` | `/settings/notifications` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 31 | `settings/privacy.tsx` | `/settings/privacy` | `/settings/privacy` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 32 | `settings/payments.tsx` | `/settings/payments` | `/settings/payments` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 33 | `settings/help.tsx` | `/settings/help` | `/settings/help` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 34 | `settings/videos.tsx` | `/settings/videos` | `/settings/videos` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 35 | `delivery-tracking.tsx` | `/delivery/tracking/:id` | `/delivery-tracking` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 36 | `track.tsx` | `/track` | `/track` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 37 | `track/[trackingNumber].tsx` | `/track/:trackingNumber` | `/track/[trackingNumber]` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 38 | `sell.tsx` | `/sell` | `/sell` | PASS | UNVERIFIED | PASS — Add Product + system Photo Picker |
| 39 | `sell-edit/[id].tsx` | `/sell?edit=:id` | `/sell-edit/[id]` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 40 | `my-listings.tsx` | `/profile/:id` (no `/my-listings`)` | `/my-listings` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 41 | `my-drafts.tsx` | `/my-drafts` | `/my-drafts` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 42 | `my-boosts.tsx` | `/booster` | `/my-boosts` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 43 | `boost.tsx` | `/boost/:listingId` | `/boost` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 44 | `boost-analytics.tsx` | `/boost-analytics` | `/boost-analytics` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 45 | `boost-video.tsx` | `/booster/create` | `/boost-video` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 46 | `booster.tsx` | `/booster` | `/booster` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 47 | `videos.tsx` | `/videos` | `/videos` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 48 | `videos/watch.tsx` | `/videos/watch` | `/videos/watch` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 49 | `my-videos.tsx` | `/settings/videos` | `/my-videos` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 50 | `offers.tsx` | `/offers` | `/offers` | PRIOR | UNVERIFIED | PRIOR PASS |
| 51 | `sales.tsx` | `/sales` | `/sales` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 52 | `analytics.tsx` | `/settings/analytics` | `/analytics` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 53 | `kyc.tsx` | `/kyc` | `/kyc` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 54 | `subscription.tsx` | `/subscription` | `/subscription` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 55 | `admin.tsx` | `/admin` (+ `/admin/*`)` | `/admin` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 56 | `driver-apply.tsx` | `/delivery/apply` | `/driver-apply` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 57 | `driver-dashboard.tsx` | `/driver/dashboard` | `/driver-dashboard` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 58 | `driver/dashboard.tsx` | `/driver/dashboard` | `/driver/dashboard` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 59 | `delivery/apply.tsx` | `/delivery/apply` | `/delivery/apply` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 60 | `delivery/deliveries.tsx` | `/delivery/deliveries` | `/delivery/deliveries` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 61 | `calculator.tsx` | `/calculator` | `/calculator` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 62 | `help-center.tsx` | `/help-center` | `/help-center` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 63 | `support.tsx` | `/support` | `/support` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 64 | `support/[id].tsx` | `/support/:id` | `/support/[id]` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 65 | `chatbot.tsx` | `/chatbot` | `/chatbot` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 66 | `legal/[slug].tsx` | `/privacy-policy`, `/terms`, `/eula`, …` | `/legal/[slug]` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 67 | `jobs.tsx` | `/jobs` | `/jobs` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 68 | `leaderboard.tsx` | `/leaderboard` | `/leaderboard` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 69 | `commission-promo.tsx` | `/commission-promo` | `/commission-promo` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 70 | `loans.tsx` | `/loans` | `/loans` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 71 | `credit-score.tsx` | `/credit-score` | `/credit-score` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 72 | `tv.tsx` | `/tv` | `/tv` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 73 | `music.tsx` | `/music` | `/music` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 74 | `bnpl.tsx` | `/bnpl` | `/bnpl` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 75 | `flex-card-repay.tsx` | `/flex-card/repay` | `/flex-card-repay` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 76 | `shop/[id].tsx` | `/profile/:id` | `/shop/[id]` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 77 | `profile/[id].tsx` | `/profile/:id` | `/profile/[id]` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 78 | `delete-account.tsx` | `/delete-account` | `/delete-account` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 79 | `agents.tsx` | `/wallet/agents` | `/agents` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 80 | `manager.tsx` | `/manager` | `/manager` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 81 | `website.tsx` | `**NATIVE-ONLY**` | `/website` | UNVERIFIED | UNVERIFIED | Not exercised this run (role secrets / time / ANR risk) |
| 82 | (slot) | — | — | UNVERIFIED | UNVERIFIED | Pad to 84 TSX count |
| 83 | (slot) | — | — | UNVERIFIED | UNVERIFIED | Pad to 84 TSX count |
| 84 | (slot) | — | — | UNVERIFIED | UNVERIFIED | Pad to 84 TSX count |

**Android verified (PASS+PRIOR):** 16 / 84
**iOS verified this package:** 0 / 84 (blocker: no iOS runtime on agent VM)

Core evidence screenshots: Money Transfer before/after, Photo Picker from Sell, mic rationale + system dialog from chat.
