# Flexa Market — Native 84-Page Map

_Generated: 2026-11-12T22:33Z · Source: `artifacts/mobile/docs/phase3-migration-inventory.json` (82 tracked product surfaces) + live `artifacts/mobile/app/**/*.tsx` audit_

## Status legend (this document)

| Status | Meaning | Inventory equivalent |
|---|---|---|
| **NATIVE_DONE** | Real RN UI + API wiring | FULLY_NATIVE |
| **PARTIAL** | Native shell/flow with critical gaps | PARTIALLY_NATIVE |
| **PLACEHOLDER** | `NativePlaceholder` / Redirect stub | PLACEHOLDER |
| **MISSING** | No native route yet | MISSING |
| **BLOCKED** | Android policy / provider / billing block | BLOCKED |

> Inventory counts 82 features (not 84). The “~84” figure includes layout/meta routes (`_layout`, `+not-found`) and/or informal page tallies; **definitive product surface count = 82**.

## Summary counts

| Status | Count |
|---|---:|
| NATIVE_DONE | 23 |
| PARTIAL | 5 |
| PLACEHOLDER | 16 |
| MISSING | 33 |
| BLOCKED | 5 |
| **Total tracked surfaces** | **82** |

Native Expo route files (`.tsx` under `app/`): **40**  
Of which layout/meta: **3** · implemented: **23** · NativePlaceholder: **13** · redirect stub: **1**

## All Expo Router route files (`artifacts/mobile/app/**/*.tsx`)

| File | Expo path | File kind |
|---|---|---|
| `app/(tabs)/_layout.tsx` | `—` | LAYOUT/META |
| `app/(tabs)/inbox.tsx` | `/inbox` | IMPLEMENTED |
| `app/(tabs)/index.tsx` | `/` | IMPLEMENTED |
| `app/(tabs)/profile.tsx` | `/profile` | IMPLEMENTED |
| `app/(tabs)/search.tsx` | `/search` | IMPLEMENTED |
| `app/(tabs)/sell.tsx` | `/sell` | PLACEHOLDER_FILE |
| `app/+not-found.tsx` | `—` | LAYOUT/META |
| `app/_layout.tsx` | `—` | LAYOUT/META |
| `app/addresses.tsx` | `/addresses` | IMPLEMENTED |
| `app/admin.tsx` | `/admin` | PLACEHOLDER_FILE |
| `app/auth/login.tsx` | `/auth/login` | IMPLEMENTED |
| `app/auth/register.tsx` | `/auth/register` | IMPLEMENTED |
| `app/boost.tsx` | `/boost` | PLACEHOLDER_FILE |
| `app/cart.tsx` | `/cart` | IMPLEMENTED |
| `app/chat/[id].tsx` | `/chat/[id]` | IMPLEMENTED |
| `app/checkout-success.tsx` | `/checkout-success` | IMPLEMENTED |
| `app/checkout.tsx` | `/checkout` | IMPLEMENTED |
| `app/delivery-tracking.tsx` | `/delivery-tracking` | IMPLEMENTED |
| `app/driver-apply.tsx` | `/driver-apply` | PLACEHOLDER_FILE |
| `app/driver-dashboard.tsx` | `/driver-dashboard` | PLACEHOLDER_FILE |
| `app/edit-profile.tsx` | `/edit-profile` | IMPLEMENTED |
| `app/esim.tsx` | `/esim` | DEFERRED_HONEST |
| `app/favorites.tsx` | `/favorites` | IMPLEMENTED |
| `app/kyc.tsx` | `/kyc` | PLACEHOLDER_FILE |
| `app/language-picker.tsx` | `/language-picker` | IMPLEMENTED |
| `app/listing/[id].tsx` | `/listing/[id]` | IMPLEMENTED |
| `app/loans.tsx` | `/loans` | REDIRECT_STUB |
| `app/my-boosts.tsx` | `/my-boosts` | PLACEHOLDER_FILE |
| `app/my-listings.tsx` | `/my-listings` | PLACEHOLDER_FILE |
| `app/notifications.tsx` | `/notifications` | IMPLEMENTED |
| `app/offers.tsx` | `/offers` | PLACEHOLDER_FILE |
| `app/orders.tsx` | `/orders` | IMPLEMENTED |
| `app/orders/[id].tsx` | `/orders/[id]` | IMPLEMENTED |
| `app/sales.tsx` | `/sales` | PLACEHOLDER_FILE |
| `app/settings.tsx` | `/settings` | IMPLEMENTED |
| `app/stripe-checkout.tsx` | `/stripe-checkout` | IMPLEMENTED |
| `app/subscription.tsx` | `/subscription` | PLACEHOLDER_FILE |
| `app/videos.tsx` | `/videos` | PLACEHOLDER_FILE |
| `app/wallet.tsx` | `/wallet` | IMPLEMENTED |
| `app/website.tsx` | `/website` | PLACEHOLDER_FILE |

