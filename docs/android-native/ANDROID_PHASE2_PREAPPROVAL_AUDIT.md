# ANDROID_PHASE2_PREAPPROVAL_AUDIT.md

**Date:** 2026-11-09 (America/New_York)  
**PR:** #171 (open — docs only)  
**Purpose:** Final technical + Google Play compliance verification **before** Phase 2 approval  
**Code changes this document authorizes:** **None** (package name not applied)

---

## Executive verdict

| Question | Verdict |
|---|---|
| May Sammy approve Phase 2 planning/implementation of a **genuine native** Android app? | **YES — conditionally**, on an **ACTIVE** developer account, as a **new** app (`com.flexamarket.app`), **after** fixing policy root causes (not as a WebView republish). |
| Is exact prior suspension reason verified from Play Console in this environment? | **NO — UNVERIFIED HERE** (requires Console login / notice paste). |
| Best-supported historical risk theme in-repo + Play Spam policy | **WebView / Affiliate Spam** + incomplete native functionality |
| Does new package alone clear suspension? | **NO** |
| Is Play Billing present in the mobile app today? | **NO** — digital purchases intentionally blocked on Android |

---

## 1. Google Play compliance — suspension & republish

### 1.1 Facts provided by Sammy (accepted as operator-stated)
- Google Play **Developer account is ACTIVE**
- Only the **previous Android application** was suspended
- Previous package: `com.flexa.market`
- Proposed package: `com.flexamarket.app`

### 1.2 Exact suspension reason
| Item | Status |
|---|---|
| Play Console policy notice / email for `com.flexa.market` | **NOT ACCESSIBLE** from this agent environment |
| Repo explicit “Play said X” artifact | **Not found** as an official notice dump |
| Strongest policy alignment from audit | Spam → **Webviews and Affiliate Spam** (primary-purpose webview) — https://support.google.com/googleplay/android-developer/answer/9899034 |
| Secondary risks already mitigated partially in-repo | Digital payments via non-Play processors blocked on Android (`docs/android-purchase-policy.md`, `androidDigitalPurchaseGuard`) |

**Required Console verification (Sammy):**
1. Open Play Console → suspended app → Policy status / Appeals  
2. Copy exact citation(s) into this file or attach PDF  
3. Confirm whether notice mentioned WebView/spam, payments, UGC, deceptive behavior, etc.

