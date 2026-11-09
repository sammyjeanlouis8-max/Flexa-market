# ANDROID_COMPLIANCE_CHECKLIST.md

**Phase:** 0 research + 1 applicability mapping  
**Rule:** Distinguish **mandatory** Play/Android requirements from **recommendations**.  
**Rule:** Do not invent policies. Where a URL failed, that limitation is stated.

Legend: **M** = mandatory policy/platform requirement · **R** = recommendation/quality guideline · **STATUS** = Flexa status as of audit

---

## Documentation access limitations

| Requested URL | Result (this session) |
|---|---|
| https://developer.android.com/privacy-and-security | **HTTP 404** — used https://developer.android.com/security and security-tips instead |
| Some older Play Help answer IDs | **HTTP 404** — used Policy Center live links |
| Payments FAQ (first attempt) | Timeout once; succeeded with `?hl=en` |
| Full interactive Play Console Data Safety UI | **Not accessible** from this environment (requires Play Console login) |

---

## A. Platform & packaging

### A1. Target API level
1. **Source:** https://developer.android.com/google/play/requirements/target-sdk  
2. **Requirement:** New apps/updates must meet Play’s current target API schedule (page states existing apps must target Android 15 / API 35+ for broader availability; **starting Aug 31 2026**, new apps/updates must target Android 16 / API 36+ with listed OS exceptions).  
3. **Applicability:** Production AAB submissions.  
4. **Status:** `app.json` sets `compileSdkVersion`/`targetSdkVersion` **36**, `minSdkVersion` **24**.  
5. **Required changes:** Re-verify **merged** release manifest on each EAS build; bump when Play schedule advances.  
6. **Verification:** `aapt dump badging` / Play Console → App bundle explorer.  
**Type:** M

### A2. Android App Bundle
1. **Source:** https://developer.android.com/guide/app-bundle · Expo: https://docs.expo.dev/build-reference/android-builds/  
2. **Requirement:** Publish with AAB (Play’s serving format).  
3. **Applicability:** Store release.  
4. **Status:** EAS `production.android.buildType = app-bundle`.  
5. **Required changes:** None for format; generate AAB only after native validation.  
6. **Verification:** EAS artifact is `.aab`.  
**Type:** M (Play distribution)

### A3. App signing
1. **Source:** Play Console Help / Expo Submit https://docs.expo.dev/submit/android/  
2. **Requirement:** Signed release with Play App Signing.  
3. **Applicability:** All releases.  
4. **Status:** EAS `credentialsSource: remote`; Play key not in git (correct).  
5. **Required changes:** Keep secrets out of repo; document rotation.  
6. **Verification:** Play Console signing page.  
**Type:** M

---

## B. Spam / minimum functionality / WebView risk (historical suspension area)

### B1. Webviews and Affiliate Spam
1. **Source:** https://support.google.com/googleplay/android-developer/answer/9899034 (Spam)  
2. **Requirement (quoted theme from live page):** Apps whose **primary purpose** is to drive affiliate traffic or provide a **webview of a website** without permission are not allowed.  
3. **Applicability:** **Critical** — current Android app is explicitly a Flexa Market WebView shell.  
4. **Status:** **NON-COMPLIANT INTENT vs goal** for “genuine native.” Ownership of flexamarket.com mitigates “without permission,” but **mere WebView primary purpose** remains a review risk (also echoed in Families policy language).  
5. **Required changes:** Replace primary UI with native RN screens providing substantial functionality (see architecture).  
6. **Verification:** Manual review checklist; reviewer login; screenshots show native UI not a browser frame.  
**Type:** M

### B2. Functionality, Content, and User Experience
1. **Source:** https://support.google.com/googleplay/android-developer/answer/9898783  
2. **Requirement:** Apps must provide a functioning experience meeting Play’s functionality/UX rules (page accessed; enforce via full reading before submit).  
3. **Applicability:** Entire consumer app.  
4. **Status:** Web product is feature-rich; **Android wrapper does not independently implement** those features natively.  
5. **Required changes:** Native feature parity waves W0–W10.  
6. **Verification:** Device walkthrough of core user journeys without relying on website chrome.  
**Type:** M

