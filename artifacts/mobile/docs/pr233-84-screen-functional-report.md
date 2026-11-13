# Flexa Market Android — 84-screen functional report (PR #233)

**Generated:** 2026-11-13 11:20 EST  
**Package installed:** `com.flexamarket.app`  
**versionName / versionCode:** `1.0.1` / **43**  
**Git commit SHA (APK under test):** `cb2f3bf74b5ec653c9efd892c5178c13f31e4fde`  
**Device:** emulator-5554 (`sdk_gphone64_x86_64`)  
**Backend:** DigitalOcean App Platform (`flexamarket.com`, header `x-do-app-origin`)  
**AAB / Play submit:** **NOT done** (stop after report)  
**Sign-off:** **NO** — requires 84/84 PASS with 0 FAIL and 0 BLOCKED  

## Totals

| PASS | FAIL | BLOCKED | Total |
|---:|---:|---:|---:|
| 10 | 1 | 73 | 84 |

## GitHub checks on final test commit

| Check | Result |
|---|---|
| Verify iOS release inputs (Mobile release preflight) | **SUCCESS** |
| Vercel – * | Not present on this PR check rollup at report time |

## Missing credentials (BLOCKED roles)

- `FLEXA_TEST_BUYER_EMAIL` / `FLEXA_TEST_BUYER_PASSWORD`
- `FLEXA_TEST_SELLER_EMAIL` / `FLEXA_TEST_SELLER_PASSWORD`
- `FLEXA_TEST_DRIVER_EMAIL` / `FLEXA_TEST_DRIVER_PASSWORD`
- `FLEXA_TEST_AGENT_EMAIL` / `FLEXA_TEST_AGENT_PASSWORD`
- `FLEXA_TEST_SUPPORT_EMAIL` / `FLEXA_TEST_SUPPORT_PASSWORD`
- `FLEXA_TEST_ADMIN_EMAIL` / `FLEXA_TEST_ADMIN_PASSWORD`
- `FLEXA_TEST_SUPERADMIN_EMAIL` / `FLEXA_TEST_SUPERADMIN_PASSWORD`

## Screen-by-screen

