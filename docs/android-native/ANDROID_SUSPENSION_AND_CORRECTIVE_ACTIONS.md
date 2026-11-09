# Android Suspension & Corrective Actions

**Project:** Flexa Market  
**Document status:** Authoritative Phase 2 gate record  
**Updated:** 2026-11-09 (America/New_York)  
**Branch:** `cursor/native-android-migration-audit-b867`  
**Authority:** Sammy (Designer) — confirmed Play Console facts below  

---

## 1. Confirmed Google Play suspension

| Field | Value |
|---|---|
| Previous Android package | `com.flexa.market` |
| Suspended version code | **48** |
| Policy | **Webviews and Affiliate Spam** |
| Official reason (Google) | *"Your app’s primary purpose is to drive traffic to a website without permission from the website owner."* |
| Application display name | Flexa Market (unchanged) |
| Proposed replacement package | `com.flexamarket.app` |
| iOS bundle (do not change) | `com.flexamarket.mobile` |

**Interpretation for remediation:** Google treated the shipped Android binary as a WebView shell whose primary purpose was to open the website — not as a genuine native marketplace client. Ownership of flexamarket.com does **not** by itself cure a WebView-primary finding. A package rename alone does **not** cure it and does **not** guarantee approval.

---

## 2. Mandatory corrective actions

| # | Requirement | Corrective action | Status |
|---|---|---|---|
| 1 | Genuine native Android app (React Native + Expo) | Switch entry from WebView `App.tsx` to **expo-router** native shell | IN PROGRESS (Phase 2) |
| 2 | WebView must not be primary UI | Quarantine legacy WebView shell; tabs/home/search/listing/auth use RN components | IN PROGRESS |
| 3 | Marketplace screens in RN components | Home feed, search, listing detail, login via `/api` | IN PROGRESS (foundation) |
| 4 | Preserve Flexa Market features & business rules | Consume existing API; keep country gates, boosts, digital-goods guard | PRESERVED (backend) |
| 5 | Preserve backend / Postgres / DO / Wasabi / accounts | No production schema or deploy changes in this branch | PRESERVED |
| 6 | Proposed package `com.flexamarket.app` | Applied in Expo Android config on this branch only; **not** published | CONFIGURED (dev) |
| 7 | Keep app name Flexa Market | `expo.name` remains `Flexa Market` | DONE |
| 8 | Do not modify iOS / iOS bundle | iOS `bundleIdentifier` left as `com.flexamarket.mobile` | DONE |
| 9 | Follow Webviews & Affiliate Spam policy | Native primary UI; no WebView-as-app republish | IN PROGRESS |
| 10 | Android Photo Picker / media policy | Keep READ_MEDIA_* blocked; use system Photo Picker paths | PRESERVED in app.json |
| 11 | Do not circumvent Play enforcement | Honest remediation; no cloaking / dual APK | POLICY |
| 12 | New package ≠ approval | Documented; Console remediation still required before submit | ACKNOWLEDGED |
| 13 | Document suspension + corrective actions | This file | DONE |
| 14 | Phase 2 on isolated branch | This branch only | DONE |
| 15 | No prod / merge / deploy / AAB / publish without approval | Hard gate | IN FORCE |

---

## 3. Architecture change that addresses the finding

**Before (suspended path):**  
`index.js` → `registerRootComponent(App)` → full-screen `WebView` loading `https://flexamarket.com`.

**After (Phase 2 corrective path):**  
`index.js` → `expo-router/entry` → native tabs + screens that call the existing Flexa Market REST API (`/api/listings`, `/api/auth/*`, etc.) with React Native UI.

WebView remains **quarantined** as `LegacyWebViewShell.tsx` for historical reference only and is **not** the application entry point.

---

## 4. Ecosystem preservation (non-negotiable)

- Website / web marketplace continues to operate independently.
- PostgreSQL, DigitalOcean API, Wasabi object storage, user accounts, orders, and payments backends are **not** modified by this Android remediation.
- iOS application and bundle identifier are **unchanged**.
- Server-side `androidDigitalPurchaseGuard` continues to block Android digital-goods purchase initiation until Play Billing is authorized and implemented.

---

## 5. Remaining compliance risks (pre-submission)

| Risk | Severity | Notes |
|---|---|---|
| Incomplete feature parity | High | Sell, inbox/chat, boosts, wallet, KYC, driver, admin, etc. still need native waves |
| Residual WebView routes in `app/` | High until removed | Secondary routes must not reintroduce WebView-primary UX |
| Firebase / FCM package binding | High for builds | `google-services.json` historically bound to `com.flexa.market`; must be regenerated for `com.flexamarket.app` before any Android build |
| Play Billing absent | Medium | Digital goods remain blocked; physical Stripe/MonCash OK when native checkout lands |
| Console remediation narrative | Medium | Operator must attach this corrective record when creating the new listing |
| Device / emulator verification | High | Not yet executed — required before any Play submission |
| AAB / publish | Blocked | Explicit Sammy approval required |

---

## 6. Technical blockers (current)

1. Full native feature waves (W1+) not complete — foundation only.
2. New Firebase Android app / `google-services.json` for `com.flexamarket.app` not yet supplied.
3. No emulator/device proof that Home/Search/Listing/Auth are WebView-free.
4. No authorized release AAB, merge to main, production deploy, or Play upload.
5. Exact Play Console appeal / new-listing workflow still operator-owned.

---

## 7. Pre-Google-Play verification checklist

Before **any** Google Play submission of the new package, verify:

- [ ] Cold start opens **native** Home (not a WebView of flexamarket.com)
- [ ] Search, listing detail, and login are native RN screens backed by `/api`
- [ ] No primary navigation path dumps the user into a full-screen site WebView
- [ ] Photo/video capture uses Photo Picker / camera intents without unjustified READ_MEDIA_* 
- [ ] Digital goods purchase paths remain blocked without Play Billing
- [ ] Package is `com.flexamarket.app`, display name Flexa Market, iOS untouched
- [ ] Suspension corrective narrative attached in Play Console
- [ ] Sammy explicit approval for AAB + publish

**Submission stance today:** **NO-GO** for Play upload. Phase 2 native foundation is authorized and in progress on this isolated branch only.
