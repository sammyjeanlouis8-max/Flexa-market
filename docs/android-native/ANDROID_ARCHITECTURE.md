# ANDROID_ARCHITECTURE.md

**Status:** Proposal only — **NOT STARTED** for implementation  
**Constraint:** Preserve production website + backend. Dedicated migration branch. No WebView-primary shell.

---

## 1. Current architecture (as audited)

```
┌────────────────────────────┐     HTTPS      ┌──────────────────────────┐
│ Expo app (artifacts/mobile)│ ───────────────▶│ flexamarket.com (Vite)   │
│  App.tsx + SafeWebView     │   WebView load  │ artifacts/marketplace    │
│  Push / WorkManager upload │◀── postMessage ─│ React SPA                │
└────────────────────────────┘                 └────────────┬─────────────┘
                                                            │ /api/*
                                                            ▼
                                               ┌──────────────────────────┐
                                               │ Express API + Postgres   │
                                               │ artifacts/api-server     │
                                               │ Wasabi media             │
                                               └──────────────────────────┘
```

**Facts:**
- `artifacts/mobile/App.tsx` header: “WebView shell with Android push notifications.”
- Tab routes (`index`, `search`, `sell`, `inbox`, `profile`) and most stack screens wrap `SafeWebView` → `https://flexamarket.com/...`.
- Native exceptions today: push (`expo-notifications`), background upload module, partial `delivery-tracking.tsx`, AuthContext/AsyncStorage, adaptive layout plugin.
- Backend already enforces Android digital-purchase initiation blocks (`androidDigitalPurchaseGuard.ts`) and UA marker `FlexaMarketAndroid/1.0`.

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