### B3. Families “mere webview” note
1. **Source:** https://support.google.com/googleplay/android-developer/answer/9893335  
2. **Requirement:** Families policy text includes that an app must not merely provide a webview of a website / affiliate traffic purpose.  
3. **Applicability:** If app targets children/families; even outside Families, language reinforces B1.  
4. **Status:** Flexa Market is a general marketplace with UGC — typically **not** Designed for Families; still avoid mere-WebView design.  
5. **Required changes:** Confirm Play Console target audience answers; native UI.  
6. **Verification:** Play Console questionnaires + store listing.  
**Type:** M if Families; otherwise reinforcing guidance for B1

### B4. Core app quality (stability, navigation, notifications, etc.)
1. **Source:** https://developer.android.com/docs/quality-guidelines/core-app-quality  
2. **Requirement:** Quality guidelines (stability/ANR, navigation, notifications relevance, etc.) — **recommendations** aligned with Play expectations.  
3. **Applicability:** All Android builds.  
4. **Status:** Not re-tested this phase on devices.  
5. **Required changes:** Native Back, visible tabs, crash-free sessions, relevant FCM only.  
6. **Verification:** Pre-launch report, Firebase Crashlytics/Sentry if used, manual Back tests.  
**Type:** R (strongly expected)

---

## C. Privacy, security, permissions

### C1. Android security checklist
1. **Source:** https://developer.android.com/privacy-and-security/security-tips · hub https://developer.android.com/security  
2. **Requirement:** Secure storage, least-privilege permissions, safe IPC, etc.  
3. **Applicability:** Auth tokens, uploads, location.  
4. **Status:** AsyncStorage token today; WebView cookie/session hybrid.  
5. **Required changes:** SecureStore; minimize permissions; keep blockedPermissions for broad media/storage as in `app.json`.  
6. **Verification:** Manifest review + static analysis.  
**Type:** M/R mix (platform expectations + Play deception/device abuse)

