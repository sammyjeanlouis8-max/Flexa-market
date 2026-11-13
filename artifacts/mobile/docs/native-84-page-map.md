# Flexa Market — Native 84-Page Map

_Regenerated: 2026-11-12T22:59Z · Inventory features: **84** · Expo screen modules: **71** · NativePlaceholder in app/: **0**_

## Status counts

| Status | Count |
|---|---:|
| FULLY_NATIVE | 75 |
| PARTIALLY_NATIVE | 4 |
| PLACEHOLDER | 0 |
| MISSING | 0 |
| BLOCKED | 5 |
| **Total** | **84** |

## Full 84-feature mapping

| # | ID | Name | Web | Native | Status | Gaps |
|---:|---|---|---|---|---|---|
| 1 | `auth-login` | Login | `/auth/login` | `/auth/login` | **FULLY_NATIVE** | — |
| 2 | `auth-register` | Signup | `/auth/register` | `/auth/register` | **FULLY_NATIVE** | — |
| 3 | `auth-globe` | Animated Auth Globe | `(auth shell component)` | `components/auth/AuthGlobe` | **FULLY_NATIVE** | — |
| 4 | `auth-phone-login` | Phone login | `/auth/login-phone` | `/auth/login-phone` | **FULLY_NATIVE** | — |
| 5 | `auth-forgot-password` | Forgot password | `/auth/forgot-password` | `/auth/forgot-password` | **FULLY_NATIVE** | — |
| 6 | `home` | Home | `/` | `/` | **FULLY_NATIVE** | — |
| 7 | `search` | Search | `/search` | `/search` | **FULLY_NATIVE** | visual search; search history; category chips parity |
| 8 | `categories` | Categories | `/search?category=` | `/search` | **FULLY_NATIVE** | — |
| 9 | `listing-detail` | Product details | `/listings/:id` | `/listing/[id]` | **FULLY_NATIVE** | — |
| 10 | `cart` | Shopping Cart | `/cart` | `/cart` | **FULLY_NATIVE** | — |
| 11 | `checkout` | Checkout (wallet / Card FM) | `/cart (modal)` | `/checkout` | **FULLY_NATIVE** | — |
| 12 | `checkout-success` | Order confirmation | `/checkout/success` | `/checkout-success` | **FULLY_NATIVE** | — |
| 13 | `stripe-single-item` | Stripe single-item checkout | `/listings/:id (buy)` | `/stripe-checkout` | **FULLY_NATIVE** | PaymentSheet embedded mode (hosted browser used) |
| 14 | `favorites` | Favorites / Saved | `/saved` | `/favorites` | **FULLY_NATIVE** | — |
| 15 | `orders` | Orders | `/orders` | `/orders` | **FULLY_NATIVE** | — |
| 16 | `order-detail` | Order Details | `/orders/:id` | `/orders/[id]` | **FULLY_NATIVE** | seller ship/label actions deferred to 3D |
| 17 | `delivery-tracking` | Order / Delivery Tracking | `/delivery/tracking/:id` | `/delivery-tracking` | **FULLY_NATIVE** | public /track parity |
| 18 | `public-tracking` | Public tracking | `/track/:trackingNumber` | `/track/[trackingNumber]` | **FULLY_NATIVE** | — |
| 19 | `delivery-confirm` | Delivery Confirmation | `/orders/:id/delivered` | `/orders/[id]` | **PARTIALLY_NATIVE** | tip/rating modal polish |
| 20 | `addresses` | Addresses | `/settings/addresses` | `/addresses` | **FULLY_NATIVE** | — |
| 21 | `wallet` | Wallet | `/wallet` | `/wallet` | **FULLY_NATIVE** | top-up (BLOCKED); P2P transfer (deferred); virtual card panel |
| 22 | `wallet-topup` | Wallet top-up / Card FM recharge | `/wallet` | `/wallet` | **BLOCKED** | Play Billing or policy-compliant top-up |
| 23 | `wallet-transfer` | Wallet P2P transfer | `/wallet/transfer` | `/wallet-transfer` | **FULLY_NATIVE** | — |
| 24 | `wallet-history` | Transaction History | `/wallet/history` | `/wallet-history` | **FULLY_NATIVE** | — |
| 25 | `flex-card-repay` | Flex Card repay | `/flex-card/repay` | `/flex-card-repay` | **FULLY_NATIVE** | — |
| 26 | `bnpl` | BNPL | `/bnpl` | `/bnpl` | **FULLY_NATIVE** | — |
| 27 | `profile-account` | Account / Profile hub | `/settings + /profile/:id` | `/profile` | **FULLY_NATIVE** | — |
| 28 | `shop-profile` | Public seller shop | `/profile/:id` | `/shop/[id]` | **FULLY_NATIVE** | — |
| 29 | `edit-profile` | Edit Profile | `/profile/edit` | `/edit-profile` | **FULLY_NATIVE** | email change (website) |
| 30 | `settings` | Settings (marketplace country) | `/settings` | `/settings` | **FULLY_NATIVE** | privacy/help/payments rows |
| 31 | `settings-subpages` | Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) | `/settings/*` | `/settings/*` | **FULLY_NATIVE** | — |
| 32 | `notifications` | Notifications | `(bell) /notifications APIs` | `/notifications` | **FULLY_NATIVE** | Foreground FCM delivery verification on device |
| 33 | `push-fcm` | Android push (FCM) | `N/A` | `expo-notifications` | **PARTIALLY_NATIVE** | physical device FCM proof |
| 34 | `kyc` | Account Verification (KYC) | `/kyc` | `/kyc` | **FULLY_NATIVE** | — |
| 35 | `language-picker` | Language picker | `(modal)` | `/language-picker` | **FULLY_NATIVE** | — |
| 36 | `offers` | Offers | `/offers` | `/offers` | **FULLY_NATIVE** | — |
| 37 | `subscription` | Subscription / VIP | `/subscription` | `/subscription` | **PARTIALLY_NATIVE** | Play Billing IAP |
| 38 | `subscription-billing` | Subscription digital purchase | `/subscription` | `/subscription` | **BLOCKED** | Play Billing integration |
| 39 | `referrals` | Referral System / Leaderboard | `/leaderboard` | `/leaderboard` | **FULLY_NATIVE** | — |
| 40 | `commission-promo` | Commission promo | `/commission-promo` | `/commission-promo` | **FULLY_NATIVE** | — |
| 41 | `jobs` | Jobs board | `/jobs` | `/jobs` | **FULLY_NATIVE** | — |
| 42 | `calculator` | CalcAI calculator | `/calculator` | `/calculator` | **FULLY_NATIVE** | — |
| 43 | `help-center` | Help Center / FAQ / Contact | `/help-center,/faq,/contact,/settings/help` | `/help-center` | **FULLY_NATIVE** | — |
| 44 | `legal` | Legal pages (privacy, terms, EULA, policies) | `/privacy-policy,/terms,/eula,...` | `/legal/[slug]` | **FULLY_NATIVE** | — |
| 45 | `inbox` | Kominike / Inbox / Messages | `/messages` | `/inbox` | **FULLY_NATIVE** | — |
| 46 | `chat-thread` | Private / Product Chat | `/messages/:id` | `/chat/[id]` | **FULLY_NATIVE** | voice notes UI; video attachments UI |
| 47 | `support-tickets` | Support Center / Tickets | `/support,/support/:id` | `/support` | **FULLY_NATIVE** | — |
| 48 | `chatbot` | FlexaBot Chatbot | `/chatbot` | `/chatbot` | **FULLY_NATIVE** | — |
| 49 | `sell` | Add Product / Sell | `/sell` | `/sell` | **FULLY_NATIVE** | — |
| 50 | `my-listings` | Product Management / My Listings | `/profile/{me}, drafts` | `/my-listings` | **FULLY_NATIVE** | — |
| 51 | `edit-listing` | Edit Product | `/sell?edit= / listing edit` | `/sell-edit/[id]` | **FULLY_NATIVE** | — |
| 52 | `image-upload` | Image Upload | `(Sell)` | `/sell` | **FULLY_NATIVE** | — |
| 53 | `video-upload` | Video Upload | `/videos, drafts` | `/videos` | **FULLY_NATIVE** | — |
| 54 | `inventory` | Inventory / Restock | `(listing management)` | `/my-listings` | **FULLY_NATIVE** | — |
| 55 | `sales` | Seller Dashboard / Sales | `/sales` | `/sales` | **FULLY_NATIVE** | — |
| 56 | `seller-analytics` | Sales Analytics | `/settings/analytics` | `/analytics` | **FULLY_NATIVE** | — |
| 57 | `seller-orders` | Seller Orders Management | `/orders (sales tab)` | `/sales` | **FULLY_NATIVE** | — |
| 58 | `earnings-payouts` | Earnings / Commissions / Payouts | `/settings/payments, wallet` | `/settings/payments` | **FULLY_NATIVE** | — |
| 59 | `boost` | Boost Campaigns | `/boost/:listingId,/booster/*` | `/boost` | **PARTIALLY_NATIVE** | paid boost Play Billing |
| 60 | `boost-paid` | Paid Boost purchase | `/boost/:id` | `/boost` | **BLOCKED** | Play Billing or alternate |
| 61 | `boost-analytics` | Boost Analytics | `/boost-analytics` | `/boost-analytics` | **FULLY_NATIVE** | — |
| 62 | `my-boosts` | My Boosts | `/my-boosts` | `/my-boosts` | **FULLY_NATIVE** | — |
| 63 | `promo-videos` | Promotional Videos / Video Discover | `/videos,/videos/watch` | `/videos` | **FULLY_NATIVE** | TikTok-style fullscreen player optional |
| 64 | `drafts` | My Drafts / Bouillon | `/my-drafts` | `/my-drafts` | **FULLY_NATIVE** | — |
| 65 | `store-manager` | Store Manager Dashboard | `/manager` | `/manager` | **FULLY_NATIVE** | — |
| 66 | `seller-registration` | Seller Registration / Stripe Connect | `/sell + /settings/stripe-return` | `/sell` | **FULLY_NATIVE** | — |
| 67 | `driver-apply` | Driver Registration | `/delivery/apply` | `/driver-apply` | **FULLY_NATIVE** | — |
| 68 | `driver-dashboard` | Driver Dashboard / Jobs | `/driver/dashboard,/delivery/deliveries,/delivery/job/:id` | `/driver-dashboard` | **FULLY_NATIVE** | — |
| 69 | `cash-agent` | Cash Agent directory / dashboard | `/wallet/agents,/agent,/agents/apply` | `/agents` | **FULLY_NATIVE** | — |
| 70 | `loans` | Business Loans | `/loans` | `/loans` | **FULLY_NATIVE** | — |
| 71 | `credit-score` | Credit Score | `/credit-score` | `/credit-score` | **FULLY_NATIVE** | — |
| 72 | `flexa-tv` | Flexa TV | `/tv` | `/tv` | **FULLY_NATIVE** | — |
| 73 | `flexa-music` | Flexa Music | `/music,/music/upload,/music/earnings,/music/play/:id` | `/music` | **FULLY_NATIVE** | — |
| 74 | `music-purchase` | Music digital purchase | `/music` | `/music` | **BLOCKED** | Play Billing digital goods |
| 75 | `admin-panel` | Admin Panel / Super Admin Dashboard | `/admin,/admin/*` | `/admin` | **FULLY_NATIVE** | — |
| 76 | `admin-users` | User / Seller / Driver Management | `/admin/users,/admin/driver-applications,/admin/agents` | `/admin?tab=users` | **FULLY_NATIVE** | — |
| 77 | `admin-moderation` | Product Moderation / Reports / Disputes | `/admin/moderation,/admin/reports,/admin/appeals` | `/admin?tab=moderation` | **FULLY_NATIVE** | — |
| 78 | `admin-finance` | Financial Management / Payments / Wallet Ops / Refunds | `/admin/transactions,/admin/stripe-transactions,/admin?tab=wallet|payments|...` | `/admin?tab=finance` | **FULLY_NATIVE** | — |
| 79 | `admin-support` | Support Agent Management / Live Support / Tickets | `/admin/support,/admin/live-support` | `/admin?tab=support` | **FULLY_NATIVE** | — |
| 80 | `admin-analytics` | Admin Analytics / Announcements / Role Management | `/admin (revenue, broadcast, team, push)` | `/admin` | **FULLY_NATIVE** | — |
| 81 | `delete-account` | Delete Account / Data Deletion | `/delete-account,/data-deletion` | `/delete-account` | **FULLY_NATIVE** | — |
| 82 | `website-embed` | Website WebView shell | `*` | `/website` | **FULLY_NATIVE** | — |
| 83 | `esim` | Flexa eSIM | `None` | `/esim` | **BLOCKED** | provider integration |
| 84 | `smart-notifications` | Smart notification deep-links | `None` | `PushBootstrap` | **FULLY_NATIVE** | physical FCM delivery verification |

