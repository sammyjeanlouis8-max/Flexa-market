# Full native ↔ WebView audit — PR #236

## Build identity
| Field | Value |
|---|---|
| Branch | `cursor/webview-native-layout-parity-9d45` |
| **Final APK commit** | `27b437dc` + Settings scroll commit (see HEAD after push) |
| Package | `com.flexamarket.app` |
| versionName | `1.0.1` |
| versionCode | `55` |
| WebView reference | `https://flexamarket.com` (production DigitalOcean) |
| Backend API | `https://flexamarket.com/api` |
| Emulator viewports | 360×640 and 390×844 logical, font scale 1.0, EN |

## Screen count vs “84”
| Layer | Count | Notes |
|---|---:|---|
| `artifacts/mobile/app/**/*.tsx` files | **84** | Includes `_layout.tsx` ×3 + `+not-found.tsx` |
| Route screens (audit inventory) | **81** | Excludes layouts / not-found |
| Unique user-facing routes (dedupe tab aliases) | **~78** | `/cart` appears as tab + stack; `/favorites`↔`/saved` |

Difference from “84 screens”: the number 84 matches **all app TSX files**. Usable screens for comparison = **81** (or ~78 after alias dedupe). Web marketplace `App.tsx` defines **many more** admin/legal/dev routes without native counterparts (expected).

## Inventory summary
### Aliases / redirects (native)
| From | To |
|---|---|
| `/booster` | `/boost-video` |
| `/settings/videos` | `/my-videos` |
| `/favorites` | Saved flow (`/saved` / favorites screen) |
| `/driver-dashboard` | `/driver/dashboard` (both exist) |

### Native-only / thin wrappers
| Native | Notes |
|---|---|
| `/website` | In-app WebView host |
| `/language-picker` | Native language sheet (web uses switcher chrome) |
| `/videos/watch` | Native expo-av player (web VideoFeed) |
| `/boost-video` | Native boost wizard (web `/booster/create`) |
| `/my-videos` | Native seller video tabs (web settings/videos + booster) |

### Web routes without dedicated native screen (sample)
Admin subroutes (`/admin/*` panels), legal pages (many map via `/legal/[slug]`), `/music/upload`, `/music/earnings`, `/dev/*`, `/auth/suspended`, `/auth/set-new-password`, `/bouillon`, `/driver-selfie`, etc. Marked **WEB-ONLY / UNVERIFIED** for native parity.

## Critical regression: Sign In @ 360×640
| Check | Result |
|---|---|
| Sign In CTA fully above gesture (keyboard closed) | **PASS** — orange CTA clearance **89px** |
| Globe beside brand copy | **PASS** |
| Keyboard open scrollable | **PASS** |
| Sign Up shared AuthShell | **PASS** (scroll to CTA) |
| Evidence | `artifacts/qa/signin236/`, `audit236/sbs_login_*.png`, `audit236/signin-360-regression.png` |

## Fixes in this audit pass
1. **Sign In AuthShell** (short viewport + gesture inset) — cherry-picked onto #236; CI typecheck duplicate style removed.
2. **Settings** — wrapped rows in `ScrollView` + bottom safe-area padding so Help row is not clipped by the gesture bar.

## Deep-link smoke (62 routes @ 390)
All listed routes opened without native crash. Guest empty-states / auth gates (cart empty, chatbot “Sign in…”, wallet→login) are **expected**, not blanks. Full JSON: `audit236/smoke390.json`. Per-route PNGs: `audit236/native390_*.png`.

## Critical SBS index (WebView left | Native right)
| Screen | 360 | 390 |
|---|---|---|
| Home | `sbs_home_360.png` | `sbs_home_390.png` |
| Listing #32 | `sbs_listing_360.png` | `sbs_listing_390.png` |
| Sign In | `sbs_login_360.png` | `sbs_login_390.png` |
| Sign Up | `sbs_register_360.png` | `sbs_register_390.png` |
| Videos | `sbs_videos_360.png` | `sbs_videos_390.png` |
| Cart | `sbs_cart_360.png` | `sbs_cart_390.png` |
| Settings | `sbs_settings_360.png` | `sbs_settings_390.png` |

Prior packs: `artifacts/qa/promo236/`, `artifacts/qa/signin236/`, drawer236 artifacts under `/opt/cursor/artifacts/`.

## Functional / API (designated DO env)
| Flow | Controls / API | Result |
|---|---|---|
| Sign In / Sign Up | Fields, eye, forgot, EULA/Terms, checkbox | Layout **PASS**; live credential login **UNVERIFIED** (no secrets) |
| Side menu | Destinations guest/buyer | Prior drawer audit **PASS**; admin/seller **UNVERIFIED** |
| Home / PDP | Grid, gallery, ATC/Buy | Layout **PASS**; ATC write uses cart API when signed in |
| Videos / watch | Feed, autoplay, mute, Skip@10s, View Product | **PASS** (promo236); renew charge **UNVERIFIED** (route 404 on DO) |
| My Videos tabs | Active/Under Review/Rejected/Expired | UI **PASS**; populated rows need seller account **UNVERIFIED** |
| Renew Boost | Idempotent POST `/boost/:id/renew` | Code in PR; live **UNVERIFIED** (404 until deploy) |
| Checkout / orders / wallet | Requires auth + cart/order data | Nav **CHECKED**; end-to-end pay **UNVERIFIED** (sandbox + secrets) |
| Messaging | Opens chat | Destination **PASS**; some buyer chats **Forbidden** |

## Totals (honest scoring)
| Bucket | Count | Rule |
|---|---:|---|
| **Passed** (layout+nav+applicable guest functions) | **28** | Critical guest paths + smoke-open screens with matching WebView or intentional empty/auth gate |
| **Failed** (fixed this pass) | **2** | Sign In clip @360 (fixed); Settings Help clip (fixed) |
| **Blocked** | **12** | Seller/admin/driver/agent secrets or DO renew deploy |
| **Untested / partial** | **39+** | Remaining inventory: WebView SBS not generated for every route; role-gated writes not exercised |

A screen is marked **Passed** only when layout at both sizes, navigation, and guest-applicable controls succeed. Role-gated writes remain **UNVERIFIED** without test accounts.

## Blockers
1. No `FLEXA_TEST_SELLER_*` / `FLEXA_TEST_ADMIN_*` / driver secrets → My Videos populated tabs, Renew charge, admin panels, driver dashboards.
2. `POST /api/boost/:id/renew` **404** on production until api-server deploy.
3. Full SBS for all 81 screens × 2 viewports not generated in one pass (critical set attached; smoke PNGs cover native opens).

**No merge / no AAB** until Sammy approves.