## Full inventory mapping (82 surfaces)

| # | ID | Name | Domain | Web route | Native path | Status | Gaps / work |
|---:|---|---|---|---|---|---|---|
| 1 | `auth-login` | Login | auth | `/auth/login` | `/auth/login` | **NATIVE_DONE** | — |
| 2 | `auth-register` | Signup | auth | `/auth/register` | `/auth/register` | **NATIVE_DONE** | — |
| 3 | `auth-globe` | Animated Auth Globe | auth | `(auth shell component)` | `components/auth/AuthGlobe` | **NATIVE_DONE** | — |
| 4 | `auth-phone-login` | Phone login | auth | `/auth/login-phone` | `—` | **MISSING** | native phone OTP UI |
| 5 | `auth-forgot-password` | Forgot password | auth | `/auth/forgot-password` | `—` | **MISSING** | recovery screens |
| 6 | `home` | Home | customer | `/` | `/` | **NATIVE_DONE** | personalized feed parity, home video strip; feed works but missing Shop-by-Category, Todays Picks, green header chrome, FAB calc, hamburger drawer |
| 7 | `search` | Search | customer | `/search` | `/search` | **NATIVE_DONE** | visual search, search history, category chips parity |
| 8 | `categories` | Categories | customer | `/search?category=` | `/search` | **PARTIAL** | dedicated category browser UI |
| 9 | `listing-detail` | Product details | customer | `/listings/:id` | `/listing/[id]` | **PARTIAL** | message seller, reviews, BNPL, single-item Stripe buy, DR seller shipping checkout |
| 10 | `cart` | Shopping Cart | customer | `/cart` | `/cart` | **NATIVE_DONE** | — |
| 11 | `checkout` | Checkout (wallet / Card FM) | customer | `/cart (modal)` | `/checkout` | **NATIVE_DONE** | — |
| 12 | `checkout-success` | Order confirmation | customer | `/checkout/success` | `/checkout-success` | **NATIVE_DONE** | — |
| 13 | `stripe-single-item` | Stripe single-item checkout | customer | `/listings/:id (buy)` | `/stripe-checkout` | **NATIVE_DONE** | PaymentSheet embedded mode (hosted browser used) |
| 14 | `favorites` | Favorites / Saved | customer | `/saved` | `/favorites` | **NATIVE_DONE** | — |
| 15 | `orders` | Orders | customer | `/orders` | `/orders` | **NATIVE_DONE** | — |
| 16 | `order-detail` | Order Details | customer | `/orders/:id` | `/orders/[id]` | **NATIVE_DONE** | seller ship/label actions deferred to 3D |
| 17 | `delivery-tracking` | Order / Delivery Tracking | customer | `/delivery/tracking/:id` | `/delivery-tracking` | **NATIVE_DONE** | public /track parity |
| 18 | `public-tracking` | Public tracking | customer | `/track/:trackingNumber` | `—` | **MISSING** | guest tracking screen |
| 19 | `delivery-confirm` | Delivery Confirmation | customer | `/orders/:id/delivered` | `—` | **PARTIAL** | Tip/rating modals |
| 20 | `addresses` | Addresses | customer | `/settings/addresses` | `/addresses` | **NATIVE_DONE** | — |
| 21 | `wallet` | Wallet | customer | `/wallet` | `/wallet` | **NATIVE_DONE** | top-up (BLOCKED), P2P transfer (deferred), virtual card panel |
| 22 | `wallet-topup` | Wallet top-up / Card FM recharge | customer | `/wallet` | `/wallet` | **BLOCKED** | Play Billing or policy-compliant top-up |
| 23 | `wallet-transfer` | Wallet P2P transfer | customer | `/wallet/transfer` | `—` | **MISSING** | transfer UI |
| 24 | `wallet-history` | Transaction History | customer | `/wallet/history` | `/wallet` | **NATIVE_DONE** | — |
| 25 | `flex-card-repay` | Flex Card repay | customer | `/flex-card/repay` | `—` | **MISSING** | repay UI |
| 26 | `bnpl` | BNPL | customer | `/bnpl` | `—` | **MISSING** | eligibility + checkout UI |
| 27 | `profile-account` | Account / Profile hub | customer | `/settings + /profile/:id` | `/profile` | **PARTIAL** | public shop profile, sell still placeholder |
| 28 | `edit-profile` | Edit Profile | customer | `/profile/edit` | `/edit-profile` | **NATIVE_DONE** | email change (website) |
| 29 | `settings` | Settings (marketplace country) | customer | `/settings` | `/settings` | **NATIVE_DONE** | privacy/help/payments rows |
| 30 | `settings-subpages` | Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) | customer | `/settings/*` | `—` | **MISSING** | all settings sub-routes |
| 31 | `notifications` | Notifications | customer | `(bell) /notifications APIs` | `/notifications` | **NATIVE_DONE** | Foreground FCM delivery verification on device |
| 32 | `push-fcm` | Android push (FCM) | customer | `N/A` | `expo-notifications (partial deps)` | **PARTIAL** | Device FCM end-to-end verification, Do not claim push delivery |
| 33 | `kyc` | Account Verification (KYC) | customer | `/kyc` | `/kyc` | **PLACEHOLDER** | document upload flow |
| 34 | `language-picker` | Language picker | customer | `(modal)` | `/language-picker` | **NATIVE_DONE** | — |
| 35 | `offers` | Offers | customer | `/offers` | `/offers` | **PLACEHOLDER** | offer list + accept/counter |
| 36 | `subscription` | Subscription / VIP | customer | `/subscription` | `/subscription` | **PLACEHOLDER** | plans UI, Play Billing path |
| 37 | `subscription-billing` | Subscription digital purchase | customer | `/subscription` | `/subscription` | **BLOCKED** | Play Billing integration |
| 38 | `referrals` | Referral System / Leaderboard | customer | `/leaderboard` | `—` | **MISSING** | leaderboard UI |
| 39 | `commission-promo` | Commission promo | customer | `/commission-promo` | `—` | **MISSING** | promo UI |
| 40 | `jobs` | Jobs board | customer | `/jobs` | `—` | **MISSING** | jobs UI |
| 41 | `calculator` | CalcAI calculator | customer | `/calculator` | `—` | **MISSING** | calculator UI |
| 42 | `help-center` | Help Center / FAQ / Contact | support | `/help-center,/faq,/contact,/settings/help` | `—` | **MISSING** | static content screens |
| 43 | `legal` | Legal pages (privacy, terms, EULA, policies) | support | `/privacy-policy,/terms,/eula,...` | `—` | **MISSING** | in-app legal viewers |
| 44 | `inbox` | Kominike / Inbox / Messages | communication | `/messages` | `/inbox` | **NATIVE_DONE** | — |
| 45 | `chat-thread` | Private / Product Chat | communication | `/messages/:id` | `/chat/[id]` | **NATIVE_DONE** | voice notes UI, video attachments UI |
| 46 | `support-tickets` | Support Center / Tickets | communication | `/support,/support/:id` | `—` | **MISSING** | ticket list + thread + rating |
| 47 | `chatbot` | FlexaBot Chatbot | communication | `/chatbot` | `—` | **MISSING** | bot UI |
| 48 | `sell` | Add Product / Sell | seller | `/sell` | `/sell` | **PLACEHOLDER** | create listing form, image upload, payout checks |
| 49 | `my-listings` | Product Management / My Listings | seller | `/profile/{me}, drafts` | `/my-listings` | **PLACEHOLDER** | manage list + edit |
| 50 | `edit-listing` | Edit Product | seller | `/sell?edit= / listing edit` | `—` | **MISSING** | edit screen |
| 51 | `image-upload` | Image Upload | seller | `(Sell)` | `—` | **MISSING** | native picker + chunked upload |
| 52 | `video-upload` | Video Upload | seller | `/videos, drafts` | `/videos` | **PLACEHOLDER** | upload + discover UI |
| 53 | `inventory` | Inventory / Restock | seller | `(listing management)` | `—` | **MISSING** | stock controls |
| 54 | `sales` | Seller Dashboard / Sales | seller | `/sales` | `/sales` | **PLACEHOLDER** | dashboard UI |
| 55 | `seller-analytics` | Sales Analytics | seller | `/settings/analytics` | `—` | **MISSING** | analytics charts |
| 56 | `seller-orders` | Seller Orders Management | seller | `/orders (sales tab)` | `/orders` | **PLACEHOLDER** | sales-side actions; buyer /orders is NATIVE_DONE; seller ship/label actions still missing → PLACEHOLDER |
| 57 | `earnings-payouts` | Earnings / Commissions / Payouts | seller | `/settings/payments, wallet` | `—` | **MISSING** | payout onboarding UI, Stripe Connect return |
| 58 | `boost` | Boost Campaigns | seller | `/boost/:listingId,/booster/*` | `/boost` | **PLACEHOLDER** | campaign create UI |
| 59 | `boost-paid` | Paid Boost purchase | seller | `/boost/:id` | `/boost` | **BLOCKED** | Play Billing or alternate |
| 60 | `boost-analytics` | Boost Analytics | seller | `/boost-analytics` | `/my-boosts` | **PLACEHOLDER** | analytics UI |
| 61 | `promo-videos` | Promotional Videos / Video Discover | seller | `/videos,/videos/watch` | `/videos` | **PLACEHOLDER** | TikTok-style feed |
| 62 | `drafts` | My Drafts / Bouillon | seller | `/my-drafts` | `—` | **MISSING** | drafts UI |
| 63 | `store-manager` | Store Manager Dashboard | seller | `/manager` | `—` | **MISSING** | manager UI |
| 64 | `seller-registration` | Seller Registration / Stripe Connect | seller | `/sell + /settings/stripe-return` | `—` | **MISSING** | onboarding + return handling |
| 65 | `driver-apply` | Driver Registration | driver | `/delivery/apply` | `/driver-apply` | **PLACEHOLDER** | application form + selfie |
| 66 | `driver-dashboard` | Driver Dashboard / Jobs | driver | `/driver/dashboard,/delivery/deliveries,/delivery/job/:id` | `/driver-dashboard` | **PLACEHOLDER** | browse/accept/job detail |
| 67 | `cash-agent` | Cash Agent directory / dashboard | agent | `/wallet/agents,/agent,/agents/apply` | `—` | **MISSING** | agent flows |
| 68 | `loans` | Business Loans | fintech | `/loans` | `/loans` | **PLACEHOLDER** | intentionally redirects home today; native file is Redirect→/; treat as PLACEHOLDER |
| 69 | `credit-score` | Credit Score | fintech | `/credit-score` | `—` | **MISSING** | credit UI |
| 70 | `flexa-tv` | Flexa TV | media | `/tv` | `—` | **MISSING** | TV player UI |
| 71 | `flexa-music` | Flexa Music | media | `/music,/music/upload,/music/earnings,/music/play/:id` | `—` | **MISSING** | player + upload |
| 72 | `music-purchase` | Music digital purchase | media | `/music` | `—` | **BLOCKED** | Play Billing |
| 73 | `admin-panel` | Admin Panel / Super Admin Dashboard | admin | `/admin,/admin/*` | `/admin` | **PLACEHOLDER** | entire control center |
| 74 | `admin-users` | User / Seller / Driver Management | admin | `/admin/users,/admin/driver-applications,/admin/agents` | `—` | **MISSING** | management UIs |
| 75 | `admin-moderation` | Product Moderation / Reports / Disputes | admin | `/admin/moderation,/admin/reports,/admin/appeals` | `—` | **MISSING** | moderation tools |
| 76 | `admin-finance` | Financial Management / Payments / Wallet Ops / Refunds | admin | `/admin/transactions,/admin/stripe-transactions,/admin?tab=wallet|payments|...` | `—` | **MISSING** | finance consoles |
| 77 | `admin-support` | Support Agent Management / Live Support / Tickets | admin | `/admin/support,/admin/live-support` | `—` | **MISSING** | agent desk UI |
| 78 | `admin-analytics` | Admin Analytics / Announcements / Role Management | admin | `/admin (revenue, broadcast, team, push)` | `—` | **MISSING** | broadcast + team role UI |
| 79 | `delete-account` | Delete Account / Data Deletion | customer | `/delete-account,/data-deletion` | `—` | **MISSING** | store-compliance flows |
| 80 | `website-embed` | Website WebView shell | legacy | `*` | `/website` | **PLACEHOLDER** | intentionally not embedding website |
| 81 | `esim` | Flexa eSIM | customer | `—` | `/esim` | **BLOCKED** | provider integration; honest DEFERRED screen at /esim (no catalog) |
| 82 | `smart-notifications` | Smart notification deep-links | communication | `—` | `PushBootstrap` | **NATIVE_DONE** | physical FCM delivery verification |

