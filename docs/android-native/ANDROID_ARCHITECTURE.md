# ANDROID_ARCHITECTURE.md

**Status:** Phase 2 foundation **IN PROGRESS** on isolated branch  
**Constraint:** Preserve production website + backend. No WebView-primary shell. No AAB/publish without approval.

---

## 1. Current architecture (Phase 2 corrective path)

```
┌──────────────────────────────────────────────┐
│ Flexa Market Android (Expo + RN + TypeScript)│
│  index.js → expo-router/entry                │
│  Native Home / Search / Listing / Login      │
│  AuthContext JWT → existing /api             │
│  Placeholders for remaining feature waves    │
│  LegacyWebViewShell.tsx QUARANTINED (unused) │
└───────────────────────┬──────────────────────┘
                        │ HTTPS JSON only
                        ▼
          Existing API + Postgres + Wasabi
          (website SPA still independent)
```

**Facts (post Phase 2 foundation):**
- Entry is `expo-router`, not `registerRootComponent(WebView App)`.
- Android package config: `com.flexamarket.app` (proposed; not published).
- iOS bundle remains `com.flexamarket.mobile`.
- Backend still enforces `androidDigitalPurchaseGuard` for Android digital goods.
- Suspended prior binary: `com.flexa.market` version code 48 (Webviews / Affiliate Spam).

## 2. Target architecture (approved design intent)

```
┌──────────────────────────────────────────────┐
│ Flexa Market Android (Expo + RN + TypeScript)│
│  expo-router native screens                  │
│  React Query / fetch → existing /api         │
│  Secure token storage (Keystore-backed)      │
│  Native players (video / music)              │
│  Play Billing module (digital goods)         │
│  FCM via expo-notifications                  │
└───────────────────────┬──────────────────────┘
                        │ HTTPS JSON only
                        ▼
          Existing API + Postgres + Wasabi
          (no rewrite unless justified)
```

**Hard rules:**
- Primary UI = React Native components (not a website inside WebView).
- Website remains the browser product; shared API contracts.
- Optional: limited in-app browser **only** for trusted external payment hosts (Stripe Checkout / MonCash) where Play policy allows physical-goods flows — never as the app’s primary surface.
- Admin / Super Admin Control Center: ship as native screens for required ops **or** defer to web-only with explicit product decision (Play reviewers typically don’t need full admin).

## 3. Recommended package layout

```
artifacts/mobile/
  app/                    # expo-router native screens (rewrite gradually)
  src/
    api/                  # typed clients wrapping existing endpoints
    features/             # marketplace, videos, music, cart, chat, ...
    ui/                   # design-system primitives
    auth/                 # session, secure storage
    billing/              # Play Billing bridge
    media/                # video + audio native players
  modules/                # keep flexa-background-upload
  security/               # URL allowlists for rare external browsers
```

Keep `@workspace/api-zod` / shared types where possible; do **not** import DOM/Vite marketplace components into RN.

## 4. Navigation & Android UX

| Requirement | Approach |
|---|---|
| Hardware / gesture Back | `expo-router` + `BackHandler` at stack roots; never exit app from nested screens unexpectedly |
| Edge-to-edge / system bars | `react-native-safe-area-context` + `expo-system-ui`; verify Android 15 edge-to-edge behavior |
| Tabs | Visible native tab bar (current tabs are hidden because WebView owns chrome) |
| Deep links | Existing `flexamarket://` scheme + https app links; map to native routes |
| Offline / API errors | Native banners + retry; no blank WebView |

## 5. Auth & security

- Persist JWT in Expo SecureStore (or equivalent Keystore-backed store), not plain WebView cookies alone.
- Reuse existing `/api` login/register/OTP; no parallel auth service.
- Certificate pinning: evaluate later; at minimum TLS + server auth checks.
- Never embed Wasabi keys, Stripe secret keys, or DO tokens in the app binary.
- Continue server-side RBAC for admin/superadmin.

## 6. Payments architecture

