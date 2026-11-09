# ANDROID_PROGRESS.md

**Project:** Flexa Market — Native Android Migration  
**Branch:** `cursor/native-android-migration-audit-b867`  
**PR:** #171  
**Updated:** 2026-11-09 10:50 America/New_York  
**Scope:** Confirmed suspension documented + **authorized Phase 2 foundation** on isolated branch  
**Gates:** No production changes, no merge, no deploy, no release AAB, no Play publish without Sammy approval  

---

## 1. COMPLETED WORK

### Confirmed suspension (this turn)
- Official record: `docs/android-native/ANDROID_SUSPENSION_AND_CORRECTIVE_ACTIONS.md`
- Package `com.flexa.market`, version code **48**, policy **Webviews and Affiliate Spam**
- Google quote recorded; corrective actions mapped 1–15

### Phase 2 foundation (authorized, this branch only)
- Entry switched: `index.js` → `expo-router/entry` (WebView shell no longer root)
- Legacy shell quarantined as `LegacyWebViewShell.tsx` (not registered)
- Native tabs: Home / Search / Sell / Inbox / Profile
- Native Home + Search feed via `GET /api/listings`
- Native listing detail via `GET /api/listings/:id`
- Native login via `POST /api/auth/login` + existing AuthContext JWT
- Secondary routes use `NativePlaceholder` (no SafeWebView primary paths)
- Android package config set to `com.flexamarket.app` (versionCode reset to 1 for new package)
- iOS `com.flexamarket.mobile` untouched
- `googleServicesFile` removed until Firebase Android app exists for new package
- Photo Picker / blocked READ_MEDIA_* permissions preserved in `app.json`
- Backend / website / Postgres / Wasabi / digital-purchase guard untouched

### Prior audits (Phase 0–1)
- Architecture, inventory, permissions, UX matrices, package plan, pre-approval GO/NO-GO

## 2. CURRENT POSITION

| Phase | Status |
|---|---|
| 0 Documentation research | COMPLETE |
| 1 Repo audit | COMPLETE |
| 1b–1c Pre-approval | COMPLETE |
| Suspension corrective record | COMPLETE |
| 2 Native shell foundation | **IN PROGRESS — foundation landed** |
| 3 Feature migration waves | NOT STARTED (placeholders) |
| 4 Compliance hardening / device proof | NOT STARTED |
| 5 Emulator/device tests | NOT STARTED |
| 6 AAB / Play publish | **BLOCKED** — needs explicit approval |

## 3. REMAINING WORK

1. Native Sell (Photo Picker), Inbox/Chat, Favorites, Orders, Settings, Boosts, Wallet, KYC, etc.
2. Provide Firebase `google-services.json` for `com.flexamarket.app`
3. Restore push notifications on the new package
4. Device/emulator proof: cold start is native (not WebView)
5. Play Console remediation narrative + Sammy approval before AAB/publish
6. Optional Play Billing design for digital goods (keep blocked until then)

## 4. TEST RESULTS

| Activity | Result |
|---|---|
| `pnpm --filter @workspace/mobile` typecheck | PASS |
| Emulator/device native UX | NOT RUN |
| EAS AAB | NOT RUN (forbidden without approval) |
| Production deploy | NOT RUN (forbidden) |

## 5. BLOCKERS / RISKS

| Item | Notes |
|---|---|
| Feature parity incomplete | High — many screens are placeholders |
| Firebase package mismatch | High — old JSON was `com.flexa.market`; removed from app.json until replaced |
| No device verification yet | High — required before Play submission |
| Digital goods / Play Billing | Medium — server guard remains; native UX still needs clear messaging |
| New package ≠ approval | Acknowledged — native remediation required |
| Merge / AAB / publish | Hard gate — Sammy explicit approval |

## 6. NEXT ACTION

Continue Phase 2 feature waves on this isolated branch. **Do not** merge, deploy, generate release AAB, or submit to Google Play without explicit approval.

## 7. COMPLIANCE STATUS

| Topic | Status |
|---|---|
| WebView primary UI | **Corrected in entry** — native expo-router shell |
| Residual WebView usage | Quarantined / unused in routed screens |
| Photo / media permissions | READ_MEDIA_* still blocked |
| Backend / accounts / iOS | Preserved |
| Play submission | **NO-GO** until verification checklist in suspension doc is green |