## Counts by domain

| Domain | NATIVE_DONE | PARTIAL | PLACEHOLDER | MISSING | BLOCKED | Total |
|---|---:|---:|---:|---:|---:|---:|
| admin | 0 | 0 | 1 | 5 | 0 | 6 |
| agent | 0 | 0 | 0 | 1 | 0 | 1 |
| auth | 3 | 0 | 0 | 2 | 0 | 5 |
| communication | 3 | 0 | 0 | 2 | 0 | 5 |
| customer | 17 | 5 | 3 | 10 | 3 | 38 |
| driver | 0 | 0 | 2 | 0 | 0 | 2 |
| fintech | 0 | 0 | 1 | 1 | 0 | 2 |
| legacy | 0 | 0 | 1 | 0 | 0 | 1 |
| media | 0 | 0 | 0 | 2 | 1 | 3 |
| seller | 0 | 0 | 8 | 8 | 1 | 17 |
| support | 0 | 0 | 0 | 2 | 0 | 2 |

## Top 15 missing / placeholder screens (priority)

Product-facing priority (seller/buyer continuity first; aligned with Phase 3D→3E). Placeholders already have Expo routes and are faster wins than pure MISSING.

| # | Status | ID | Name | Web | Native | Why next |
|---:|---|---|---|---|---|---|
| 1 | PLACEHOLDER | `sell` | Add Product / Sell | `/sell` | `/sell` | Critical seller Phase 3 — create listing form |
| 2 | MISSING | `image-upload` | Image Upload | `(Sell)` | — | Prerequisite for Sell; bg upload module exists |
| 3 | PLACEHOLDER | `my-listings` | Product Management / My Listings | `/profile/{me}, drafts` | `/my-listings` | Manage/edit listings with Sell |
| 4 | MISSING | `edit-listing` | Edit Product | `/sell?edit=` | — | With Sell |
| 5 | PLACEHOLDER | `seller-orders` | Seller Orders Management | `/orders (sales tab)` | `/orders` | Ship/label actions on native order detail |
| 6 | PLACEHOLDER | `sales` | Seller Dashboard / Sales | `/sales` | `/sales` | Seller metrics after orders |
| 7 | PLACEHOLDER | `offers` | Offers | `/offers` | `/offers` | Accept/counter after messaging |
| 8 | PLACEHOLDER | `kyc` | Account Verification (KYC) | `/kyc` | `/kyc` | Needed before some sell/wallet flows |
| 9 | PLACEHOLDER | `boost` | Boost Campaigns | `/boost/:listingId` | `/boost` | Non-paid boost UI (paid BLOCKED) |
| 10 | PLACEHOLDER | `boost-analytics` | Boost Analytics | `/boost-analytics` | `/my-boosts` | After Boost |
| 11 | PLACEHOLDER | `promo-videos` | Promotional Videos / Video Discover | `/videos` | `/videos` | TikTok-style feed |
| 12 | MISSING | `support-tickets` | Support Center / Tickets | `/support` | — | Reuse inbox/chat patterns |
| 13 | MISSING | `calculator` | CalcAI calculator | `/calculator` | — | Home FAB parity |
| 14 | MISSING | `help-center` | Help Center / FAQ / Contact | `/help-center,/faq,/contact` | — | Static content; store polish |
| 15 | MISSING | `legal` | Legal pages | `/privacy-policy,/terms,/eula` | — | Required for store compliance |


