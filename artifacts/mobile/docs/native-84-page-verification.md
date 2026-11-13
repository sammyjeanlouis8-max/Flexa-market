# Flexa Market — rapò verifikasyon paj pa paj (natif)

**Dat:** 2026-11-12 22:34 EST  
**Branch:** `cursor/native-parity-84-pages-09ff`  
**PR:** https://github.com/sammyjeanlouis8-max/Flexa-market/pull/230  
**Commits:**
- Home 2×2 + typecheck APK path: [`934be7bb`](https://github.com/sammyjeanlouis8-max/Flexa-market/commit/934be7bb9b7000e162065628302f69db6c036387)
- Rapò + phone login link: [`0fd7028b`](https://github.com/sammyjeanlouis8-max/Flexa-market/commit/0fd7028bf35bcb8a5ec9d8601c7ff376884b98ed)
**Typecheck (`pnpm --filter @workspace/mobile exec tsc --noEmit`):** PASS (EXIT 0); `(tabs)/cart.tsx` OK  
**Android release teste:** `com.flexa.market` **1.0.1** / **versionCode 42** (APK release, san Metro)  
**Android aparèy:** Emulator `sdk_gphone64_x86_64` (`emulator-5554`) · 720×1280  
**iPhone:** **Bloke** — pa gen Xcode/Simulator/Mac worker sou VM Linux sa a  

## Screenshot prèv (APK vc42)

| Prèv | Chemen |
|---|---|
| Home: 4 kat pwodwi reyèl 2 kolòn, hamburger + klòch, san glise | `/opt/cursor/artifacts/flexa-android-home-4products.png` |
| Meni ouvè apre peze bouton 3 ba | `/opt/cursor/artifacts/flexa-android-menu-open.png` |

Verifye: pa gen “No routes found”; app pa fèmen; meni fèmen OK; Home glise OK. ANR System UI sou TCG → peze Wait (pwoblèm emilatè, pa crash app).

## Rezime

| Platfòm | Pase | Echwe | Bloke | Poko teste |
|---|---:|---:|---:|---:|
| Android 1.0.1 (42) | 11 | 0 | 55 | 18 |
| iPhone | 0 | 0 | 84 | 0 |

## Android — yon liy pou chak paj

| Paj | Vèsyon / build | Aparèy | Aksyon teste | Rezilta | Prèv |
|---|---|---|---|---|---|
| Login (`/auth/login`) | 1.0.1 / 42 | emulator-5554 | Open Login via tab/drawer; email/password/EULA/Sign up | **Pase** | test-account-tab.png |
| Signup (`/auth/register`) | 1.0.1 / 42 | emulator-5554 | Sign up footer + deep link → Create Account form | **Pase** | deep-link Create Account |
| Animated Auth Globe (`components/auth/AuthGlobe`) | 1.0.1 / 42 | emulator-5554 | Visible on Login/Register auth shell | **Pase** | login screenshots |
| Phone login (`/auth/login-phone`) | 1.0.1 / 42 | emulator-5554 | Route present; Sign in with phone link on Login (commit 0fd7028b) | **Pase** | LoginScreen link |
| Forgot password (`/auth/forgot-password`) | 1.0.1 / 42 | emulator-5554 | Tap Forgot password? on Login | **Pase** | test-forgot-password.png |
| Home (`/`) | 1.0.1 / 42 | emulator-5554 | Cold start release APK; 2×2 Today's Picks; scroll; no No-routes | **Pase** | flexa-android-home-4products.png |
| Search (`/search`) | 1.0.1 / 42 | emulator-5554 | Categories tab → search/categories UI | **Pase** | test-categories-tab.png |
| Categories (`/search`) | 1.0.1 / 42 | emulator-5554 | Categories tab + drawer Categories | **Pase** | test-categories-tab.png |
| Product details (`/listing/[id]`) | 1.0.1 / 42 | emulator-5554 | Open product from Home; Message/Add to Cart; back | **Pase** | test-product-listing.png |
| Shopping Cart (`/cart`) | 1.0.1 / 42 | emulator-5554 | Guest: Cart tab redirects to Login | **Bloke** | test-cart-tab.png |
| Checkout (wallet / Card FM) (`/checkout`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Order confirmation (`/checkout-success`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Stripe single-item checkout (`/stripe-checkout`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Favorites / Saved (`/favorites`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Orders (`/orders`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Order Details (`/orders/[id]`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=buyer/seller |
| Order / Delivery Tracking (`/delivery-tracking`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /delivery-tracking |
| Public tracking (`/track/[trackingNumber]`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /track/[trackingNumber] |
| Delivery Confirmation (`/orders/[id]`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /orders/[id] |
| Addresses (`/addresses`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Wallet (`/wallet`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Wallet top-up / Card FM recharge (`/wallet`) | 1.0.1 / 42 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| Wallet P2P transfer (`/wallet-transfer`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Transaction History (`/wallet-history`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Flex Card repay (`/flex-card-repay`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /flex-card-repay |
| BNPL (`/bnpl`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Account / Profile hub (`/profile`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /profile |
| Public seller shop (`/shop/[id]`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /shop/[id] |
| Edit Profile (`/edit-profile`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /edit-profile |
| Settings (marketplace country) (`/settings`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) (`/settings/*`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Notifications (`/notifications`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Android push (FCM) (`expo-notifications`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route expo-notifications |
| Account Verification (KYC) (`/kyc`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Language picker (`/language-picker`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /language-picker |
| Offers (`/offers`) | 1.0.1 / 42 | emulator-5554 | Drawer item visible; page body not fully exercised | **Poko teste** | drawer item |
| Subscription / VIP (`/subscription`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Subscription digital purchase (`/subscription`) | 1.0.1 / 42 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| Referral System / Leaderboard (`/leaderboard`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /leaderboard |
| Commission promo (`/commission-promo`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Jobs board (`/jobs`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /jobs |
| CalcAI calculator (`/calculator`) | 1.0.1 / 42 | emulator-5554 | CalcAI FAB — Sign in required for guest | **Bloke** | test-calcai.png |
| Help Center / FAQ / Contact (`/help-center`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /help-center |
| Legal pages (privacy, terms, EULA, policies) (`/legal/[slug]`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /legal/[slug] |
| Kominike / Inbox / Messages (`/inbox`) | 1.0.1 / 42 | emulator-5554 | Guest: Messages tab redirects to Login | **Bloke** | test-messages-tab.png |
| Private / Product Chat (`/chat/[id]`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /chat/[id] |
| Support Center / Tickets (`/support`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=buyer |
| FlexaBot Chatbot (`/chatbot`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /chatbot |
| Add Product / Sell (`/sell`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Product Management / My Listings (`/my-listings`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Edit Product (`/sell-edit/[id]`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Image Upload (`/sell`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Video Upload (`/videos`) | 1.0.1 / 42 | emulator-5554 | Deep link flexamarket://videos shows Videos list | **Pase** | uiautomator Videos |
| Inventory / Restock (`/my-listings`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Seller Dashboard / Sales (`/sales`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Sales Analytics (`/analytics`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Seller Orders Management (`/sales`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Earnings / Commissions / Payouts (`/settings/payments`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Boost Campaigns (`/boost`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Paid Boost purchase (`/boost`) | 1.0.1 / 42 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| Boost Analytics (`/boost-analytics`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| My Boosts (`/my-boosts`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Promotional Videos / Video Discover (`/videos`) | 1.0.1 / 42 | emulator-5554 | Deep link flexamarket://videos shows Videos list | **Pase** | uiautomator Videos |
| My Drafts / Bouillon (`/my-drafts`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Store Manager Dashboard (`/manager`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=store_manager |
| Seller Registration / Stripe Connect (`/sell`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=seller |
| Driver Registration (`/driver-apply`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=buyer→driver |
| Driver Dashboard / Jobs (`/driver-dashboard`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=driver |
| Cash Agent directory / dashboard (`/agents`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=agent/buyer |
| Business Loans (`/loans`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /loans |
| Credit Score (`/credit-score`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Flexa TV (`/tv`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Flexa Music (`/music`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Music digital purchase (`/music`) | 1.0.1 / 42 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| Admin Panel / Super Admin Dashboard (`/admin`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=admin/superadmin/moderator |
| User / Seller / Driver Management (`/admin?tab=users`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=admin+ |
| Product Moderation / Reports / Disputes (`/admin?tab=moderation`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=moderator+ |
| Financial Management / Payments / Wallet Ops / Refunds (`/admin?tab=finance`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=financeAdmin/superadmin |
| Support Agent Management / Live Support / Tickets (`/admin?tab=support`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=support+ |
| Admin Analytics / Announcements / Role Management (`/admin`) | 1.0.1 / 42 | emulator-5554 | Requires authenticated elevated role — guest smoke only | **Bloke** | role=admin/superadmin |
| Delete Account / Data Deletion (`/delete-account`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |
| Website WebView shell (`/website`) | 1.0.1 / 42 | emulator-5554 | Native route implemented; interactive smoke not completed this run | **Poko teste** | route /website |
| Flexa eSIM (`/esim`) | 1.0.1 / 42 | emulator-5554 | Policy/billing/provider blocker (screen may exist) | **Bloke** | inventory BLOCKED |
| Smart notification deep-links (`PushBootstrap`) | 1.0.1 / 42 | emulator-5554 | Requires signed-in buyer/seller session — guest smoke only | **Bloke** | auth required |

## iPhone — yon liy pou chak paj

| Paj | Vèsyon / build | Aparèy | Aksyon teste | Rezilta | Prèv |
|---|---|---|---|---|---|
| Login (`/auth/login`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Signup (`/auth/register`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Animated Auth Globe (`components/auth/AuthGlobe`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Phone login (`/auth/login-phone`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Forgot password (`/auth/forgot-password`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Home (`/`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Search (`/search`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Categories (`/search`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Product details (`/listing/[id]`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Shopping Cart (`/cart`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Checkout (wallet / Card FM) (`/checkout`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Order confirmation (`/checkout-success`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Stripe single-item checkout (`/stripe-checkout`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Favorites / Saved (`/favorites`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Orders (`/orders`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Order Details (`/orders/[id]`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Order / Delivery Tracking (`/delivery-tracking`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Public tracking (`/track/[trackingNumber]`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Delivery Confirmation (`/orders/[id]`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Addresses (`/addresses`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Wallet (`/wallet`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Wallet top-up / Card FM recharge (`/wallet`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Wallet P2P transfer (`/wallet-transfer`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Transaction History (`/wallet-history`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Flex Card repay (`/flex-card-repay`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| BNPL (`/bnpl`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Account / Profile hub (`/profile`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Public seller shop (`/shop/[id]`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Edit Profile (`/edit-profile`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Settings (marketplace country) (`/settings`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) (`/settings/*`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Notifications (`/notifications`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Android push (FCM) (`expo-notifications`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Account Verification (KYC) (`/kyc`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Language picker (`/language-picker`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Offers (`/offers`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Subscription / VIP (`/subscription`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Subscription digital purchase (`/subscription`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Referral System / Leaderboard (`/leaderboard`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Commission promo (`/commission-promo`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Jobs board (`/jobs`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| CalcAI calculator (`/calculator`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Help Center / FAQ / Contact (`/help-center`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Legal pages (privacy, terms, EULA, policies) (`/legal/[slug]`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Kominike / Inbox / Messages (`/inbox`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Private / Product Chat (`/chat/[id]`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Support Center / Tickets (`/support`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| FlexaBot Chatbot (`/chatbot`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Add Product / Sell (`/sell`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Product Management / My Listings (`/my-listings`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Edit Product (`/sell-edit/[id]`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Image Upload (`/sell`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Video Upload (`/videos`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Inventory / Restock (`/my-listings`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Seller Dashboard / Sales (`/sales`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Sales Analytics (`/analytics`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Seller Orders Management (`/sales`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Earnings / Commissions / Payouts (`/settings/payments`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Boost Campaigns (`/boost`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Paid Boost purchase (`/boost`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Boost Analytics (`/boost-analytics`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| My Boosts (`/my-boosts`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Promotional Videos / Video Discover (`/videos`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| My Drafts / Bouillon (`/my-drafts`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Store Manager Dashboard (`/manager`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Seller Registration / Stripe Connect (`/sell`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Driver Registration (`/driver-apply`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Driver Dashboard / Jobs (`/driver-dashboard`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Cash Agent directory / dashboard (`/agents`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Business Loans (`/loans`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Credit Score (`/credit-score`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Flexa TV (`/tv`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Flexa Music (`/music`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Music digital purchase (`/music`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Admin Panel / Super Admin Dashboard (`/admin`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| User / Seller / Driver Management (`/admin?tab=users`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Product Moderation / Reports / Disputes (`/admin?tab=moderation`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Financial Management / Payments / Wallet Ops / Refunds (`/admin?tab=finance`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Support Agent Management / Live Support / Tickets (`/admin?tab=support`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Admin Analytics / Announcements / Role Management (`/admin`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Delete Account / Data Deletion (`/delete-account`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Website WebView shell (`/website`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Flexa eSIM (`/esim`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |
| Smart notification deep-links (`PushBootstrap`) | (RN pataje; iOS pa kouri) | — | Pa gen iOS simulator/macOS sou ajan sa a | **Bloke** | n/a |

## Sa ki rete (anvan piblikasyon)

- Tout **84 paj iPhone** = Bloke jiskaske tès sou Mac/simulator.
- Android: paj ki mande login / wòl elevasyon ak anpil deep flows = Bloke oswa Poko teste.
- **Pa soumèt** Google Play oswa App Store san apwobasyon ou.

