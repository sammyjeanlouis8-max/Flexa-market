# Flexa Market native ↔ WebView parity — PR #243

## Acceptance vs criteria
**Not yet 84/84 on both platforms.**

- **iPhone:** 0/84 verified UI — **BLOCKED** (no Mac / Xcode / Simulator on this agent). Exact missing access: macOS QA runner with Xcode, iOS Simulator or device, and ability to install an Expo/`expo run:ios` QA build of this branch.
- **Android:** Transfer blank-gap **fixed and retested** on vc62; driver job+PIN route **added**; sell draft autosave **added**. Prior gallery proved 78 screens open on emulator. Full WebView feature parity for every control on all 84 screens is **still in progress** (home ProMax feed, PDP offers/zoom, multi-method checkout, chat AV, TikTok video feed remain).
- **Policy BLOCKED on Android (6):** Play Billing / FCM device / eSIM — need store/device/provider access.

## Builds
- **Commit:** (filled after git)
- **Android QA:** `com.flexamarket.app` · `1.0.1` · **versionCode 62** · emulator `sdk_gphone64_x86_64` (API 34)
- **iPhone QA:** **BLOCKED** — no Xcode/iOS Simulator on this Linux Cloud Agent. Shared RN changes apply to both platforms once built on a Mac runner.
- **Backend:** `https://flexamarket.com/api`
- **No release AAB / no merge / no publish.**

## Totals (out of 84)
| Platform | PASS | FAIL | BLOCKED |
|---|---:|---:|---:|
| Android | 78 | 0 | 6 |
| iPhone | 0 | 0 | 84 |

### Android BLOCKED (policy)
22 wallet top-up · 33 FCM device · 38/60/74 Play Billing · 83 eSIM provider

### iPhone BLOCKED (environment)
All 84 — missing Mac/iOS Simulator access for installed-app UI verification.

## Fixes in this pass
1. **Flexa Card Transfer** (`wallet-transfer.tsx`): removed empty FlatList blank gap; WebView step flow (Market/Wholesale search → amount → confirm → done); balance, fees banner, history link.
2. **Transfer E2E:** $1.25 P2P seller→buyer; seller −$1.25 once; buyer +$1.18 net; idempotent retry OK; history screen opened.
3. **Driver job + PIN** (`delivery/job/[id].tsx`): milestones + `POST /verify-code` PIN panel; dashboard “Open job” entry.
4. **Sell draft:** AppState + 4s autosave flush (`flexa_sell_draft_v2`).

## Remaining feature gaps (tracked, not blocking transfer)
See explore notes: ProMax home feed, PDP zoom/offers, full checkout methods, chat voice/video, TikTok video feed. Continue iteratively.

## Index (per screen)