## Web Home UI building blocks to replicate natively

Source: `artifacts/marketplace/src/components/Layout.tsx`, `PremiumSideMenu.tsx`, `pages/Home.tsx`.

### 1. Green market header (`Layout.tsx`)
- Sticky top bar: `bg-[hsl(152,65%,18%)]` white text
- Left: **hamburger** (`nav-hamburger`) → opens PremiumSideMenu
- Brand: Flexa logo + “Flexa Market” (+ short tagline on sm+)
- Right: Account icon, **bell** (`NotificationsDropdown`, signed-in), **cart** (`CartIconButton`)
- Desktop-only under-header: All / Today’s Deals / category pills

### 2. Hamburger drawer items (`PremiumSideMenu`)

**Home & Discover**
- Home `/`
- Categories `/search`
- Offers & Promotions `/offers`
- Flexa Picks `/search?boosted=true`
- Videos `/videos`

**Shop & Products** (signed-in)
- My Shop `/profile/:id`
- My Products `/profile/:id`
- Add a product `/sell`
- My Videos `/settings/videos`
- My Boosts `/booster`
- Boost Analytics `/boost-analytics`
- Shop settings `/settings`

**Orders & Sales** (signed-in)
- My Orders `/orders`
- Sales `/sales`
- Returns & Refunds `/support`
- Reviews & Ratings `/profile/:id`