| Commerce type | Android approach |
|---|---|
| Physical marketplace goods + delivery | Existing Stripe/MonCash/etc. via API; in-app browser only if required for hosted checkout |
| Digital subscriptions, boosts, music, wallet top-up for digital spend | **Google Play Billing** (mandatory for Play-distributed digital goods) **or** remain blocked until Billing ships |
| Already-owned entitlements | Keep readable; do not confiscate |

Source: Play Payments policy + Payments FAQ (see compliance checklist).

## 7. Media

| Feature | Web today | Native target |
|---|---|---|
| Promo videos | HTML5 video in SPA | `expo-video` / similar + existing `/api/videos/*` |
| Flexa Music | `HTMLAudioElement` + Media Session | Native player + Android media notification / FGS where required |
| Uploads | Web picker + Wasabi proxy | Keep WorkManager uploader; wire native ImagePicker/DocumentPicker |

## 8. Migration strategy (incremental)

1. **Shell swap:** Native tabs + auth gate; Home consumes `/api/listings` natively.
2. **Buyer path:** Search → Listing detail → Cart → Physical checkout.
3. **Social/UGC:** Messages, report/block, profiles.
4. **Seller path:** Sell, orders, sales.
5. **Promo videos / booster** (read + create; billing gated).
6. **Music / TV**.
7. **Driver / delivery**.
8. **Admin subset** (if product requires in-app).
9. Remove WebView as default; quarantine any remaining WebView to explicitly justified flows.

Each step: feature flag / build flavor so website and old binary behavior stay intact.

## 9. CI / DevOps

- Keep EAS profiles in `eas.json` (production → `app-bundle`).
- GitHub `android.yml` + release preflight remain.
- New checks: detox/maestro E2E smoke; Playwright stays for website.
- Deploy website/API independently of Play AAB uploads.

## 10. Explicit non-goals (Phase 2 gate)

- Do not rebuild PostgreSQL schema for migration.
- Do not replace DigitalOcean API hosting.
- Do not delete WebView code until native parity gates pass.
- Do not publish to Play without Sammy approval.
- Do not change the Android package name until Sammy approves `ANDROID_PACKAGE_MIGRATION_PLAN.md`.
- Do not modify iOS bundle identifier `com.flexamarket.mobile`.
- Do not modify production website / DO deploy / Wasabi / user data.

---

## 11. Package identity (audit extension)

| Item | Value |
|---|---|
| Current Android package (suspended lineage) | `com.flexa.market` |
| **Proposed** new Android package | `com.flexamarket.app` |
| iOS bundle (unchanged) | `com.flexamarket.mobile` |
| Code applied? | **No** |

See `ANDROID_PACKAGE_MIGRATION_PLAN.md` for Firebase, EAS, FCM, App Links, and Play enforcement caveats.

## 12. Permissions & media architecture (audit extension)

- Default media intake = **Android Photo Picker** (no broad `READ_MEDIA_*`).
- Camera / mic only on user-initiated capture/record.
- Uploads continue through existing backend + Wasabi + optional WorkManager uploader.
- Messaging voice notes: `RECORD_AUDIO` on record only; **support chat remains voice-free**.
- Music background: MediaSession + typed FGS when implemented; never request mic for playback.
- Location: Smart Location priority (manual → saved address → GPS → IP → fallback); no startup GPS prompt.

Details: `ANDROID_PERMISSIONS_MATRIX.md`, `ANDROID_UX_BEHAVIOR_AUDIT.md`.

## 13. Updated Phase 2 roadmap (still pending approval)

| Step | Work | Exit |
|---|---|---|
| 2.0 | Approve package + Billing strategy | Written go-ahead |
| 2.1 | Expo native shell + tabs + SecureStore auth | Home without WebView |
| 2.2 | Apply `com.flexamarket.app` + new Firebase Android app | Build installs; FCM works |
| 2.3 | Home + Search + Listing (API) | Browse native |
| 2.4 | Photo Picker sell draft | Upload progress/retry |
| 2.5 | Cart + physical checkout (Custom Tabs) | Buy physical item |
| Later waves | Per `ANDROID_SCREEN_INVENTORY.md` W3–W10 | Parity gates |
