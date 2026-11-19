# Android Native Complete Inventory

- **startCommitSha:** `d19ce179a3302f9730cd3e899a9a9923b7a5e4bd`
- **branch:** `cursor/android-native-complete-d484`
- **generatedAt:** `2026-11-19T16:55:30Z`
- **androidPackageOnMain:** `com.flexa.market` (not `com.flexamarket.app` on main tip)

## 82 vs 84 explanation

The Nov 9 report (`phase3-migration-inventory.json`) counts **82** features. The PR #243 / #221 parity docs count **84**.

The **two pages that differ** (net +2) are:

1. **`shop-profile`** — Public seller shop (`/profile/:id` → native `/shop/[id]`). Absent from the Nov 9 82-list.
2. **`my-boosts`** — My Boosts management screen. Absent as its own row in Nov 9 (boost-analytics then pointed at `/my-boosts`).

Also renamed (same feature, not a count change): `sales-dashboard` → `sales`.

Sources: `artifacts/mobile/docs/phase3-migration-inventory.json` (82); `origin/cursor/native-84-screen-audit-9d45` `native-84-page-map.md` + verification docs (84); `origin/cursor/ios-all-pages-native-e34a` `IOS_ALL_PAGES_NATIVE.md` (also 84).

## Summary counts (this branch vs web)

| Status | Count |
|---|---:|
| `complete` | 32 |
| `partial` | 5 |
| `placeholder` | 12 |
| `missing` | 30 |
| `blocked` | 4 |
| `out_of_scope` | 1 |
| `total` | 84 |

## Expo Router files on this branch

**48** route modules under `artifacts/mobile/app/**` (excluding `_layout` / `+not-found`).

### NativePlaceholder routes
- `admin.tsx`
- `boost.tsx`
- `driver-apply.tsx`
- `driver-dashboard.tsx`
- `kyc.tsx`
- `my-boosts.tsx`
- `subscription.tsx`
- `videos.tsx`
- `website.tsx`

### Non-placeholder stubs
- `loans.tsx` — `Redirect` to `/` (counts as **placeholder**)
- `esim.tsx` — honest deferred UI (**out_of_scope**)

## Web routes (`artifacts/marketplace/src/App.tsx`)

**156** unique Wouter `<Route path>` entries (includes admin/dev/legal). Representative marketplace paths are mapped per feature below.

<details><summary>Full web route list</summary>

