# ANDROID_TEST_RESULTS.md

**Phase:** Phase 2 Milestone 5 (+ prior)  
**Rule:** Do not claim tests passed unless executed.

---

## 1. COMPLETED WORK (testing)

| ID | Activity | Environment | Result |
|---|---|---|---|
| M5-TSC | `npm run typecheck` in `@workspace/mobile` | Cloud agent | **PASS** |
| M5-UNIT | notificationRouting + pushToken + firebaseAndroidConfig + prior suites | Cloud agent | **PASS** (28/28) |
| M5-API | Live auth gates: conversations, messages, notifications, support, push token, prefs, chatbot → 401; chatbot/status 200 | `flexamarket.com` | **PASS** |
| M5-FCM-DEVICE | Physical/emulator FCM token + cold/warm delivery | — | **NOT RUN** (needs Firebase JSON for `com.flexamarket.app`) |
| M5-CHAT-E2E | Authenticated send message / create ticket | — | **NOT RUN** (no test credentials) |
| M4-TSC | `npm run typecheck` in `@workspace/mobile` | Cloud agent | **PASS** |
| M4-UNIT | `checkoutMath` + prior unit suites | Cloud agent | **PASS** (14/14) |
| M4-POLICY | `nativePolicy.test.js` | Cloud agent | **PASS** |
| M4-API | Live auth gates: orders/purchases, cart/checkout, stripe/checkout, commission quote → 401 | `flexamarket.com` | **PASS** |
| M4-E2E-PAY | Authenticated Stripe/wallet checkout | — | **NOT RUN** (no credentials; real charges) |
| M4-EMU | Emulator cart/checkout UI | — | **NOT RUN** |
| M3-TSC | `npm run typecheck` in `@workspace/mobile` | Cloud agent | **PASS** |
| M3-UNIT | `sellValidation` + `listingsQuery` unit tests | Cloud agent | **PASS** (10/10) |
| M3-POLICY | `nativePolicy.test.js` Photo Picker + blocked READ_MEDIA_* | Cloud agent | **PASS** (3/3) |
| M3-API | Live auth gates: POST listings / request-url → 401; categories 200 | `flexamarket.com` | **PASS** |
| M3-E2E-AUTH | Authenticated create listing + Wasabi upload | — | **NOT RUN** (no test credentials) |
| M3-EMU | Android emulator Sell UI | — | **NOT RUN** |
| M2-TSC | `npm run typecheck` in `@workspace/mobile` | Cloud agent | **PASS** |
| M2-UNIT | `listingsQuery` / country normalize unit tests | Cloud agent | **PASS** (6/6) |
| M2-API | Live smoke: categories, listings Haiti/HT, fashion, q, detail, detect-country, login reject | `flexamarket.com` | **PASS** (see `ANDROID_PHASE2_MILESTONE2.md`) |
| DOC-FETCH | HTTP fetch of official Android/Play/Expo/RN pages | Cloud agent network | **PARTIAL PASS** — see failures below |
| STATIC-WV | Ripgrep inventory of WebView usage in `artifacts/mobile` | Repo checkout | **PASS** — entry now expo-router; shell quarantined |
| STATIC-ROUTES | Inventory of marketplace `Route path=` entries | Repo checkout | **PASS** — inventory written |
| STATIC-PAY | Review `androidDigitalPurchaseGuard` + purchase policy doc | Repo checkout | **PASS** — digital initiation blocked by design |
| EMU | Android Emulator migration tests | — | **NOT RUN** |
| DEVICE | Real device tests | — | **NOT RUN** |
| E2E | Detox/Maestro/native E2E | — | **NOT RUN** |
| AAB | Release bundle install test | — | **NOT RUN** |

## 2. CURRENT POSITION

Milestone 5 unit + API smoke + typecheck: **EXECUTED**.  
FCM device delivery / authenticated chat E2E: **NOT RUN**.  
Device / emulator UI verification: **NOT RUN**.  
Audit verification: **VERIFIED COMPLETE**.

## 3. REMAINING WORK

Full Phase 5 matrix after implementation waves:

- Every screen / button / navigation path  
- Auth, physical checkout, digital Billing or block  
- Uploads, video playback, background music  
- Push notifications cold/warm start  
- Country + language  
- Admin permission negative tests  
- Android Back + gesture navigation  
- Network loss / API 5xx recovery  
- Crash-free smoke on API 24–36 devices  

## 4. TEST RESULTS — documentation fetches

| URL | HTTP | Notes |
|---|---|---|
| developer.android.com/docs/quality-guidelines/core-app-quality | 200 | OK |
| developer.android.com/privacy-and-security | 404 | Use /security instead |
| developer.android.com/security | 200 | OK |
| developer.android.com/privacy-and-security/security-tips | 200 | OK |
| developer.android.com/google/play/billing | 200 | OK |
| developer.android.com/guide/app-bundle | 200 | OK |
| developer.android.com/google/play/requirements/target-sdk | 200 | OK |
| play.google.com/about/developer-content-policy/ | 200 | OK |
| support…/answer/9899034 (Spam) | 200 | Webviews & Affiliate Spam section present |
| support…/answer/9898783 (Functionality) | 200 | OK |
| support…/answer/9858738 (Payments) | 200 | OK |
| support…/answer/10281818 (Payments FAQ) | 200 (retry) | OK |
| support…/answer/9893335 (Families) | 200 | Mere webview language present |
| docs.expo.dev/workflow/overview/ | 200 | OK |
| docs.expo.dev/submit/android/ | 200 | OK |
| reactnative.dev/docs/getting-started | 200 | OK |
| reactnative.dev/docs/security | 200 | OK |
| Play Console Data Safety UI | N/A | Requires human Console login |

## 5. BLOCKERS

- No emulator/device allocated for migration E2E in this audit phase.  
- Play Console–only declarations cannot be auto-verified here.

## 6. NEXT ACTION

After Phase 2 scaffold: add automated smoke (app launches, login API, home listings render) on emulator CI.

## 7. COMPLIANCE STATUS

No compliance claim of “Play-ready.” Risks documented in `ANDROID_COMPLIANCE_CHECKLIST.md`.

## 8. SOURCE REFERENCES

Same as checklist; test table above.

---

## 9. Audit extension doc fetches (2026-11-09)

| URL | Result |
|---|---|
| developer.android.com/training/data-storage/shared/photopicker | 200 |
| developer.android.com/training/permissions/requesting | 200 |
| support…/answer/15800983 (Photo & Video Permissions) | 200 |
| support…/answer/9899234 (Enforcement Process) | 200 |
| support…/answer/9899142 (Violations & Appeals) | 200 |
| support…/answer/9858738 (Payments) | 200 |
| support…/answer/10281818 (Payments FAQ) | Timeout this session — use prior cache / retry |
| developer.android.com/guide/topics/media/media-controls | 200 |
| developer.android.com/develop/ui/views/layout/edge-to-edge | 200 |
| developer.android.com/guide/navigation/custom-back/predictive-back-gesture | 200 |
| support…/answer/13392821 (FGS) | 200 |

**Not executed:** any emulator/device test from `ANDROID_NAVIGATION_TEST_PLAN.md`.