## Expo route modules

- `app/(tabs)/cart.tsx`
- `app/(tabs)/inbox.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/profile.tsx`
- `app/(tabs)/search.tsx`
- `app/addresses.tsx`
- `app/admin.tsx`
- `app/agents.tsx`
- `app/analytics.tsx`
- `app/auth/forgot-password.tsx`
- `app/auth/login-phone.tsx`
- `app/auth/login.tsx`
- `app/auth/register.tsx`
- `app/bnpl.tsx`
- `app/boost-analytics.tsx`
- `app/boost.tsx`
- `app/calculator.tsx`
- `app/cart.tsx`
- `app/chat/[id].tsx`
- `app/chatbot.tsx`
- `app/checkout-success.tsx`
- `app/checkout.tsx`
- `app/commission-promo.tsx`
- `app/credit-score.tsx`
- `app/delete-account.tsx`
- `app/delivery-tracking.tsx`
- `app/driver-apply.tsx`
- `app/driver-dashboard.tsx`
- `app/edit-profile.tsx`
- `app/esim.tsx`
- `app/favorites.tsx`
- `app/flex-card-repay.tsx`
- `app/help-center.tsx`
- `app/jobs.tsx`
- `app/kyc.tsx`
- `app/language-picker.tsx`
- `app/leaderboard.tsx`
- `app/legal/[slug].tsx`
- `app/listing/[id].tsx`
- `app/loans.tsx`
- `app/manager.tsx`
- `app/music.tsx`
- `app/my-boosts.tsx`
- `app/my-drafts.tsx`
- `app/my-listings.tsx`
- `app/notifications.tsx`
- `app/offers.tsx`
- `app/orders.tsx`
- `app/orders/[id].tsx`
- `app/sales.tsx`
- `app/sell-edit/[id].tsx`
- `app/sell.tsx`
- `app/settings.tsx`
- `app/settings/help.tsx`
- `app/settings/notifications.tsx`
- `app/settings/payments.tsx`
- `app/settings/privacy.tsx`
- `app/settings/security.tsx`
- `app/shop/[id].tsx`
- `app/stripe-checkout.tsx`
- `app/subscription.tsx`
- `app/support.tsx`
- `app/support/[id].tsx`
- `app/track.tsx`
- `app/track/[trackingNumber].tsx`
- `app/tv.tsx`
- `app/videos.tsx`
- `app/wallet-history.tsx`
- `app/wallet-transfer.tsx`
- `app/wallet.tsx`
- `app/website.tsx`