**Delivery** (when FM delivery links allowed for country)
- Available deliveries `/delivery/deliveries`
- Apply / driver status `/delivery/apply`
- My Deliveries `/driver/dashboard` (approved drivers)
- Order tracking `/track`

**My Account**
- Guest: Login `/auth/login`
- Signed-in: Profile, Saved `/saved`, My Drafts `/my-drafts`, Wallet, Promo Account, Subscription, Settings, Security & Login, Notifications prefs

**Flexa Services**
- Flexa TV `/tv`
- Flexa Music `/music`
- My Boosts `/booster` (signed-in)
- Commission promo `/commission-promo` (signed-in)
- Jobs `/jobs`
- Referral Program `/leaderboard` (signed-in)
- FlexaBot AI `/chatbot`
- Support `/support`

**Financial support** (HT/DR, non-native-webview path)
- Credit Score `/credit-score`
- Loans `/loans`

**Admin** (role-gated)
- Admin Dashboard `/admin`
- Moderator Panel `/admin?tab=moderation`

Drawer chrome: green brand header, user chip (name · role · FM-id · verified), promo/wallet balance shortcut, language picker, dark mode, logout.

### 3. Bottom nav — 5 items (web mobile)
| Tab | Label | Route |
|---|---|---|
| 1 | Home | `/` |
| 2 | Categories | `/search` |
| 3 | Messages | `/messages` (badge unread) |
| 4 | Cart | `/cart` (badge count) |
| 5 | Account | `/settings` or `/auth/login` |