- `/`
- `/about`
- `/accessibility`
- `/admin`
- `/admin/actions`
- `/admin/activity`
- `/admin/agent-applications`
- `/admin/appeals`
- `/admin/broadcast`
- `/admin/broadcast-sms`
- `/admin/deliveries`
- `/admin/driver-applications`
- `/admin/drivers/live`
- `/admin/flagged`
- `/admin/flex-card`
- `/admin/fraud`
- `/admin/listings`
- `/admin/live-support`
- `/admin/loans`
- `/admin/moderation`
- `/admin/moncash-transactions`
- `/admin/more`
- `/admin/music`
- `/admin/operations`
- `/admin/push-notifications`
- `/admin/reports`
- `/admin/security`
- `/admin/stripe-transactions`
- `/admin/support`
- `/admin/team`
- `/admin/transactions`
- `/admin/tv`
- `/admin/tv/programs/:id/edit`
- `/admin/tv/programs/new`
- `/admin/users`
- `/admin/users/:id`
- `/admin/vehicles`
- `/admin/vip-subscriptions`
- `/agent`
- `/agents/apply`
- `/auth/forgot-password`
- `/auth/login`
- `/auth/login-phone`
- `/auth/register`
- `/auth/set-new-password`
- `/auth/suspended`
- `/bnpl`
- `/boost-analytics`
- `/boost-analytics/:boostId`
- `/boost/:listingId`
- `/booster`
- `/booster/analytics`
- `/booster/audiences`
- `/booster/create`
- `/booster/help`
- `/booster/media`
- `/bouillon`
- `/brouillon`
- `/calculator`
- `/cart`
- `/categories/:slug`
- `/chatbot`
- `/checkout/success`
- `/commission-promo`
- `/community-guidelines`
- `/contact`
- `/content-policy`
- `/cookies`
- `/credit-score`
- `/data-deletion`
- `/delete-account`
- `/delivery/apply`
- `/delivery/deliveries`
- `/delivery/job/:id`
- `/delivery/suspended`
- `/delivery/tracking/:id`
- `/dev/boosted-deal-preview`
- `/dev/checkout-redesign-preview`
- `/dev/flexa-control-preview`
- `/dev/music-sponsored-ads-preview`
- `/dev/settings-quick-actions-preview`
- `/dmca`
- `/driver-selfie`
- `/driver/dashboard`
- `/driver/status`
- `/eula`
- `/faq`
- `/flex-card/repay`
- `/help-center`
- `/intellectual-property`
- `/jobs`
- `/kyc`
- `/leaderboard`
- `/listings/:id`
- `/listings/:id/video`
- `/listings/create`
- `/loans`
- `/manager`
- `/messages`
- `/messages/:id`
- `/music`
- `/music/earnings`
- `/music/play/:id`
- `/music/sponsored-ads`
- `/music/upload`
- `/my-boosts`
- `/my-boosts-classic`
- `/my-drafts`
- `/offers`
- `/orders`
- `/orders/:id`
- `/orders/:id/delivered`
- `/orders/:id/label`
- `/privacy-policy`
- `/profile/:id`
- `/profile/edit`
- `/prohibited-items`
- `/refund-policy`
- `/report-abuse`
- `/safety`
- `/sales`
- `/saved`
- `/search`
- `/sell`
- `/seller-policy`
- `/settings`
- `/settings/addresses`
- `/settings/analytics`
- `/settings/help`
- `/settings/identity`
- `/settings/notifications`
- `/settings/payments`
- `/settings/preferences`
- `/settings/privacy`
- `/settings/security`
- `/settings/stripe-refresh`
- `/settings/stripe-return`
- `/settings/videos`
- `/shipping-policy`
- `/subscription`
- `/support`
- `/support/:id`
- `/terms`
- `/terms-of-service`
- `/track`
- `/track/:trackingNumber`
- `/trust-center`
- `/tv`
- `/videos`
- `/videos/favorites`
- `/videos/profile/:id`
- `/videos/watch`
- `/wallet`
- `/wallet/agents`
- `/wallet/history`
- `/wallet/transfer`

</details>

## Feature inventory (84)