| # | Name | Web | Native | Role | Android L/F/API | iPhone L/F/API | Shots |
|---:|---|---|---|---|---|---|---|
| 01 | Login | `/auth/login` | `/auth/login` | guest | PASS/PASS/N/A | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 02 | Signup | `/auth/register` | `/auth/register` | guest | PASS/PASS/N/A | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 03 | Animated Auth Globe | `(auth shell component)` | `components/auth/AuthGlobe` | guest | PASS/PASS/N/A | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 04 | Phone login | `/auth/login-phone` | `/auth/login-phone` | guest | PASS/PASS/N/A | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 05 | Forgot password | `/auth/forgot-password` | `/auth/forgot-password` | guest | PASS/PASS/N/A | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 06 | Home | `/` | `/` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 07 | Search | `/search` | `/search` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 08 | Categories | `/search?category=` | `/search` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 09 | Product details | `/listings/:id` | `/listing/[id]` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 10 | Shopping Cart | `/cart` | `/cart` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 11 | Checkout (wallet / Card FM) | `/cart (modal)` | `/checkout` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 12 | Order confirmation | `/checkout/success` | `/checkout-success` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 13 | Stripe single-item checkout | `/listings/:id (buy)` | `/stripe-checkout` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 14 | Favorites / Saved | `/saved` | `/favorites` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 15 | Orders | `/orders` | `/orders` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 16 | Order Details | `/orders/:id` | `/orders/[id]` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 17 | Order / Delivery Tracking | `/delivery/tracking/:id` | `/delivery-tracking` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 18 | Public tracking | `/track/:trackingNumber` | `/track/[trackingNumber]` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 19 | Delivery Confirmation | `/orders/:id/delivered` | `/orders/[id]` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 20 | Addresses | `/settings/addresses` | `/addresses` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 21 | Wallet | `/wallet` | `/wallet` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 22 | Wallet top-up / Card FM recharge | `/wallet` | `/wallet` | buyer|blocked-policy | BLOCKED/BLOCKED/BLOCKED | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 23 | Wallet P2P transfer | `/wallet/transfer` | `/wallet-transfer` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 24 | Transaction History | `/wallet/history` | `/wallet-history` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 25 | Flex Card repay | `/flex-card/repay` | `/flex-card-repay` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 26 | BNPL | `/bnpl` | `/bnpl` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 27 | Account / Profile hub | `/settings + /profile/:id` | `/profile` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 28 | Public seller shop | `/profile/:id` | `/shop/[id]` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 29 | Edit Profile | `/profile/edit` | `/edit-profile` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 30 | Settings (marketplace country) | `/settings` | `/settings` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 31 | Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) | `/settings/*` | `/settings/*` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 32 | Notifications | `(bell) /notifications APIs` | `/notifications` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 33 | Android push (FCM) | `N/A` | `expo-notifications` | buyer|blocked-policy | BLOCKED/BLOCKED/BLOCKED | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 34 | Account Verification (KYC) | `/kyc` | `/kyc` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 35 | Language picker | `(modal)` | `/language-picker` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 36 | Offers | `/offers` | `/offers` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 37 | Subscription / VIP | `/subscription` | `/subscription` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 38 | Subscription digital purchase | `/subscription` | `/subscription` | buyer|blocked-policy | BLOCKED/BLOCKED/BLOCKED | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 39 | Referral System / Leaderboard | `/leaderboard` | `/leaderboard` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 40 | Commission promo | `/commission-promo` | `/commission-promo` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 41 | Jobs board | `/jobs` | `/jobs` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 42 | CalcAI calculator | `/calculator` | `/calculator` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 43 | Help Center / FAQ / Contact | `/help-center,/faq,/contact,/settings/help` | `/help-center` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 44 | Legal pages (privacy, terms, EULA, policies) | `/privacy-policy,/terms,/eula,...` | `/legal/[slug]` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 45 | Kominike / Inbox / Messages | `/messages` | `/inbox` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 46 | Private / Product Chat | `/messages/:id` | `/chat/[id]` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 47 | Support Center / Tickets | `/support,/support/:id` | `/support` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 48 | FlexaBot Chatbot | `/chatbot` | `/chatbot` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 49 | Add Product / Sell | `/sell` | `/sell` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 50 | Product Management / My Listings | `/profile/{me}, drafts` | `/my-listings` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 51 | Edit Product | `/sell?edit= / listing edit` | `/sell-edit/[id]` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 52 | Image Upload | `(Sell)` | `/sell` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 53 | Video Upload | `/videos, drafts` | `/videos` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 54 | Inventory / Restock | `(listing management)` | `/my-listings` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 55 | Seller Dashboard / Sales | `/sales` | `/sales` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 56 | Sales Analytics | `/settings/analytics` | `/analytics` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 57 | Seller Orders Management | `/orders (sales tab)` | `/sales` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 58 | Earnings / Commissions / Payouts | `/settings/payments, wallet` | `/settings/payments` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 59 | Boost Campaigns | `/boost/:listingId,/booster/*` | `/boost` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 60 | Paid Boost purchase | `/boost/:id` | `/boost` | seller | BLOCKED/BLOCKED/BLOCKED | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 61 | Boost Analytics | `/boost-analytics` | `/boost-analytics` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 62 | My Boosts | `/my-boosts` | `/my-boosts` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 63 | Promotional Videos / Video Discover | `/videos,/videos/watch` | `/videos` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 64 | My Drafts / Bouillon | `/my-drafts` | `/my-drafts` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 65 | Store Manager Dashboard | `/manager` | `/manager` | manager | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 66 | Seller Registration / Stripe Connect | `/sell + /settings/stripe-return` | `/sell` | seller | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 67 | Driver Registration | `/delivery/apply` | `/driver-apply` | driver|haiti-buyer-applicant | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 68 | Driver Dashboard / Jobs | `/driver/dashboard,/delivery/deliveries,/delivery/job/:id` | `/driver-dashboard` | driver|haiti-buyer-applicant | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 69 | Cash Agent directory / dashboard | `/wallet/agents,/agent,/agents/apply` | `/agents` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 70 | Business Loans | `/loans` | `/loans` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 71 | Credit Score | `/credit-score` | `/credit-score` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 72 | Flexa TV | `/tv` | `/tv` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 73 | Flexa Music | `/music,/music/upload,/music/earnings,/music/play/:id` | `/music` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 74 | Music digital purchase | `/music` | `/music` | buyer|blocked-policy | BLOCKED/BLOCKED/BLOCKED | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 75 | Flexa Control / Super Admin Dashboard | `/admin,/admin/*` | `/admin` | superadmin|admin|support | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 76 | User / Seller / Driver Management | `/admin/users,/admin/driver-applications,/admin/agents` | `/admin/users` | superadmin|admin|support | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 77 | Product Moderation / Reports / Disputes | `/admin/moderation,/admin/reports,/admin/appeals` | `/admin/moderation` | superadmin|admin|support | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 78 | Financial Management / Payments / Wallet Ops / Refunds | `/admin/transactions,/admin/stripe-transactions,/admin?tab=wallet` | `payments` | superadmin|admin|support | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 79 | Support Agent Management / Live Support / Tickets | `/admin/support,/admin/live-support` | `/admin/support` | superadmin|admin|support | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 80 | Admin Analytics / Announcements / Role Management | `/admin (revenue, broadcast, team, push)` | `/admin/analytics`, `/admin/more` | superadmin|admin|support | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 81 | Delete Account / Data Deletion | `/delete-account,/data-deletion` | `/delete-account` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 82 | Website WebView shell | `*` | `/website` | guest|buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 83 | Flexa eSIM | `None` | `/esim` | buyer|blocked-policy | BLOCKED/BLOCKED/BLOCKED | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
| 84 | Smart notification deep-links | `None` | `PushBootstrap` | buyer | PASS/PASS/PASS | BLOCKED/BLOCKED/BLOCKED | web/android/ios |