### C2. Runtime permissions (camera, mic, location, notifications)
1. **Source:** Android permission model + Play photo/video permissions Help (also cited in `docs/android-purchase-policy.md`: https://support.google.com/googleplay/android-developer/answer/15800983)  
2. **Requirement:** Request only needed permissions; photo/video access restricted; use system pickers where required.  
3. **Applicability:** Sell, KYC, delivery, chat attachments.  
4. **Status:** `app.json` declares CAMERA, RECORD_AUDIO, LOCATION, POST_NOTIFICATIONS; **blocks** READ_MEDIA_* and legacy storage — good direction.  
5. **Required changes:** Ensure native flows use Photo Picker / document picker; denial-recoverable UX.  
6. **Verification:** Deny-permission test matrix on Android 13–15.  
**Type:** M

### C3. Foreground services
1. **Source:** https://support.google.com/googleplay/android-developer/answer/13392821  
2. **Requirement:** Declare correct FGS types; justify use (uploads / media playback).  
3. **Applicability:** Background upload module; future music playback service.  
4. **Status:** `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC` present for uploads.  
5. **Required changes:** If adding media playback FGS, declare mediaPlayback type and Play Console declarations.  
6. **Verification:** Manifest + Play declarations.  
**Type:** M when FGS used

### C4. Account deletion
1. **Source:** Referenced from Payments FAQ education index (“Understanding Google Play’s app account deletion requirements”); full article must be opened in Play Console Help before submit.  
2. **Requirement:** In-app account deletion path + Play Console URL.  
3. **Applicability:** Accounts on Flexa Market.  
4. **Status:** Web `/delete-account` + server anonymization in `users.ts`; **native in-app path not independent**.  
5. **Required changes:** Native settings entry calling same API; verify retention disclosures.  
6. **Verification:** Reviewer deletes test account end-to-end.  
**Type:** M

### C5. Data Safety form
1. **Source:** Play Console Data safety (UI not accessible here)  
2. **Requirement:** Accurate collection/sharing/security disclosures.  
3. **Applicability:** Every release.  
4. **Status:** Cannot verify from git.  
5. **Required changes:** Update form when native collects same data via RN APIs.  
6. **Verification:** Play Console form vs actual SDK behavior.  
**Type:** M

### C6. React Native security guidance
1. **Source:** https://reactnative.dev/docs/security  
2. **Requirement:** Guidance on storing secrets, HTTPS, etc.  
3. **Applicability:** RN client.  
4. **Status:** No secrets should be in bundle (Wasabi keys server-side — keep).  
5. **Required changes:** Follow SecureStore; disable cleartext.  
6. **Verification:** Code review.  
**Type:** R

---

## D. Payments

### D1. Google Play Billing for digital goods
1. **Source:** https://developer.android.com/google/play/billing · https://support.google.com/googleplay/android-developer/answer/9858738 · FAQ https://support.google.com/googleplay/android-developer/answer/10281818  
2. **Requirement:** Play-distributed apps charging for digital goods/services must use Play’s billing system unless an allowed exception applies.  
3. **Applicability:** Subscriptions, boosts, music purchases, wallet top-ups that fund digital spend.  
4. **Status:** **Digital initiation blocked** on Android (`androidDigitalPurchaseGuard`, `docs/android-purchase-policy.md`). Physical checkout retained.  
5. **Required changes:** Either implement Play Billing for digital SKUs **or** keep clear in-app messaging that digital purchases are unavailable on Android (no external payment CTA for those digital items).  
6. **Verification:** Attempt boost/subscription from Android build → blocked or Billing sheet; physical cart succeeds.  
**Type:** M

### D2. Physical goods / services
1. **Source:** Same Payments policy (exceptions for physical goods).  
2. **Requirement:** Physical product payments may use alternate processors.  
3. **Applicability:** Marketplace checkout, delivery tips as documented.  
4. **Status:** Designed to remain available.  
5. **Required changes:** Native checkout UX; careful Stripe Custom Tabs handling (known WebView redirect bugs in memory docs).  
6. **Verification:** Buy a physical listing on device.  
**Type:** M (correct categorization)

---

## E. UGC, safety, moderation

### E1. User-generated content
1. **Source:** Developer Policy Center https://play.google.com/about/developer-content-policy/ (Restricted Content / related policies); UGC-specific Help articles linked from education index — open latest UGC article in Console before submit.  
2. **Requirement:** UGC apps typically need reporting, blocking, moderation, terms.  
3. **Applicability:** Listings, messages, videos, music, comments.  
4. **Status:** Web has reports (`/api/reports`), admin moderation, community guidelines, block flows — **not native-first**.  
5. **Required changes:** Expose report/block in native UI; keep server moderation.  
6. **Verification:** Report listing/user from Android; staff sees queue.  
**Type:** M for UGC apps

### E2. Child endangerment / age-restricted content
1. **Source:** https://support.google.com/googleplay/android-developer/answer/9878809 · https://support.google.com/googleplay/android-developer/answer/16302250  
2. **Requirement:** No child sexual abuse content; age-restricted content handled per policy.  
3. **Applicability:** Marketplace UGC.  
4. **Status:** Policies/pages exist on web; enforcement is moderation ops.  
5. **Required changes:** Ensure reporting + prohibited items policy linked in-app.  
6. **Verification:** Policy links + moderation SOP.  
**Type:** M

### E3. Deceptive behavior
1. **Source:** https://support.google.com/googleplay/android-developer/answer/9888077  
2. **Requirement:** Store listing and app behavior must match.  
3. **Applicability:** Screenshots must show native app if claiming native.  
4. **Status:** Risk if listing shows rich native UI while binary is WebView.  
5. **Required changes:** Align metadata with actual build.  
6. **Verification:** Compare screenshots to build.  
**Type:** M

---

## F. Expo / RN process references

| Topic | URL | Type |
|---|---|---|
| Expo app development overview | https://docs.expo.dev/workflow/overview/ | R |
| Expo Notifications | https://docs.expo.dev/versions/latest/sdk/notifications/ | R |
| Expo Submit Android | https://docs.expo.dev/submit/android/ | R |
| RN getting started | https://reactnative.dev/docs/getting-started | R |

---

## G. Remaining compliance risks (even after removing WebView)

1. Digital goods without Play Billing (if unblocked incorrectly).  
2. Incomplete UGC report/block UX in early native waves.  
3. Inaccurate Data Safety / permissions declarations.  
4. Foreground service misuse for music/uploads.  
5. Account deletion not reachable in-app.  
6. Store listing mismatch / deceptive screenshots.  
7. Crash/ANR on low-end Android devices.  
8. Admin tools accidentally exposing privileged actions without server checks (server must remain source of truth).

**Removing WebView alone does not guarantee approval** — documented explicitly per Sammy’s Phase 4 instruction.

---

## H. Priority remediation order (post-approval)

1. Native shell with substantial functionality (B1/B2).  
2. Payments categorization + Billing or hardened blocks (D1).  
3. Permissions + SecureStore (C1/C2).  
4. UGC report/block + account deletion (E1/C4).  
5. Data Safety + listing honesty (C5/E3).  
6. Media FGS only if needed (C3).