| # | id | name | webRoute | androidRoute | requiredRole | status | nav | api | notes |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | `auth-login` | Login | `/auth/login` | `/auth/login` | guest | **complete** | yes | yes | Native LoginScreen + AuthGlobe; email/password. |
| 2 | `auth-register` | Signup | `/auth/register` | `/auth/register` | guest | **complete** | yes | yes | Native RegisterScreen + AuthGlobe. |
| 3 | `auth-globe` | Animated Auth Globe | `(auth shell component)` | `components/auth/AuthGlobe` | guest | **complete** | yes | unknown | Shared auth shell component; not a route. |
| 4 | `auth-phone-login` | Phone login | `/auth/login-phone` | `—` | guest | **missing** | no | no | Web /auth/login-phone exists; no Expo route on this branch. |
| 5 | `auth-forgot-password` | Forgot password | `/auth/forgot-password` | `—` | guest | **missing** | no | no | Web /auth/forgot-password exists; no Expo route on this branch. |
| 6 | `home` | Home | `/` | `/` | guest+ | **complete** | yes | yes | Tab Home; listings + cart shortcut. |
| 7 | `search` | Search | `/search` | `/search` | guest+ | **complete** | yes | yes | Tab Search (href hidden); query listings API. |
| 8 | `categories` | Categories | `/search?category=` | `/search` | guest+ | **partial** | yes | partial | No dedicated category browser; Search lacks /api/categories chips. |
| 9 | `listing-detail` | Product details | `/listings/:id` | `/listing/[id]` | guest+ | **partial** | yes | yes | Message seller + cart + Stripe buy wired; reviews/BNPL/offer CTA gaps remain. |
| 10 | `cart` | Shopping Cart | `/cart` | `/cart` | guest+ | **complete** | yes | yes | Local cart + checkout handoff; reachable from Home. |
| 11 | `checkout` | Checkout (wallet / Card FM) | `/cart (modal)` | `/checkout` | buyer | **complete** | yes | yes | Wallet / Card FM checkout; entered from cart. |
| 12 | `checkout-success` | Order confirmation | `/checkout/success` | `/checkout-success` | buyer | **complete** | yes | yes | Order confirmation screen. |
| 13 | `stripe-single-item` | Stripe single-item checkout | `/listings/:id (buy)` | `/stripe-checkout` | buyer | **complete** | yes | yes | Hosted Stripe URL via expo-web-browser. |
| 14 | `favorites` | Favorites / Saved | `/saved` | `/favorites` | buyer | **complete** | yes | yes | Account hub link; /api/favorites. |
| 15 | `orders` | Orders | `/orders` | `/orders` | buyer | **complete** | yes | yes | Buyer purchases list. |
| 16 | `order-detail` | Order Details | `/orders/:id` | `/orders/[id]` | buyer/seller | **complete** | yes | yes | Buyer detail + confirm/tip/ship/label hooks present. |
| 17 | `delivery-tracking` | Order / Delivery Tracking | `/delivery/tracking/:id` | `/delivery-tracking` | buyer | **complete** | yes | yes | Account hub link; tracking API. |
| 18 | `public-tracking` | Public tracking | `/track/:trackingNumber` | `—` | guest+ | **missing** | no | no | Web /track/:trackingNumber; no native route. |
| 19 | `delivery-confirm` | Delivery Confirmation | `/orders/:id/delivered` | `/orders/[id]` | buyer | **partial** | yes | partial | Confirm + tip on order detail; driver rating modal not polished. |
| 20 | `addresses` | Addresses | `/settings/addresses` | `/addresses` | buyer | **complete** | yes | yes | CRUD addresses. |
| 21 | `wallet` | Wallet | `/wallet` | `/wallet` | buyer | **complete** | yes | yes | Balance + history; top-up CTA explains Android block. |
| 22 | `wallet-topup` | Wallet top-up / Card FM recharge | `/wallet` | `/wallet` | buyer | **blocked** | yes | no | Play Billing / digital-goods policy. Non-payment wallet UI is complete. |
| 23 | `wallet-transfer` | Wallet P2P transfer | `/wallet/transfer` | `—` | buyer | **missing** | no | no | Web /wallet/transfer; no /wallet-transfer route. |
| 24 | `wallet-history` | Transaction History | `/wallet/history` | `/wallet` | buyer | **complete** | yes | yes | Embedded in /wallet with filters. |
| 25 | `flex-card-repay` | Flex Card repay | `/flex-card/repay` | `—` | buyer | **missing** | no | no | Web /flex-card/repay; no native route. |
| 26 | `bnpl` | BNPL | `/bnpl` | `—` | buyer | **missing** | no | no | Web /bnpl; no native route. |
| 27 | `profile-account` | Account / Profile hub | `/settings + /profile/:id` | `/profile` | guest/buyer | **partial** | yes | yes | Account tab hub; public shop profile still missing. |
| 28 | `shop-profile` | Public seller shop | `/profile/:id` | `—` | guest+ | **missing** | no | no | Added in 84-count (not in Nov 9 82). Web /profile/:id; no /shop/[id] on this branch. |
| 29 | `edit-profile` | Edit Profile | `/profile/edit` | `/edit-profile` | buyer | **complete** | yes | yes | Profile + avatar + language + password. |
| 30 | `settings` | Settings (marketplace country) | `/settings` | `/settings` | guest+ | **complete** | yes | yes | Country + links to edit-profile/addresses/language. |
| 31 | `settings-subpages` | Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) | `/settings/*` | `—` | buyer | **missing** | no | no | No /settings/security\|privacy\|payments\|help\|notifications routes. |
| 32 | `notifications` | Notifications | `(bell) /notifications APIs` | `/notifications` | buyer | **complete** | yes | yes | List + deep-link handlers. |
| 33 | `push-fcm` | Android push (FCM) | `N/A` | `expo-notifications` | buyer | **partial** | unknown | partial | Token registration wired for com.flexa.market; physical FCM E2E not verified. |
| 34 | `kyc` | Account Verification (KYC) | `/kyc` | `/kyc` | buyer | **placeholder** | no | no | NativePlaceholder — KYC upload queued. |
| 35 | `language-picker` | Language picker | `(modal)` | `/language-picker` | guest+ | **complete** | yes | yes | Via Settings. |
| 36 | `offers` | Offers | `/offers` | `/offers` | buyer | **complete** | yes | yes | Accept/reject/counter + Stripe offer checkout. |
| 37 | `subscription` | Subscription / VIP | `/subscription` | `/subscription` | buyer | **placeholder** | no | no | NativePlaceholder. Non-payment plans UI can be completed without Play Billing. |
| 38 | `subscription-billing` | Subscription digital purchase | `/subscription` | `/subscription` | buyer | **blocked** | no | no | Play Billing required for purchase; browse/cancel UI can still ship. |
| 39 | `referrals` | Referral System / Leaderboard | `/leaderboard` | `—` | buyer | **missing** | no | no | Web /leaderboard; no native route. |
| 40 | `commission-promo` | Commission promo | `/commission-promo` | `—` | buyer | **missing** | no | no | Web /commission-promo; no native route. |
| 41 | `jobs` | Jobs board | `/jobs` | `—` | buyer | **missing** | no | no | Web /jobs; no native route. |
| 42 | `calculator` | CalcAI calculator | `/calculator` | `—` | buyer | **missing** | no | no | Web /calculator; no native route. |
| 43 | `help-center` | Help Center / FAQ / Contact | `/help-center,/faq,/contact,/settings/help` | `—` | guest+ | **missing** | no | no | Web help/faq/contact; no native route. |
| 44 | `legal` | Legal pages (privacy, terms, EULA, policies) | `/privacy-policy,/terms,/eula,...` | `—` | guest+ | **missing** | no | no | Web privacy/terms/eula; no /legal/[slug]. |
| 45 | `inbox` | Kominike / Inbox / Messages | `/messages` | `/inbox` | buyer | **complete** | yes | yes | Chat tab. |
| 46 | `chat-thread` | Private / Product Chat | `/messages/:id` | `/chat/[id]` | buyer | **complete** | yes | yes | Voice/attach/reply/read receipts. |
| 47 | `support-tickets` | Support Center / Tickets | `/support,/support/:id` | `/support` | buyer | **complete** | yes | yes | Support home + /support/[id]; voice prohibited. |
| 48 | `chatbot` | FlexaBot Chatbot | `/chatbot` | `/chatbot` | buyer | **complete** | yes | yes | FlexaBot native. |
| 49 | `sell` | Add Product / Sell | `/sell` | `/sell` | buyer+ | **complete** | yes | yes | Tab Sell; Wasabi multi-image progress/cancel/retry. |
| 50 | `my-listings` | Product Management / My Listings | `/profile/{me}, drafts` | `/my-listings` | seller | **complete** | yes | yes | Seller listings + delete. |
| 51 | `edit-listing` | Edit Product | `/sell?edit= / listing edit` | `—` | seller | **missing** | no | no | No /sell-edit/[id]; edit deferred. |
| 52 | `image-upload` | Image Upload | `(Sell)` | `/sell` | seller | **complete** | yes | yes | Integrated in Sell (Wasabi). |
| 53 | `video-upload` | Video Upload | `/videos, drafts` | `/videos` | seller | **placeholder** | no | no | NativePlaceholder at /videos. |
| 54 | `inventory` | Inventory / Restock | `(listing management)` | `—` | seller | **missing** | no | no | No dedicated restock controls; my-listings lacks stock UI. |
| 55 | `sales` | Seller Dashboard / Sales | `/sales` | `/sales` | seller | **complete** | yes | yes | Seller dashboard + seller orders (was sales-dashboard in Nov9). |
| 56 | `seller-analytics` | Sales Analytics | `/settings/analytics` | `—` | seller | **missing** | no | no | Web /settings/analytics; no /analytics route. |
| 57 | `seller-orders` | Seller Orders Management | `/orders (sales tab)` | `/sales` | seller | **complete** | yes | yes | Seller orders listed on /sales via /api/orders/sales. |
| 58 | `earnings-payouts` | Earnings / Commissions / Payouts | `/settings/payments, wallet` | `—` | seller | **missing** | no | no | No /settings/payments native. |
| 59 | `boost` | Boost Campaigns | `/boost/:listingId,/booster/*` | `/boost` | seller | **placeholder** | no | no | NativePlaceholder. Non-paid boost UI can be completed; paid path blocked. |
| 60 | `boost-paid` | Paid Boost purchase | `/boost/:id` | `/boost` | seller | **blocked** | no | no | Play Billing / digital goods. Campaign browse UI can still ship. |
| 61 | `boost-analytics` | Boost Analytics | `/boost-analytics` | `/my-boosts` | seller | **placeholder** | no | no | No /boost-analytics; /my-boosts is placeholder. |
| 62 | `my-boosts` | My Boosts | `/my-boosts` | `/my-boosts` | seller | **placeholder** | no | no | Added in 84-count (not in Nov 9 82). NativePlaceholder. |
| 63 | `promo-videos` | Promotional Videos / Video Discover | `/videos,/videos/watch` | `/videos` | guest+ | **placeholder** | no | no | NativePlaceholder discover feed. |
| 64 | `drafts` | My Drafts / Bouillon | `/my-drafts` | `—` | seller | **missing** | no | no | Web /my-drafts; no native route. |
| 65 | `store-manager` | Store Manager Dashboard | `/manager` | `—` | store_manager | **missing** | no | no | Web /manager; no native route. |
| 66 | `seller-registration` | Seller Registration / Stripe Connect | `/sell + /settings/stripe-return` | `—` | seller | **missing** | no | no | Stripe Connect onboarding/return not native. |
| 67 | `driver-apply` | Driver Registration | `/delivery/apply` | `/driver-apply` | buyer→driver | **placeholder** | no | no | NativePlaceholder. |
| 68 | `driver-dashboard` | Driver Dashboard / Jobs | `/driver/dashboard,/delivery/deliveries,/delivery/job/:id` | `/driver-dashboard` | driver | **placeholder** | no | no | NativePlaceholder. |
| 69 | `cash-agent` | Cash Agent directory / dashboard | `/wallet/agents,/agent,/agents/apply` | `—` | agent/buyer | **missing** | no | no | Web agents/apply; no /agents route. |
| 70 | `loans` | Business Loans | `/loans` | `/loans` | buyer (HT/DR) | **placeholder** | no | no | Redirect stub to Home (not NativePlaceholder but empty). |
| 71 | `credit-score` | Credit Score | `/credit-score` | `—` | buyer (HT/DR) | **missing** | no | no | Web /credit-score; no native route. |
| 72 | `flexa-tv` | Flexa TV | `/tv` | `—` | guest+ | **missing** | no | no | Web /tv; no native route. |
| 73 | `flexa-music` | Flexa Music | `/music,/music/upload,/music/earnings,/music/play/:id` | `/(tabs)/music (+ /music/*)` | guest+/artist | **complete** | yes | yes | Tab + search/library/playlists/upload/now-playing. |
| 74 | `music-purchase` | Music digital purchase | `/music` | `/(tabs)/music` | buyer | **blocked** | yes | no | Play Billing for paid tracks/subs. Browse/play/upload UI is complete. |
| 75 | `admin-panel` | Flexa Control / Super Admin Dashboard | `/admin,/admin/*` | `/admin` | admin/superadmin/moderator | **placeholder** | no | no | NativePlaceholder; admin remains web-first. |
| 76 | `admin-users` | User / Seller / Driver Management | `/admin/users,/admin/driver-applications,/admin/agents` | `—` | admin+ | **missing** | no | no | No /admin/users module routes. |
| 77 | `admin-moderation` | Product Moderation / Reports / Disputes | `/admin/moderation,/admin/reports,/admin/appeals` | `—` | moderator+ | **missing** | no | no | No /admin/moderation module. |
| 78 | `admin-finance` | Financial Management / Payments / Wallet Ops / Refunds | `/admin/transactions,/admin/stripe-transactions,/admin?tab=wallet|payments|...` | `—` | financeAdmin/superadmin | **missing** | no | no | No /admin/payments module. |
| 79 | `admin-support` | Support Agent Management / Live Support / Tickets | `/admin/support,/admin/live-support` | `—` | support+ | **missing** | no | no | No /admin/support module. |
| 80 | `admin-analytics` | Admin Analytics / Announcements / Role Management | `/admin (revenue, broadcast, team, push)` | `—` | admin/superadmin | **missing** | no | no | No /admin/analytics\|/admin/more. |
| 81 | `delete-account` | Delete Account / Data Deletion | `/delete-account,/data-deletion` | `—` | buyer/guest | **missing** | no | no | Web delete-account/data-deletion; required for store compliance. |
| 82 | `website-embed` | Website WebView shell | `*` | `/website` | any | **placeholder** | no | no | Intentional NativePlaceholder — do not restore WebView shell. |
| 83 | `esim` | Flexa eSIM | `—` | `/esim` | buyer | **out_of_scope** | no | no | Marked out_of_scope for Android native completion. Honest deferred screen present; no provider. |
| 84 | `smart-notifications` | Smart notification deep-links | `—` | `PushBootstrap` | buyer | **complete** | unknown | yes | Deep-link map wired; physical FCM delivery still unverified (see push-fcm). |

