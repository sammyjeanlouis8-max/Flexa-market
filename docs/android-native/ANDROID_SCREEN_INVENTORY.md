# ANDROID_SCREEN_INVENTORY.md

**Status:** Phase 1 audit — **VERIFIED COMPLETE** (inventory)  
**Sources:** `artifacts/marketplace/src/App.tsx`, `artifacts/marketplace/src/pages/**`, `artifacts/mobile/app/**`

---

## 1. Executive summary

| Surface | Count (approx.) | Nature |
|---|---|---|
| Marketplace web routes/pages | 140+ page modules; 100+ routed paths | React SPA |
| Expo mobile routes | ~35 app routes | Almost all WebView wrappers |
| Genuine native mobile UI today | Delivery tracking (partial), layouts, loans redirect | Minimal |

**Reuse strategy:** Keep **API + business rules**. Rewrite **UI** in React Native. Do not import Vite/DOM components into RN.

---

## 2. Mobile app — current screen classification

### 2.1 WebView-primary (must rewrite for “genuine native”)

| Mobile route | Loads | Module |
|---|---|---|
| `(tabs)/index` | flexamarket.com / | Marketplace Home |
| `(tabs)/search` | /search | Search |
| `(tabs)/sell` | /sell | Seller create |
| `(tabs)/inbox` | /messages | Messaging |
| `(tabs)/profile` | /profile | Profile |
| `auth/login`, `auth/register` | /auth/* | Auth |
| `listing/[id]` | /listings/:id | Product detail |
| `cart` | /cart | Cart |
| `orders`, `orders/[id]` | /orders* | Orders |
| `favorites` | /saved | Favorites |
| `offers` | /offers | Offers |
| `notifications` | notifications URL | Notifications |
| `settings`, `edit-profile` | /settings*, /profile/edit | Settings |
| `wallet` | /wallet | Flexa Card / wallet |
| `subscription` | /subscription | Vendor plans |
| `videos` | /videos | Promotional Videos |
| `boost`, `my-boosts` | /boost*, /my-boosts | Boost campaigns |
| `my-listings` | listings management | Seller Center subset |
| `sales` | /sales | Sales |
| `kyc` | /kyc | Identity |
| `admin` | /admin | Admin |
| `chat/[id]` | messages | Chat thread |
| `driver-apply`, `driver-dashboard` | delivery apply/dashboard | Drivers |
| `language-picker` | language UI via web | i18n |
| `website` | marketing site | External-ish |
| `stripe-checkout` | Stripe hosted | Payments WebView |
| `App.tsx` root shell | full-site WebView | Primary shell |

### 2.2 Partial / non-WebView today

| Route | Notes | Migration action |
|---|---|---|
| `delivery-tracking.tsx` | Native polling UI comments say it replaces SafeWebView | Extend & harden; keep API |
| `_layout.tsx`, `(tabs)/_layout.tsx` | Shell only; tab bar hidden | Rebuild visible native tabs |
| `loans.tsx` | Redirects to `/` | Decide native loans vs web-only |
| `+not-found.tsx` | Fallback | Keep |

### 2.3 Native capabilities to **reuse** (not rewrite)

- `hooks/usePushNotifications.ts` + FCM wiring
- `modules/flexa-background-upload` (WorkManager)
- `security/webviewPolicy.ts` allowlists (repurpose for rare external browser)
- `context/AuthContext.tsx` pattern (upgrade storage to SecureStore)
- `plugins/withAndroidAdaptiveLayout.js`
- EAS `app.json` / `eas.json` package IDs, targetSdk 36, minSdk 24

---

## 3. Marketplace modules — full inventory

Status legend for **native migration readiness** (not current shipping state):

- **REUSE_API** — backend ready; needs RN UI  
- **REWRITE_UI** — browser/DOM specific  
- **POLICY_GATE** — Play Billing / permissions / UGC  
- **DEFER** — admin-heavy or web-only acceptable pending product call  

### 3.1 Marketplace commerce

| Module | Key routes / pages | Native plan | Notes |
|---|---|---|---|
| Home feed | `/`, `Home.tsx` | REWRITE_UI + REUSE_API | Listings infinite query |
| Search | `/search` | REWRITE_UI | Filters, country scope |
| Listing detail | `/listings/:id` | REWRITE_UI | Images, chat, buy |
| Create listing | `/sell`, `/listings/create` | REWRITE_UI + POLICY_GATE | Camera/mic/photo picker |
| Cart / checkout | `/cart`, checkout success | REWRITE_UI + POLICY_GATE | Physical goods OK; Stripe hosted may use Custom Tabs |
| Saved / favorites | `/saved` | REWRITE_UI | |
| Offers | `/offers` | REWRITE_UI | |
| Orders / sales | `/orders*`, `/sales` | REWRITE_UI | Labels, delivered flows |
| Country / language | shopping location + i18n | REWRITE_UI | Critical for Haiti / DR |

### 3.2 Promotional Videos & Boost

| Module | Routes | Native plan | Notes |
|---|---|---|---|
| Discover / TikTok feed | `/videos`, `/videos/watch` | REWRITE_UI | Native video component |
| Favorites | `/videos/favorites` | REWRITE_UI | |
| Booster create / analytics | `/booster*` | REWRITE_UI + POLICY_GATE | Digital boost = Play Billing or remain blocked |
| Boost analytics | `/boost-analytics*` | REWRITE_UI | |
| Super Admin country scope | admin country context | REWRITE_UI | Recently fixed on web (#170) |

### 3.3 Media entertainment

| Module | Routes | Native plan | Notes |
|---|---|---|---|
| Flexa TV | `/tv`, `FlexaTV.tsx` | REWRITE_UI | Video player |
| Flexa Music | `/music*` | REWRITE_UI + POLICY_GATE | See `docs/FLEXA_MUSIC_NATIVE_PLAN.md` — needs native background audio |
| Flexa Films / Games | related pages | DEFER / REWRITE_UI | Lower priority |
| Music public player | `/music/play/:id` | REWRITE_UI | Deep link |

### 3.4 Wallet / Flexa Card / subscriptions

| Module | Routes | Native plan | Notes |
|---|---|---|---|
| Wallet | `/wallet`, history, transfer | REWRITE_UI + POLICY_GATE | Top-up for digital spend blocked on Android today |
| Flex Card repay | `/flex-card/repay` | REWRITE_UI | |
| Vendor subscription | `/subscription` | POLICY_GATE | Requires Play Billing for new digital subs |
| BNPL / loans / credit | `/loans`, credit-score | DEFER | Mobile currently redirects |

### 3.5 Messaging & support

| Module | Routes | Native plan | Notes |
|---|---|---|---|
| Messages | `/messages`, `/messages/:id` | REWRITE_UI | Push deep links |
| Support / chatbot | `/support*`, `/chatbot` | REWRITE_UI | |
| Notifications center | settings/notifications | REWRITE_UI | Plus system tray via FCM |

### 3.6 Delivery / drivers

| Module | Routes | Native plan | Notes |
|---|---|---|---|
| Apply / dashboard / jobs | `/delivery/*`, `/driver/*` | REWRITE_UI | Location permissions |
| Tracking | `/delivery/tracking/:id`, public track | Partial native exists | Expand |
| Admin deliveries | `/admin/deliveries*` | DEFER | |

### 3.7 Identity, trust, legal

| Module | Routes | Native plan | Notes |
|---|---|---|---|
| Auth | `/auth/*` | REWRITE_UI | Secure storage |
| KYC | `/kyc` | REWRITE_UI + permissions | Camera |
| Delete account / data deletion | `/delete-account`, `/data-deletion` | REWRITE_UI | Play account-deletion requirement |
| Report abuse | `/report-abuse` | REWRITE_UI | UGC |
| Policies (privacy, terms, etc.) | many static pages | In-app WebBrowser **or** native ScrollView markdown | Prefer simple native/legal screens |
| Community guidelines / content policy | static | Same | |

### 3.8 Admin / Super Admin

| Module | Routes | Native plan | Notes |
|---|---|---|---|
| Admin hub | `/admin*` many panels | DEFER | Large surface; web may remain staff tool |
| Control Center | admin redesign pages | DEFER | Super Admin analytics |
| Live support / fraud / loans admin | admin panels | DEFER | |
| Flexa TV/Music admin | `AdminTV*`, `AdminMusic` | DEFER | |

**Recommendation:** Phase 2–3 ship **buyer + seller consumer app**. Staff admin stays on web unless Sammy requires mobile ops.

### 3.9 Agents / jobs / misc

| Module | Routes | Native plan |
|---|---|---|
| Agent dashboard / directory | `/agent*` | DEFER / REWRITE_UI |
| Jobs board | `/jobs` | REWRITE_UI |
| Calculator / commission promo | misc | DEFER |
| Dev previews | `/dev/*` | Never ship in production AAB |

---

## 4. Browser-specific dependencies (must not ship as-is in RN)

| Dependency pattern | Where | Native replacement |
|---|---|---|
| DOM `document` / CSS env safe-area hacks | marketplace + WebView injection | RN SafeArea |
| `HTMLVideoElement` / `HTMLAudioElement` | VideoFeed, FlexaMusic | expo-video / track-player |
| `window.ReactNativeWebView.postMessage` bridges | mobile ↔ web | Direct native modules / JS API clients |
| Service workers / web-push | web push paths | FCM only in Android app |
| Stripe.js embedded in SPA | checkout | Play Billing (digital) or Custom Tabs (physical hosted) |
| File input / `<input type=file>` | Sell, booster | ImagePicker + background upload module |
| localStorage for admin country | web | SecureStore / AsyncStorage |

---

## 5. Suggested migration waves (roadmap)

| Wave | Modules | Exit criteria |
|---|---|---|
| W0 | Architecture scaffold, auth, secure session, native tabs | App launches without loading flexamarket.com as home |
| W1 | Home, Search, Listing detail | Browse + open product natively |
| W2 | Cart, physical checkout, orders | Buy physical item end-to-end on device |
| W3 | Profile, settings, account deletion, report/block | Trust & safety baselines |
| W4 | Messages + push deep links | Chat works offline-tolerant |
| W5 | Sell + media upload | Create listing with camera/gallery |
| W6 | Promo videos consume | Discover + watch without WebView |
| W7 | Music/TV native players | Background audio policy addressed |
| W8 | Digital commerce (Billing) **or** hardened block UX | Payments policy aligned |
| W9 | Driver/delivery completion | Parity with web tracking |
| W10 | Remove WebView shell; Play submission pack | Sammy approval |

---

## 6. What can stay shared with the website

- REST/JSON contracts under `/api/*`
- Postgres schema & Drizzle models
- Wasabi signed URL flows
- Moderation, reports, blocks, RBAC
- Country eligibility & Android purchase guards (server)
- i18n string catalogs (extract to shared JSON if practical)

---

## 7. Inventory verification method

- Route list: `rg 'Route path=' artifacts/marketplace/src/App.tsx`
- Page modules: `find artifacts/marketplace/src/pages -name '*.tsx'`
- Mobile WebView usage: `rg SafeWebView|react-native-webview artifacts/mobile`
- Re-run before Phase 2 kickoff to catch new routes.

---

## 8. Behavior & navigation cross-links (audit extension)

Per-screen native behavior, Back rules, permissions, offline, and media notes live in:

- `ANDROID_SCREEN_BEHAVIOR_MATRIX.md`
- `ANDROID_UX_BEHAVIOR_AUDIT.md`
- `ANDROID_NAVIGATION_TEST_PLAN.md`
- `ANDROID_PERMISSIONS_MATRIX.md`

### Messaging vs support (voice)
| Channel | Voice messages |
|---|---|
| User↔user messaging | Supported (native RECORD_AUDIO on record) |
| Customer support | **Not supported** — API rejects `audio`/`voice` |

### Video duration (Booster Pro)
Server constant `MAX_VIDEO_SECONDS = 120` — preserve on native upload validation.
