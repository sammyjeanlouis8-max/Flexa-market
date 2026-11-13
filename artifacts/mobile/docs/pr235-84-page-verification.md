# Rapò verifikasyon PR #235 (84 paj Android)

## Koneksyon PR

| PR | Branch baz | Branch tèt |
|---:|---|---|
| **#233** | `cursor/native-parity-84-pages-09ff` | `cursor/android-package-flexamarket-app-09ff` |
| **#234** | `cursor/android-package-flexamarket-app-09ff` | `cursor/native-header-compact-09ff` |
| **#235** | `cursor/native-header-compact-09ff` | `cursor/native-listing-detail-glister-09ff` |

**#235 gen tout koreksyon Home/PDP + package `com.flexamarket.app` (via zansèt #233/#234).**

**Commit tès (tout koreksyon yo):** `d9daf51f`  
**Rapò ID update:** `b13f5604` tip + dokiman sa a (pa chanje package/Bundle ID)

## Build anba tès

| | |
|---|---|
| Platform | **Android** (iOS bloke — gade anba) |
| Package | `com.flexamarket.app` (**kenbe** — pa chanje) |
| versionName | `1.0.1` |
| versionCode | **55** |
| Commit SHA | `d9daf51f` (APK) / tip branch pou rapò |
| Aparèy | emulator `sdk_gphone64_x86_64` · Android 14 · 720×1280 @ dens 420 |
| OTA | **Disabled** pou sideload (`expo.modules.updates.ENABLED=false`) → bundle **embedded** nan APK |
| Backend | `https://flexamarket.com/api` (DigitalOcean, header `x-do-app-origin`) |

## Verifikasyon ID (san modifye konfig)

### Android package — verifye dirèkteman sou emilatè

| Tchek | Rezilta |
|---|---|
| `adb shell pm path com.flexamarket.app` | `package:/data/app/.../com.flexamarket.app-.../base.apk` |
| `adb shell pm path com.flexa.market` | **vid** (ansyen WebView package pa enstale) |
| `dumpsys package` | `Package [com.flexamarket.app]` · versionName `1.0.1` · versionCode **55** |
| `aapt dump badging` (base.apk tire soti nan aparèy) | `package: name='com.flexamarket.app' versionCode='55' versionName='1.0.1'` · `launchable-activity: name='com.flexamarket.app.MainActivity'` |
| `app.json` / `release-preflight.mjs` | `android.package` **dwe** rete `com.flexamarket.app` |

Prèv tèks: `/opt/cursor/artifacts/pr235_android_package_id_verify.txt`