### 1.3 Is publishing a new compliant app permitted?
From live **Enforcement Process** (https://support.google.com/googleplay/android-developer/answer/9899234):
- App **suspension/removal** removes that app (and prior versions) from Play.
- **Do not attempt to republish a removed app until all policy violations are fixed.**
- Multiple removals may escalate; repeated/serious violations can terminate **related** accounts.
- Appeals exist if action believed erroneous (https://support.google.com/googleplay/android-developer/answer/9899142).

**Interpretation for Flexa (not legal advice):**
- An **ACTIVE** developer account can typically submit **other** apps that comply with policy.
- Submitting a **new package** that is still a thin WebView of the same site **without remediation** is high risk (same violation class; may be treated as related abuse).
- Submitting a **new package** that is a **substantial native** app, fixes cited issues, and does not circumvent enforcement is the compliant path this program targets.

**Do not:** republish the suspended binary unchanged, mirror it under a new ID, or strip policy controls to “get approved.”

### 1.4 Remaining policy requirements (pre–Phase 2 checklist)

| Requirement | Type | Flexa status | Console? |
|---|---|---|---|
| Substantial native functionality (not mere WebView) | M | Plan exists; code still WebView shell | Reviewer will judge binary |
| Fix violations before republish of removed app | M | New app path preferred over republish | Confirm strategy in Console |
| Payments: Play Billing for digital IAP | M | Digital initiation blocked; Billing not integrated | Declare products if/when Billing ships |
| Physical goods may use other processors | M | Stripe/MonCash path intended | — |
| Photo Picker / no unjustified READ_MEDIA_* | M | blockedPermissions already | Verify merged manifest on AAB |
| UGC report/block/moderation | M | Web/API exist; native UX pending | UGC questionnaire |
| Account deletion in-app + URL | M | Web + anonymize API | Console URL fields |
| Data Safety form | M | Not verifiable here | **Console required** |
| Target API / AAB / signing | M | target 36 / AAB profile configured | Bundle explorer |
| Store listing matches app | M | Must show native UI if claiming native | Console listing |
| Families / ads / news declarations | M if applicable | Likely N/A / verify | Console |

---

## 2. New Android package name — validation

### Proposed: `com.flexamarket.app`

| Check | Result |
|---|---|
| Differs from suspended `com.flexa.market` | **PASS** |
| Differs from iOS `com.flexamarket.mobile` | **PASS** |
| Professional reverse-DNS | **PASS** |
| Conflict inside `app.json` / EAS today | No other Android package uses this string |
| Applied in code? | **NO** (correct — await approval) |

### Configuration impact map (when authorized later)

| System | Impact |
|---|---|
| `artifacts/mobile/app.json` `android.package` | Change to `com.flexamarket.app` |
| `google-services.json` | Currently bound to `com.flexa.market` — **must** register new Firebase Android app + replace JSON |
| FCM / Expo push | New FCM config; devices re-register tokens |
| `oauth_client` in google-services | Currently **empty array** — if Google Sign-In added later, create OAuth client for new package + SHA-1 |
| Deep links | `scheme: flexamarket` can remain; App Links `assetlinks.json` must list new package + cert |
| API integrations | **No change** — HTTPS to existing API; UA marker `FlexaMarketAndroid` remains |
| EAS / Play App Signing | New listing + credentials for new applicationId |
| iOS / website / Postgres / DO / Wasabi | **Unchanged** |

### Conflicts / risks
- Old FCM tokens for `com.flexa.market` will not apply to the new app.  
- Play listing is a **new application**, not an update of the suspended one.  
- Must not ship WebView-primary under the new ID.

---

## 3. Google Play Billing — transaction classification

**Sources:**  
https://support.google.com/googleplay/android-developer/answer/9858738  
https://support.google.com/googleplay/android-developer/answer/10281818  

**Current code:** No `react-native-iap` / Play Billing SDK in `artifacts/mobile`. Server + web enforce Android digital-purchase blocks.

| Transaction | Classification | Play Billing required in Play-distributed app? | Current Android approach | Phase 2+ recommendation |
|---|---|---|---|---|
| Marketplace physical goods checkout | Physical goods | **No** | Stripe / MonCash / etc. allowed | Preserve via native UI + Custom Tabs / trusted browser |
| Delivery / shipping / driver tip for physical delivery | Physical service | **No** (per in-repo policy) | Allowed | Preserve |
| Vendor subscription (Standard/Premium/VIP) | Digital subscription | **Yes** (typical) | Initiation **blocked** | Implement Play Billing **or** keep blocked with clear UX (no external pay CTA) |
| Listing / video Boost campaigns | Digital feature / promo spend | **Yes** (typical) | Blocked | Same |
| Music track purchase / artist plan | Digital content | **Yes** | Blocked / music commerce may be off | Same |
| Wallet / Flexa Card **top-up** that funds digital spend | Digital-related | Treat as **restricted** under current guard | Blocked | Do not re-enable via Stripe until Billing design approved |
| Wallet balance view, withdraw, transfer, history | Account money movement | Not “buy digital SKU” in-app | Allowed per policy doc | Preserve |
| Already-owned entitlements / cancel subscription | Post-purchase management | N/A initiation | Allowed | Preserve |
| Admin free boost grants | Staff tool | N/A consumer IAP | Server-side | Keep off consumer Android or staff-web only |

**Do not modify production payment systems in Phase 2 kickoff.**  
Phase 2 should keep the existing guard until a dedicated Billing workstream is approved.

**Unverified without Console / counsel:** edge cases (service fees, hybrid SKUs). Flag for human review before enabling any digital SKU.

---

## 4. Native Android architecture — validation

| Pillar | Assessment | Gate for Phase 2 |
|---|---|---|
| React Native + Expo | Expo ~54, RN 0.81.5, expo-router present — **compatible** with native screen migration | Start from `artifacts/mobile`, strip WebView-primary shell |
| Native navigation | expo-router Stack/Tabs exist but tabs hidden; Back via WebView today | Rebuild visible tabs + RN Back / predictive back |
| API reuse | `getBaseUrl()` → existing HTTPS API | Keep; SecureStore for JWT |
| Media | Background upload module reusable; players must be native | Photo Picker first |
| Push | expo-notifications + FCM file tied to old package | Retarget with new Firebase app when package approved |
| Architecture docs | `ANDROID_ARCHITECTURE.md` waves W0–W10 | Approve before coding |

**Phase 2 first slice (recommended if approved):**
1. Native auth + Home/Search/Listing using `/api`  
2. No WebView as default home  
3. Keep digital purchase guard  
4. Defer package rename to an explicit cutover PR **or** do rename at scaffold start if Sammy approves both together  

---

## 5. Must verify inside Google Play Console (human)

1. Exact suspension / removal citations for `com.flexa.market`  
2. That developer account remains Active and eligible to create a **new** app  
3. Whether any account-level restrictions remain  
4. Data Safety / UGC / Ads declarations for the new listing  
5. App signing enrollment for the new package  
6. Prior appeal status (if any)  

---

## 6. Pre-approval decision block

### Ready for Sammy to approve Phase 2 **if** all agree:
- [ ] Exact Console suspension reason reviewed by Sammy (paste into docs when available)  
- [ ] Phase 2 = **native** rewrite, not WebView shell under new package  
- [ ] Package `com.flexamarket.app` approved (change still deferred until explicit cutover)  
- [ ] Digital goods remain **blocked** until Play Billing project approved  
- [ ] Physical checkout preservation acknowledged  
- [ ] iOS / website / backend / DB untouched  

### Not ready to:
- Generate production AAB for store  
- Publish to Play  
- Merge docs PR without Sammy OK  
- Claim Play approval guaranteed  

---

## 7. Official source references

- Enforcement: https://support.google.com/googleplay/android-developer/answer/9899234  
- Appeals: https://support.google.com/googleplay/android-developer/answer/9899142  
- Spam / Webviews: https://support.google.com/googleplay/android-developer/answer/9899034  
- Payments: https://support.google.com/googleplay/android-developer/answer/9858738  
- Payments FAQ: https://support.google.com/googleplay/android-developer/answer/10281818  
- Photo & Video permissions: https://support.google.com/googleplay/android-developer/answer/15800983  
- Photo Picker: https://developer.android.com/training/data-storage/shared/photopicker  
- Policy Center: https://play.google.com/about/developer-content-policy/  
- In-repo: `docs/android-purchase-policy.md`, prior `docs/android-native/*`  

---

## 8. Files

Created: `docs/android-native/ANDROID_PHASE2_PREAPPROVAL_AUDIT.md`  
Related updates: `ANDROID_PROGRESS.md` (this turn)