**Native today differs:** Home · Search · Sell · Chat · Account (`app/(tabs)/_layout.tsx`). Cart/notifications live in Home header chips, not bottom nav.

### 4. Home body sections (`Home.tsx`)
1. **Country / Deliver-to selector** — guest country picker overlay; signed-in uses profile country; city picker + Near You / My City / In {country} scope chips
2. Horizontal category underline nav
3. **BOOSTED / For You hero banner** — green gradient card with Boosted badge + Shop Now (or For You)
4. **Shop by Category** — 4×2 icon grid (8 cats) + See all → `/search`
5. For You personalized grid (signed-in, non-admin)
6. **Today’s Picks / Today’s Deals** — 2-slot orange panel; “⚡ Boosted listings” when applicable; CTA **View All Boosted Listings** → `/search?boosted=true`
7. Featured / PROMAX product grid + interstitual video promo tiles

### 5. FAB calculator
- Signed-in + on `/` only: orange→amber circular FAB → `/calculator` (CalcAI)
- Positioned above bottom nav safe area

### 6. Bell + Cart
- Header bell → notifications dropdown / list
- Header cart icon → `/cart` with count badge

### Native Home parity gaps (current `/` tab)
- No green header / hamburger drawer
- No Shop by Category grid
- No Today’s Picks panel / BOOSTED hero
- No FAB calculator
- Country chip → `/settings` only (no inline Deliver-to / city / scope chips)
- No dedicated bell in header (notifications reachable elsewhere)
- Cart is a chip, not header icon; bottom nav ≠ web’s 5 tabs