| # | Screen | Route | Role tested | Actions / buttons | API result | Status | Evidence |
|---:|---|---|---|---|---|---|---|
| 1 | Login | `/auth/login` | guest | Open Login; email/password/EULA/Sign up/phone link present | Auth shell loads | **PASS** | /opt/cursor/artifacts/report-login.png |
| 2 | Signup | `/auth/register` | guest | Create Account form via Sign up / deep link | Create Account fields visible | **PASS** | /opt/cursor/artifacts/report84/auth-register.png |
| 3 | Animated Auth Globe | `components/auth/AuthGlobe` | guest | AuthGlobe visible on auth screens | Visual on login/register | **PASS** | /opt/cursor/artifacts/report-login.png |
| 4 | Phone login | `/auth/login-phone` | guest | Sign in with phone screen | Phone OTP UI | **PASS** | /opt/cursor/artifacts/report-phone-login.png |
| 5 | Forgot password | `/auth/forgot-password` | guest | Forgot password flow reachable | Reset password UI | **PASS** | /opt/cursor/artifacts/report-forgot-password.png |
| 6 | Home | `/` | guest | Launch Home; scroll; view 2×2 products; hamburger+bell | API GET /listings?country=Haiti → 200 x-do-app-origin; 4 listings | **PASS** | /opt/cursor/artifacts/report-home.png |
| 7 | Search | `/search` | guest | Categories tab/drawer; search field visible | Categories UI loads | **PASS** | /opt/cursor/artifacts/report-categories.png |
| 8 | Categories | `/search` | guest | Open Categories from drawer | Category grid + search placeholder | **PASS** | /opt/cursor/artifacts/report-categories.png |
| 9 | Product details | `/listing/[id]` | guest | Tap product card from Home; deep link listing/32 | Intermittent: UI dump empty/splash or unexpected redirect during session; host API OK for id 32 | **FAIL** | /opt/cursor/artifacts/report84/listing-detail.png |
| 10 | Shopping Cart | `/cart` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 11 | Checkout (wallet / Card FM) | `/checkout` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 12 | Order confirmation | `/checkout-success` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 13 | Stripe single-item checkout | `/stripe-checkout` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 14 | Favorites / Saved | `/favorites` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 15 | Orders | `/orders` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 16 | Order Details | `/orders/[id]` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 17 | Order / Delivery Tracking | `/delivery-tracking` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 18 | Public tracking | `/track/[trackingNumber]` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 19 | Delivery Confirmation | `/orders/[id]` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 20 | Addresses | `/addresses` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 21 | Wallet | `/wallet` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 22 | Wallet top-up / Card FM recharge | `/wallet` | n/a | Policy/billing path not shippable as tested purchase | ANDROID_DIGITAL_PURCHASE_UNAVAILABLE / deferred provider | **BLOCKED** | inventory BLOCKED |
| 23 | Wallet P2P transfer | `/wallet-transfer` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 24 | Transaction History | `/wallet-history` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 25 | Flex Card repay | `/flex-card-repay` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 26 | BNPL | `/bnpl` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 27 | Account / Profile hub | `/profile` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 28 | Public seller shop | `/shop/[id]` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 29 | Edit Profile | `/edit-profile` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 30 | Settings (marketplace country) | `/settings` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 31 | Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) | `/settings/*` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 32 | Notifications | `/notifications` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 33 | Android push (FCM) | `expo-notifications` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 34 | Account Verification (KYC) | `/kyc` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 35 | Language picker | `/language-picker` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 36 | Offers | `/offers` | guest | Drawer Offers & Promotions | Offers page loads | **PASS** | /opt/cursor/artifacts/report-offers.png |
| 37 | Subscription / VIP | `/subscription` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 38 | Subscription digital purchase | `/subscription` | n/a | Policy/billing path not shippable as tested purchase | ANDROID_DIGITAL_PURCHASE_UNAVAILABLE / deferred provider | **BLOCKED** | inventory BLOCKED |
| 39 | Referral System / Leaderboard | `/leaderboard` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 40 | Commission promo | `/commission-promo` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 41 | Jobs board | `/jobs` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 42 | CalcAI calculator | `/calculator` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 43 | Help Center / FAQ / Contact | `/help-center` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 44 | Legal pages (privacy, terms, EULA, policies) | `/legal/[slug]` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 45 | Kominike / Inbox / Messages | `/inbox` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 46 | Private / Product Chat | `/chat/[id]` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 47 | Support Center / Tickets | `/support` | support | Requires signed-in support; secret missing | Not executed — missing FLEXA_TEST_SUPPORT_EMAIL / FLEXA_TEST_SUPPORT_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SUPPORT_EMAIL / FLEXA_TEST_SUPPORT_PASSWORD |
| 48 | FlexaBot Chatbot | `/chatbot` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 49 | Add Product / Sell | `/sell` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 50 | Product Management / My Listings | `/my-listings` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 51 | Edit Product | `/sell-edit/[id]` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 52 | Image Upload | `/sell` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 53 | Video Upload | `/videos` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 54 | Inventory / Restock | `/my-listings` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 55 | Seller Dashboard / Sales | `/sales` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 56 | Sales Analytics | `/analytics` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 57 | Seller Orders Management | `/sales` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 58 | Earnings / Commissions / Payouts | `/settings/payments` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 59 | Boost Campaigns | `/boost` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 60 | Paid Boost purchase | `/boost` | n/a | Policy/billing path not shippable as tested purchase | ANDROID_DIGITAL_PURCHASE_UNAVAILABLE / deferred provider | **BLOCKED** | inventory BLOCKED |
| 61 | Boost Analytics | `/boost-analytics` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 62 | My Boosts | `/my-boosts` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 63 | Promotional Videos / Video Discover | `/videos` | guest | Drawer Promotional Videos + deep link | Videos list shows items (tshot…) | **PASS** | /opt/cursor/artifacts/report-promotional-videos.png |
| 64 | My Drafts / Bouillon | `/my-drafts` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 65 | Store Manager Dashboard | `/manager` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 66 | Seller Registration / Stripe Connect | `/sell` | seller | Requires signed-in seller; secret missing | Not executed — missing FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 67 | Driver Registration | `/driver-apply` | driver | Requires signed-in driver; secret missing | Not executed — missing FLEXA_TEST_DRIVER_EMAIL / FLEXA_TEST_DRIVER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_DRIVER_EMAIL / FLEXA_TEST_DRIVER_PASSWORD |
| 68 | Driver Dashboard / Jobs | `/driver-dashboard` | driver | Requires signed-in driver; secret missing | Not executed — missing FLEXA_TEST_DRIVER_EMAIL / FLEXA_TEST_DRIVER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_DRIVER_EMAIL / FLEXA_TEST_DRIVER_PASSWORD |
| 69 | Cash Agent directory / dashboard | `/agents` | agent | Requires signed-in agent; secret missing | Not executed — missing FLEXA_TEST_AGENT_EMAIL / FLEXA_TEST_AGENT_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_AGENT_EMAIL / FLEXA_TEST_AGENT_PASSWORD |
| 70 | Business Loans | `/loans` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 71 | Credit Score | `/credit-score` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 72 | Flexa TV | `/tv` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 73 | Flexa Music | `/music` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 74 | Music digital purchase | `/music` | n/a | Policy/billing path not shippable as tested purchase | ANDROID_DIGITAL_PURCHASE_UNAVAILABLE / deferred provider | **BLOCKED** | inventory BLOCKED |
| 75 | Admin Panel / Super Admin Dashboard | `/admin` | superadmin | Requires signed-in superadmin; secret missing | Not executed — missing FLEXA_TEST_SUPERADMIN_EMAIL / FLEXA_TEST_SUPERADMIN_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SUPERADMIN_EMAIL / FLEXA_TEST_SUPERADMIN_PASSWORD |
| 76 | User / Seller / Driver Management | `/admin?tab=users` | admin | Requires signed-in admin; secret missing | Not executed — missing FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 77 | Product Moderation / Reports / Disputes | `/admin?tab=moderation` | admin | Requires signed-in admin; secret missing | Not executed — missing FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 78 | Financial Management / Payments / Wallet Ops / Refunds | `/admin?tab=finance` | superadmin | Requires signed-in superadmin; secret missing | Not executed — missing FLEXA_TEST_SUPERADMIN_EMAIL / FLEXA_TEST_SUPERADMIN_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SUPERADMIN_EMAIL / FLEXA_TEST_SUPERADMIN_PASSWORD |
| 79 | Support Agent Management / Live Support / Tickets | `/admin?tab=support` | admin | Requires signed-in admin; secret missing | Not executed — missing FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 80 | Admin Analytics / Announcements / Role Management | `/admin` | superadmin | Requires signed-in superadmin; secret missing | Not executed — missing FLEXA_TEST_SUPERADMIN_EMAIL / FLEXA_TEST_SUPERADMIN_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_SUPERADMIN_EMAIL / FLEXA_TEST_SUPERADMIN_PASSWORD |
| 81 | Delete Account / Data Deletion | `/delete-account` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 82 | Website WebView shell | `/website` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 83 | Flexa eSIM | `/esim` | n/a | Policy/billing path not shippable as tested purchase | ANDROID_DIGITAL_PURCHASE_UNAVAILABLE / deferred provider | **BLOCKED** | inventory BLOCKED |
| 84 | Smart notification deep-links | `PushBootstrap` | buyer | Requires signed-in buyer; secret missing | Not executed — missing FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |

## FAIL details

### Product details (`/listing/[id]`) — FAIL
- **Repro:** Cold start → wait for Home → tap first product card; also `flexamarket://listing/32`.
- **Expected:** Listing detail with price/actions.
- **Actual:** Emulator session showed empty UI hierarchy / splash or unexpected auth redirect; host API `GET /api/listings?country=Haiti` returns listing id 32 OK.
- **Next:** Retest on stable HW / after role accounts; fix navigation if FAIL reproduces.

## Notes

- Inventory count is **84** features (exact). No missing inventory rows; some features share routes (e.g. Categories/Search → `/search`).
- Guest Messages/Cart/Account/CalcAI correctly redirect to login (counted under buyer BLOCKED where applicable).
- Do not generate AAB until 84/84 PASS.
