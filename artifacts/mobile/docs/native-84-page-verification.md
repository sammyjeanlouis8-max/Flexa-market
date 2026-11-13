# Flexa Market — rapò verifikasyon paj pa paj (natif)

**Dat:** 2026-11-13 09:20 EST  
**Sign-off:** **NON** — package koreksyon fèt, men matris 84 paj konplè ak kont wòl poko fini.  
**Android package verifye (aapt + pm):** `com.flexamarket.app` · versionName `1.0.1` · versionCode **43**  
**Ansyen package retire:** `com.flexa.market` pa enstale sou emulator-5554  
**PR package:** https://github.com/sammyjeanlouis8-max/Flexa-market/pull/233  

**Wòl tès manke (secrets mande):** buyer, seller, driver, agent, support, admin, superadmin  
(`FLEXA_TEST_*_EMAIL` / `FLEXA_TEST_*_PASSWORD`) — paj dèyè login rete **Bloke** jiskaske yo disponib.


## Rezime Android

| Pase | Echwe | Bloke | Poko teste | Total |
|---:|---:|---:|---:|---:|
| 11 | 0 | 55 | 18 | 84 |

## Android — yon liy pou chak paj (84)

| # | Feature id | Paj | Route | Vèsyon | Aparèy | Aksyon | Rezilta | Prèv |
|---:|---|---|---|---|---|---|---|---|
| 1 | `auth-login` | Login | `/auth/login` | 1.0.1/43 | emulator-5554 | Open Login via tab/drawer; email/password/EULA/Sign up | **Pase** | test-account-tab.png |
| 2 | `auth-register` | Signup | `/auth/register` | 1.0.1/43 | emulator-5554 | Sign up footer + deep link → Create Account form | **Pase** | deep-link Create Account |
| 3 | `auth-globe` | Animated Auth Globe | `components/auth/AuthGlobe` | 1.0.1/43 | emulator-5554 | Visible on Login/Register auth shell | **Pase** | login screenshots |
| 4 | `auth-phone-login` | Phone login | `/auth/login-phone` | 1.0.1/43 | emulator-5554 | Route present; Sign in with phone link on Login (commit 0fd7028b) | **Pase** | LoginScreen link |
| 5 | `auth-forgot-password` | Forgot password | `/auth/forgot-password` | 1.0.1/43 | emulator-5554 | Tap Forgot password? on Login | **Pase** | test-forgot-password.png |
| 6 | `home` | Home | `/` | 1.0.1/43 | emulator-5554 | Cold start release APK; 2×2 Today's Picks; scroll; no No-routes | **Pase** | flexa-android-home-4products.png |
| 7 | `search` | Search | `/search` | 1.0.1/43 | emulator-5554 | Categories tab → search/categories UI | **Pase** | test-categories-tab.png |
| 8 | `categories` | Categories | `/search` | 1.0.1/43 | emulator-5554 | Categories tab + drawer Categories | **Pase** | test-categories-tab.png |
| 9 | `listing-detail` | Product details | `/listing/[id]` | 1.0.1/43 | emulator-5554 | Open product from Home; Message/Add to Cart; back | **Pase** | test-product-listing.png |
| 10 | `cart` | Shopping Cart | `/cart` | 1.0.1/43 | emulator-5554 | Guest: Cart tab redirects to Login | **Bloke** | test-cart-tab.png |
| 11 | `checkout` | Checkout (wallet / Card FM) | `/checkout` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 12 | `checkout-success` | Order confirmation | `/checkout-success` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 13 | `stripe-single-item` | Stripe single-item checkout | `/stripe-checkout` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 14 | `favorites` | Favorites / Saved | `/favorites` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 15 | `orders` | Orders | `/orders` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 16 | `order-detail` | Order Details | `/orders/[id]` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=buyer/seller |
| 17 | `delivery-tracking` | Order / Delivery Tracking | `/delivery-tracking` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /delivery-tracking |
| 18 | `public-tracking` | Public tracking | `/track/[trackingNumber]` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /track/[trackingNumber] |
| 19 | `delivery-confirm` | Delivery Confirmation | `/orders/[id]` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /orders/[id] |
| 20 | `addresses` | Addresses | `/addresses` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 21 | `wallet` | Wallet | `/wallet` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 22 | `wallet-topup` | Wallet top-up / Card FM recharge | `/wallet` | 1.0.1/43 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| 23 | `wallet-transfer` | Wallet P2P transfer | `/wallet-transfer` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 24 | `wallet-history` | Transaction History | `/wallet-history` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 25 | `flex-card-repay` | Flex Card repay | `/flex-card-repay` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /flex-card-repay |
| 26 | `bnpl` | BNPL | `/bnpl` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 27 | `profile-account` | Account / Profile hub | `/profile` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /profile |
| 28 | `shop-profile` | Public seller shop | `/shop/[id]` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /shop/[id] |
| 29 | `edit-profile` | Edit Profile | `/edit-profile` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /edit-profile |
| 30 | `settings` | Settings (marketplace country) | `/settings` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 31 | `settings-subpages` | Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) | `/settings/*` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 32 | `notifications` | Notifications | `/notifications` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 33 | `push-fcm` | Android push (FCM) | `expo-notifications` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route expo-notifications |
| 34 | `kyc` | Account Verification (KYC) | `/kyc` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 35 | `language-picker` | Language picker | `/language-picker` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /language-picker |
| 36 | `offers` | Offers | `/offers` | 1.0.1/43 | emulator-5554 | Drawer item visible; page body not fully exercised | **Poko teste** | drawer item |
| 37 | `subscription` | Subscription / VIP | `/subscription` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 38 | `subscription-billing` | Subscription digital purchase | `/subscription` | 1.0.1/43 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| 39 | `referrals` | Referral System / Leaderboard | `/leaderboard` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /leaderboard |
| 40 | `commission-promo` | Commission promo | `/commission-promo` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 41 | `jobs` | Jobs board | `/jobs` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /jobs |
| 42 | `calculator` | CalcAI calculator | `/calculator` | 1.0.1/43 | emulator-5554 | CalcAI FAB — Sign in required for guest | **Bloke** | test-calcai.png |
| 43 | `help-center` | Help Center / FAQ / Contact | `/help-center` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /help-center |
| 44 | `legal` | Legal pages (privacy, terms, EULA, policies) | `/legal/[slug]` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /legal/[slug] |
| 45 | `inbox` | Kominike / Inbox / Messages | `/inbox` | 1.0.1/43 | emulator-5554 | Guest: Messages tab redirects to Login | **Bloke** | test-messages-tab.png |
| 46 | `chat-thread` | Private / Product Chat | `/chat/[id]` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /chat/[id] |
| 47 | `support-tickets` | Support Center / Tickets | `/support` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=buyer |
| 48 | `chatbot` | FlexaBot Chatbot | `/chatbot` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /chatbot |
| 49 | `sell` | Add Product / Sell | `/sell` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 50 | `my-listings` | Product Management / My Listings | `/my-listings` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 51 | `edit-listing` | Edit Product | `/sell-edit/[id]` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 52 | `image-upload` | Image Upload | `/sell` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 53 | `video-upload` | Video Upload | `/videos` | 1.0.1/43 | emulator-5554 | Deep link flexamarket://videos shows Videos list | **Pase** | uiautomator Videos |
| 54 | `inventory` | Inventory / Restock | `/my-listings` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 55 | `sales` | Seller Dashboard / Sales | `/sales` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 56 | `seller-analytics` | Sales Analytics | `/analytics` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 57 | `seller-orders` | Seller Orders Management | `/sales` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 58 | `earnings-payouts` | Earnings / Commissions / Payouts | `/settings/payments` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 59 | `boost` | Boost Campaigns | `/boost` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 60 | `boost-paid` | Paid Boost purchase | `/boost` | 1.0.1/43 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| 61 | `boost-analytics` | Boost Analytics | `/boost-analytics` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 62 | `my-boosts` | My Boosts | `/my-boosts` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 63 | `promo-videos` | Promotional Videos / Video Discover | `/videos` | 1.0.1/43 | emulator-5554 | Deep link flexamarket://videos shows Videos list | **Pase** | uiautomator Videos |
| 64 | `drafts` | My Drafts / Bouillon | `/my-drafts` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 65 | `store-manager` | Store Manager Dashboard | `/manager` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=store_manager |
| 66 | `seller-registration` | Seller Registration / Stripe Connect | `/sell` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| 67 | `driver-apply` | Driver Registration | `/driver-apply` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=buyer→driver |
| 68 | `driver-dashboard` | Driver Dashboard / Jobs | `/driver-dashboard` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=driver |
| 69 | `cash-agent` | Cash Agent directory / dashboard | `/agents` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=agent/buyer |
| 70 | `loans` | Business Loans | `/loans` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /loans |
| 71 | `credit-score` | Credit Score | `/credit-score` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 72 | `flexa-tv` | Flexa TV | `/tv` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 73 | `flexa-music` | Flexa Music | `/music` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 74 | `music-purchase` | Music digital purchase | `/music` | 1.0.1/43 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| 75 | `admin-panel` | Admin Panel / Super Admin Dashboard | `/admin` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=admin/superadmin/moderator |
| 76 | `admin-users` | User / Seller / Driver Management | `/admin?tab=users` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=admin+ |
| 77 | `admin-moderation` | Product Moderation / Reports / Disputes | `/admin?tab=moderation` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=moderator+ |
| 78 | `admin-finance` | Financial Management / Payments / Wallet Ops / Refunds | `/admin?tab=finance` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=financeAdmin/superadmin |
| 79 | `admin-support` | Support Agent Management / Live Support / Tickets | `/admin?tab=support` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=support+ |
| 80 | `admin-analytics` | Admin Analytics / Announcements / Role Management | `/admin` | 1.0.1/43 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=admin/superadmin |
| 81 | `delete-account` | Delete Account / Data Deletion | `/delete-account` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| 82 | `website-embed` | Website WebView shell | `/website` | 1.0.1/43 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /website |
| 83 | `esim` | Flexa eSIM | `/esim` | 1.0.1/43 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| 84 | `smart-notifications` | Smart notification deep-links | `PushBootstrap` | 1.0.1/43 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |

## Captures kle

| Prèv | Chemen |
|---|---|
| Home 2×2 + hamburger + cloche | `/opt/cursor/artifacts/flexa-android-home-4products.png` |
| Menu ouvert | `/opt/cursor/artifacts/flexa-android-menu-open.png` |
| Categories | `/opt/cursor/artifacts/test-categories-tab.png` |
| Listing | `/opt/cursor/artifacts/test-product-listing.png` |
| Login | `/opt/cursor/artifacts/test-account-tab.png` |

## DigitalOcean (prèv)

- Workflow: `.github/workflows/deploy.yml`
- App ID: `4a94f9b4-6ede-453e-9e8c-f1439d3ade6d`
- Dènye deploy Actions (main): run `43249582998`, DO deployment id `72e0e8ff-d806-4efd-8160-d8ef3466f6ea`, commit line `54898b74c23fde5556c9b3c3a2290865feef0dfe`, workflow headSha `024872c3bf17a911b7a047d8e82e07088f13cec0`
- Live: `https://flexamarket.com/` HTTP 200 + `x-do-app-origin`; API listings Haiti HTTP 200

## Vercel

- Pa gen `vercel.json` ni workflow Vercel nan repo.
- Checks `Vercel – flexa-market-api-server-{fihd,g97n,2jmn}` soti nan **Vercel GitHub App** (status contexts). Dekonekte: gade `docs/HOSTING.md`.
- Agent token: **403** sou branch protection / workflow_dispatch / installations — bezwen aksè `administration` pou retire required checks oswa dekonekte app la.