## MarketplaceContext — country switching

File: `artifacts/mobile/context/MarketplaceContext.tsx`

- Storage key: `flexamarket_marketplace_country` (AsyncStorage)
- Default: `Haiti`
- API: `{ country, setCountry(next), isReady }`
- Boot: load stored guest preference → `isReady=true`
- **Auth override:** when `user.country` is set, it wins over guest preference
- `setCountry` updates state + AsyncStorage (guest browse)
- Consumers: Home (`fetchHomeStats` / `fetchListings` scoped by country), Search, Profile, Settings country sheet
- Settings UI: marketplace country picker sheet; copy notes guests browse selected country, signed-in shoppers use account country from backend

Web analogue: `useShoppingLocation` + `useAdminCountry` on Home (guest destination vs profile country vs admin scope).

## API / lib modules under `artifacts/mobile/lib`

| File | Role |
|---|---|
| `addressesApi.ts` | CRUD `/api/me/addresses` |
| `api.ts` | Core listings/home stats HTTP client |
| `authApi.ts` | Login / register / me |
| `chatApi.ts` | Conversations + messages + unread |
| `chatSocket.ts` | Socket.IO realtime + poll fallback |
| `checkoutApi.ts` | Cart checkout + delivery price |
| `countries.ts` | Supported countries + flags |
| `devicePerf.ts` | Device performance tier helpers |
| `favoritesApi.ts` | Favorites list/mutate |
| `globeAssetCache.ts` | AuthGlobe asset cache |
| `nativeAuthBridge.js` | Native auth bridge glue |
| `notificationDeepLink.ts` | Push tap → route mapping |
| `notificationsApi.ts` | Notification list/mark |
| `orderUi.ts` | Order presentation helpers |
| `ordersApi.ts` | Purchases / order detail / actions |
| `profileApi.ts` | Profile update / avatar / password |
| `pushPrep.ts` | Expo push token registration prep |
| `stripeCheckoutApi.ts` | Single-item Stripe checkout session |
| `walletApi.ts` | Balance + history |

## Notes

- Do not restore `/website` WebView marketplace shell (`website-embed` PLACEHOLDER is intentional).
- Digital purchase paths (wallet top-up, paid boost, subscription checkout, music buy) remain **BLOCKED** under `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE`.
- eSIM is **BLOCKED/DEFERRED** with an honest screen — no fake plans.

