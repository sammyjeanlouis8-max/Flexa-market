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

## 4. Native Android architecture — capability verification

**Legend:** SPEC = documented for Phase 2+ · CODE = exists in repo today · TESTED = device/emulator proof this audit  
Nothing below is marked TESTED — **no Phase 2 implementation / device run this turn.**

| Capability | Today (WebView shell) | Required native behavior | SPEC | CODE today | TESTED |
|---|---|---|---|---|---|
| **Primary UI** | WebView loads flexamarket.com | RN screens only; WebView not primary | Yes | WebView primary | No |
| **Android Back** | WebView `goBack` / exit | expo-router stack pop; root → background; predictive back | Yes | Partial (WV) | No |
| **System / gesture nav** | CSS hacks / hidden tabs | Visible tabs; CTAs above nav/gesture inset | Yes | Adaptive plugin only | No |
| **Safe-area / edge-to-edge** | Injected CSS vars into WV | `SafeAreaProvider` + paddings; edge-to-edge aware | Yes | Partial | No |
| **Photo Picker** | Web file input in WV | Android Photo Picker / Expo ImagePicker; no READ_MEDIA_* | Yes | blockedPermissions in app.json | No |
| **Camera** | Web/`getUserMedia` in WV | Runtime CAMERA only on capture | Yes | Declared | No |
| **Microphone** | Web mic for voice notes | RECORD_AUDIO only on record; never for music play; **no support-chat voice** | Yes | Declared; support API rejects voice | No |
| **Location** | Web/GPS mixed | Smart Location priority; no startup GPS | Yes | Declared; web shoppingLocation logic | No |
| **Video uploads** | WV + background upload bridge | Picker/record, ≤120s boost, progress/retry/drafts, Wasabi APIs | Yes | Upload module exists | No |
| **Background music** | HTMLAudio + Media Session in WV | Native player + MediaSession/FGS mediaPlayback | Yes | Plan in FLEXA_MUSIC_NATIVE_PLAN | No |
| **Push notifications** | FCM → inject into WV | FCM → native deep links (retarget Firebase for new package) | Yes | expo-notifications + google-services | No |
| **Offline behavior** | Browser cache unreliable | Banner, cached reads, queued uploads where safe | Yes | Spec only | No |
| **Screen state preservation** | WV session | Preserve forms/scroll/drafts across Back & process death | Yes | Spec only | No |
| **Accessibility** | Web a11y | 48dp targets, labels, font scale | Yes | Spec only | No |
| **Preserve all Flexa features** | Via website | Same APIs/business rules; UI rewritten in RN | Yes | Backend ready | No |

Cross-refs: `ANDROID_PERMISSIONS_MATRIX.md`, `ANDROID_UX_BEHAVIOR_AUDIT.md`, `ANDROID_SCREEN_BEHAVIOR_MATRIX.md`, `ANDROID_NAVIGATION_TEST_PLAN.md`.

### Stack fitness
| Pillar | Assessment |
|---|---|
| Expo ~54 + RN 0.81.5 + expo-router | **Compatible** for native migration |
| Existing `/api` + Wasabi | **Reuse** — do not rebuild |
| Play Billing SDK | **Absent** — keep digital block until Billing project |
| WebView as primary | **Must end** in Phase 2 |

**Phase 2 first slice (if approved):**
1. Native auth + Home/Search/Listing (`/api`) — **no WebView home**  
2. Keep digital purchase guard  
3. Photo Picker on sell draft when wave reaches seller  
4. Package rename `com.flexamarket.app` only when Sammy authorizes cutover  

---

## 5. Protect existing systems (hard constraints)

| System | Action in Phase 2+ |
|---|---|
| Production website | **DO NOT MODIFY** for Android migration |
| DigitalOcean production deploy | **DO NOT MODIFY** as part of this program |
| Existing backend business logic | **Reuse**; change only with explicit justification + approval |
| PostgreSQL production data | **DO NOT MODIFY** / no destructive migrations for Android |
| Wasabi storage | **Preserve**; keep signed URL / proxy patterns |
| iOS app + `com.flexamarket.mobile` | **DO NOT MODIFY** |
| User accounts / orders | **Preserve** |
| Payment integrations | **Preserve**; Android digital initiation stays guarded |

Android work stays on dedicated branch(es); website/API remain operational.

---

## 6. Must verify inside Google Play Console (human)

1. Exact suspension / removal citations for `com.flexa.market`  
2. Account remains Active and eligible to create a **new** app  
3. Any account-level restrictions  
4. Data Safety / UGC / Ads declarations for the new listing  
5. App signing for the new package  
6. Prior appeal status (if any)  

---

## 7. FINAL VERIFICATION REPORT (12 points)

### 1) Google Play account eligibility
**Operator-stated: ACTIVE.** App-only suspension of `com.flexa.market`.  
**Agent verification of Console UI: NOT DONE** (no Console access).  
**Conclusion:** Eligible to pursue a **new compliant** listing — contingent on Sammy Console confirm.

### 2) Previous suspension assessment
**Exact reason: UNVERIFIED in Console.**  
**Best-supported theme:** WebView / Affiliate Spam + mere-webview functionality risk.  
**Partial mitigations already in repo:** Android digital purchase blocks; READ_MEDIA blocked.  
**Insufficient alone:** New package without native remediation.