**Play Console / fich:** Pa gen aksè Play Console nan VM sa a. Repo a (PR #233 + `release-preflight.mjs`) vize **`com.flexamarket.app`**. Ansyen ID WebView **`com.flexa.market`** pa nan APK enstale a. **Pa gen chanjman ID Android** nan tès sa a — kenbe `com.flexamarket.app` jiskaske ou konfime fich Play ou vize a.

### iOS Bundle ID — konfig release sèlman (pa gen IPA)

| Tchek | Rezilta |
|---|---|
| `artifacts/mobile/app.json` → `ios.bundleIdentifier` | **`com.flexamarket.mobile`** |
| `scripts/release-preflight.mjs` | Assert: dwe rete `com.flexamarket.mobile` |
| `artifacts/ios-native/project.yml` `PRODUCT_BUNDLE_IDENTIFIER` | **`com.flexamarket.mobile`** |
| `artifacts/ios-native/fastlane/Appfile` | `app_identifier "com.flexamarket.mobile"` |
| Build IPA / Simulator | **BLOCKED** — Linux VM pa gen Xcode |

Prèv tèks: `/opt/cursor/artifacts/pr235_ios_bundle_id_verify.txt`

**iOS:** Bundle ID WebView ki deja nan App Store Connect (`com.flexamarket.mobile`) verifye nan konfig release. Pa gen binary iOS sou machin sa a pou dump IPA.

## Total: PASS 6 · FAIL 0 · BLOCKED 55 · NOT_TESTED 23 (sou 84)

Enventè: **84/84** paj nan `native-84-page-map.md` — pa gen mank ni anplis.

## Paj pa paj

| # | Paj | Wout | Aksyon | Estati | Prèv / rezon |
|---:|---|---|---|---|---|
| 1 | Login | `/auth/login` | Drawer→Login during earlier smoke; auth form visible | **PASS** | Drawer→Login during earlier smoke; auth form visible |
| 2 | Signup | `/auth/register` | Deep/signup during earlier smoke; Create Account UI | **PASS** | Deep/signup during earlier smoke; Create Account UI |
| 3 | Animated Auth Globe | `/auth/login` | AuthGlobe on login/register screens | **PASS** | AuthGlobe on login/register screens |
| 4 | Phone login | `/auth/login-phone` | Open /auth/login-phone as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 5 | Forgot password | `/auth/forgot-password` | Open /auth/forgot-password as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 6 | Home | `/` | Launch Home; 2×2 products; prices readable; tab labels full | **PASS** | Launch Home; 2×2 products; prices readable; tab labels full |
| 7 | Search | `/search` | Open /search as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 8 | Categories | `/search` | Open /search as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 9 | Product details | `/listing/32` | Open listing/32; gallery 1/4→3/4; Add to Cart→In cart; Buy Now→Cart | **PASS** | Open listing/32; gallery 1/4→3/4; Add to Cart→In cart; Buy Now→Cart |
| 10 | Shopping Cart | `/cart` | Buy Now landed on Cart with item + Sign in to checkout | **PASS** | Buy Now landed on Cart with item + Sign in to checkout |
| 11 | Checkout | `/checkout` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 12 | Order confirmation | `/checkout-success` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 13 | Stripe single-item checkout | `/stripe-checkout` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 14 | Favorites / Saved | `/favorites` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 15 | Orders | `/orders` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 16 | Order Details | `/orders/1` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 17 | Delivery Tracking | `/delivery-tracking` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 18 | Public tracking | `/track/TEST` | Open /track/TEST as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 19 | Delivery Confirmation | `/orders/1` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 20 | Addresses | `/addresses` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 21 | Wallet | `/wallet` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 22 | Wallet top-up | `/wallet` | policy check | **BLOCKED** | Play Billing / policy-blocked wallet top-up |
| 23 | Wallet P2P transfer | `/wallet-transfer` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 24 | Transaction History | `/wallet-history` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 25 | Flex Card repay | `/flex-card-repay` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 26 | BNPL | `/bnpl` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 27 | Account / Profile hub | `/profile` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 28 | Public seller shop | `/shop/1` | Open /shop/1 as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 29 | Edit Profile | `/edit-profile` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 30 | Settings | `/settings` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 31 | Settings subpages | `/settings/security` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 32 | Notifications | `/notifications` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 33 | Android push (FCM) | `expo-notifications` | device FCM | **BLOCKED** | Requires physical Android device for FCM proof |
| 34 | KYC | `/kyc` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 35 | Language picker | `/language-picker` | Open /language-picker as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 36 | Offers | `/offers` | Open /offers as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 37 | Subscription / VIP | `/subscription` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 38 | Subscription digital purchase | `/subscription` | policy check | **BLOCKED** | Play Billing subscription purchase unavailable in sideload |
| 39 | Referral / Leaderboard | `/leaderboard` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 40 | Commission promo | `/commission-promo` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 41 | Jobs board | `/jobs` | Open /jobs as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 42 | CalcAI calculator | `/calculator` | Open /calculator as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 43 | Help Center | `/help-center` | Open /help-center as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 44 | Legal pages | `/legal/privacy` | Open /legal/privacy as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 45 | Inbox / Messages | `/inbox` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 46 | Chat thread | `/chat/1` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 47 | Support tickets | `/support` | Open /support as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 48 | FlexaBot Chatbot | `/chatbot` | Open /chatbot as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 49 | Add Product / Sell | `/sell` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 50 | My Listings | `/my-listings` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 51 | Edit Product | `/sell-edit/32` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 52 | Image Upload | `/sell` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 53 | Video Upload | `/videos` | Open /videos as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 54 | Inventory / Restock | `/my-listings` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 55 | Seller Dashboard / Sales | `/sales` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 56 | Sales Analytics | `/analytics` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 57 | Seller Orders | `/sales` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 58 | Earnings / Payouts | `/settings/payments` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 59 | Boost Campaigns | `/boost` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 60 | Paid Boost purchase | `/boost` | policy check | **BLOCKED** | Play Billing paid boost unavailable in sideload |
| 61 | Boost Analytics | `/boost-analytics` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 62 | My Boosts | `/my-boosts` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 63 | Promotional Videos | `/videos` | Open /videos as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 64 | My Drafts | `/my-drafts` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 65 | Store Manager | `/manager` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 66 | Seller Registration | `/sell` | seller API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_SELLER_EMAIL / FLEXA_TEST_SELLER_PASSWORD |
| 67 | Driver Registration | `/driver-apply` | Open /driver-apply as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 68 | Driver Dashboard | `/driver-dashboard` | driver API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_DRIVER_EMAIL / FLEXA_TEST_DRIVER_PASSWORD |
| 69 | Cash Agent | `/agents` | Open /agents as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 70 | Business Loans | `/loans` | Open /loans as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 71 | Credit Score | `/credit-score` | Open /credit-score as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 72 | Flexa TV | `/tv` | Open /tv as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 73 | Flexa Music | `/music` | Open /music as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 74 | Music digital purchase | `/music` | policy check | **BLOCKED** | Play Billing music digital goods unavailable in sideload |
| 75 | Admin Panel | `/admin` | admin API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 76 | Admin Users | `/admin` | admin API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 77 | Admin Moderation | `/admin` | admin API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 78 | Admin Finance | `/admin` | admin API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 79 | Admin Support | `/admin` | admin API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 80 | Admin Analytics | `/admin` | admin API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_ADMIN_EMAIL / FLEXA_TEST_ADMIN_PASSWORD |
| 81 | Delete Account | `/delete-account` | buyer API flows | **BLOCKED** | Missing secrets: FLEXA_TEST_BUYER_EMAIL / FLEXA_TEST_BUYER_PASSWORD |
| 82 | Website WebView shell | `/website` | Open /website as guest | **NOT_TESTED** | Emulator ANR/instability blocked remaining guest automation after Home/PDP verify; page present in 84-map as FULLY_NATIVE |
| 83 | Flexa eSIM | `/esim` | policy check | **BLOCKED** | eSIM provider integration not shipped |
| 84 | Smart notification deep-links | `PushBootstrap` | device FCM | **BLOCKED** | Requires physical Android device for FCM proof |

## Remak

- Chif 68/68 ansyen PR pa konte. Rapò sa a se sou build **vc55 / d9daf51f**.
- **Android package kenbe `com.flexamarket.app`.** **iOS Bundle ID kenbe `com.flexamarket.mobile`.** Pa gen modifye konfig ID nan tès sa a.
- Re-smoke apre verifikasyon ID (2026-11-13 ~17:43 America/New_York): Home chaje + PDP `Add to Cart` / `Buy Now` / `Sold by` **PASS** sou emilatè.
- Pa gen merge epi pa gen AAB — tann konfimasyon ou.
- Pou kontinye PASS sou paj buyer/seller/driver/admin, bezwen secrets tès Flexa (yo pa disponib nan anviwònman an).