## In-scope items needing implementation

Statuses `partial` | `placeholder` | `missing` | `blocked` (excludes `out_of_scope` / `esim`):

- `auth-phone-login` (missing)
- `auth-forgot-password` (missing)
- `categories` (partial)
- `listing-detail` (partial)
- `public-tracking` (missing)
- `delivery-confirm` (partial)
- `wallet-topup` (blocked)
- `wallet-transfer` (missing)
- `flex-card-repay` (missing)
- `bnpl` (missing)
- `profile-account` (partial)
- `shop-profile` (missing)
- `settings-subpages` (missing)
- `push-fcm` (partial)
- `kyc` (placeholder)
- `subscription` (placeholder)
- `subscription-billing` (blocked)
- `referrals` (missing)
- `commission-promo` (missing)
- `jobs` (missing)
- `calculator` (missing)
- `help-center` (missing)
- `legal` (missing)
- `edit-listing` (missing)
- `video-upload` (placeholder)
- `inventory` (missing)
- `seller-analytics` (missing)
- `earnings-payouts` (missing)
- `boost` (placeholder)
- `boost-paid` (blocked)
- `boost-analytics` (placeholder)
- `my-boosts` (placeholder)
- `promo-videos` (placeholder)
- `drafts` (missing)
- `store-manager` (missing)
- `seller-registration` (missing)
- `driver-apply` (placeholder)
- `driver-dashboard` (placeholder)
- `cash-agent` (missing)
- `loans` (placeholder)
- `credit-score` (missing)
- `flexa-tv` (missing)
- `music-purchase` (blocked)
- `admin-panel` (placeholder)
- `admin-users` (missing)
- `admin-moderation` (missing)
- `admin-finance` (missing)
- `admin-support` (missing)
- `admin-analytics` (missing)
- `delete-account` (missing)
- `website-embed` (placeholder)

## Policy notes

- **Flexa eSIM** → `out_of_scope` for Android native completion.
- **Digital purchases** (`wallet-topup`, `subscription-billing`, `boost-paid`, `music-purchase`) → `blocked` for Play Billing purchase; non-payment UI can still be completed where noted.
- **website-embed** remains intentional placeholder (no WebView marketplace shell).

## Machine-readable

See [`android-native-complete-inventory.json`](./android-native-complete-inventory.json).