### 3) New package name validation
**`com.flexamarket.app` — VALID proposal** (no conflict with current Android/iOS IDs).  
**Not applied in code.** Firebase still bound to `com.flexa.market`.

### 4) Google Play Billing requirements
- **Physical goods/services:** Stripe/MonCash/etc. permitted — preserve.  
- **Digital (subs, boosts, music, digital wallet top-up):** Play Billing typically required — **keep blocked** until Billing workstream.  
- **SDK today:** none in mobile.

### 5) Android architecture validation
Expo/RN/router **fit**. Must replace WebView-primary UI with native screens + Back/tabs/safe-area. Reuse API/Wasabi/push patterns.

### 6) Permissions verification
| Area | Plan status | Runtime proven? |
|---|---|---|
| Photo Picker | SPEC + blockedPermissions | **No** |
| Camera / mic / location | SPEC + declared | **No** |
| FGS upload | Declared for uploads | **No** this audit |
| Music FGS mediaPlayback | Planned later | **No** |

### 7) Remaining technical blockers
1. Sammy explicit Phase 2 approval  
2. Console suspension citation paste (recommended)  
3. Package/Firebase cutover authorization  
4. Play Billing decision (block vs implement)  
5. Device/emulator test lab for navigation/permissions  

### 8) Compliance risks
| Risk | Level |
|---|---|
| Shipping WebView shell under new package | **Critical** |
| External pay CTAs for digital goods | **High** |
| Broad media permissions reintroduced by deps | **High** |
| Missing in-app account deletion / UGC report | **High** if omitted |
| Data Safety mismatch | **High** |
| Related-account enforcement if repeat abuse | **High** |

### 9) Recommended solutions
1. Approve Phase 2 **native shell** (Home/Search/Listing/auth) — no WebView home.  
2. Approve package `com.flexamarket.app` cutover with new Firebase Android app.  
3. Keep digital purchase guard; website retains digital commerce.  
4. Photo Picker-first media; preserve Smart Location; voice only in user messaging.  
5. Attach Console notice; write remediation notes for Play review.  
6. Do not merge/deploy/publish until Sammy orders it.

### 10) Phase 2 implementation roadmap (post-approval only)

| Step | Deliverable | Protect prod? |
|---|---|---|
| 2.1 | Native tabs + SecureStore auth + Home API feed | Yes |
| 2.2 | Search + listing detail | Yes |
| 2.3 | Package/Firebase cutover when authorized | Mobile-only config |
| 2.4 | Cart + physical checkout (Custom Tabs) | Yes — no payment server rewrite |
| 2.5 | Sell + Photo Picker uploads | Yes — existing upload APIs |
| 2.6+ | Messages/voice, videos, music FGS, Billing project | Separate approvals |

Full waves: `ANDROID_SCREEN_INVENTORY.md` W0–W10.

### 11) Official documentation references
- https://support.google.com/googleplay/android-developer/answer/9899234  
- https://support.google.com/googleplay/android-developer/answer/9899142  
- https://support.google.com/googleplay/android-developer/answer/9899034  
- https://support.google.com/googleplay/android-developer/answer/9858738  
- https://support.google.com/googleplay/android-developer/answer/10281818  
- https://support.google.com/googleplay/android-developer/answer/15800983  
- https://developer.android.com/training/data-storage/shared/photopicker  
- https://developer.android.com/training/permissions/requesting  
- https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture  
- https://developer.android.com/develop/ui/views/layout/edge-to-edge  
- https://developer.android.com/guide/topics/media/media-controls  
- https://developer.android.com/docs/quality-guidelines/core-app-quality  
- https://docs.expo.dev/workflow/overview/  
- In-repo: `docs/android-purchase-policy.md`, `docs/android-native/*`

### 12) Final GO / NO-GO recommendation

| Decision | Recommendation |
|---|---|
| **Approve Phase 2 native development (docs → code)** | **CONDITIONAL GO** |
| **Publish / AAB / merge #171 / deploy / package rename now** | **NO-GO** until Sammy explicit order |
| **Ship WebView app under new package** | **NO-GO** |

**CONDITIONAL GO criteria:** native-only primary UI; preserve website/backend/iOS/DB; digital goods remain blocked initially; package cutover only when authorized; Console suspension reason reviewed by Sammy when available.

**This audit does not claim Play approval, device test passes, or Console fields verified.**

---

## 8. Pre-approval checklist (Sammy)

- [ ] Exact Console suspension reason reviewed (paste when available)  
- [ ] Phase 2 = **native** rewrite, not WebView shell  
- [ ] Package `com.flexamarket.app` approved (cutover deferred until you say)  
- [ ] Digital goods stay blocked until Billing project approved  
- [ ] Physical checkout preservation acknowledged  
- [ ] iOS / website / backend / DB untouched  

---

## 9. Files

- `ANDROID_PHASE2_PREAPPROVAL_AUDIT.md` (this document — final verification)  
- Related: progress, architecture, permissions, UX, navigation plans under `docs/android-native/`
