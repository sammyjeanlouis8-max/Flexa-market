# ANDROID_RELEASE_CHECKLIST.md

**Status:** Template prepared — all release items **NOT STARTED** until native migration + Sammy publish approval.

Do **not** generate/submit a production AAB until validation gates pass.

---

## 1. COMPLETED WORK

- Captured current Expo/EAS release configuration from repo (`app.json`, `eas.json`, `docs/android-purchase-policy.md`).
- Linked compliance gates to Phase 0 research.

## 2. CURRENT POSITION

Release readiness: **NOT STARTED** (audit/docs only).

## 3. Pre-build gates

| Gate | Status | Notes |
|---|---|---|
| Sammy approval of architecture | PENDING | Required |
| Native shell no longer WebView-primary | NOT STARTED | Spam/Functionality risk |
| Core buyer journeys tested on device | NOT STARTED | |
| Digital goods: Play Billing **or** explicit block UX | PARTIAL | Server block exists; native UX TBD |
| Account deletion in-app | NOT STARTED | API exists on web |
| Report/block UGC in-app | NOT STARTED | API exists |
| Permissions deny/recover tested | NOT STARTED | |
| Target SDK matches Play schedule | CONFIG PRESENT (36) | Re-verify merged manifest |
| Privacy policy + Data Safety updated | NOT STARTED | Console |
| Store listing matches binary | NOT STARTED | |
| No secrets in binary | ONGOING | Wasabi/Stripe secrets server-side |

## 4. Build & signing

| Step | Status |
|---|---|
| Increment `version` / `versionCode` | NOT STARTED |
| EAS production profile `app-bundle` | Config ready |
| Play App Signing | Remote credentials (verify in Console) |
| Proguard/R8 mapping retained | Config enables minify — verify |
| Internal testing track upload | NOT STARTED |
| Production track | **Blocked without explicit approval** |

## 5. Play Console package

| Item | Status |
|---|---|
| Data Safety form | NOT VERIFIED HERE |
| App content / UGC declarations | NOT VERIFIED HERE |
| Ads declaration | NOT VERIFIED HERE |
| Target audience / Families | NOT VERIFIED HERE |
| News/financial if applicable | N/A unless claimed |
| Reviewer credentials | Prepare before submit |
| Account deletion URL | Must match live behavior |

## 6. REMAINING WORK

Execute gates above after Waves W0–W8 minimum; then internal track; then Sammy go/no-go for production.

## 7. TEST RESULTS

None for release candidate — see `ANDROID_TEST_RESULTS.md`.

## 8. BLOCKERS

- Approval gate  
- Native implementation incomplete  
- Console access outside this agent environment  

## 9. NEXT ACTION

Keep this checklist updated at the end of each implementation wave; do not mark READY until device evidence attached.

## 10. COMPLIANCE STATUS

**Not Play-ready.** Historical WebView/affiliate-spam risk is the top blocker to resolve architecturally.

## 11. SOURCE REFERENCES

- https://developer.android.com/guide/app-bundle  
- https://developer.android.com/google/play/requirements/target-sdk  
- https://docs.expo.dev/submit/android/  
- https://support.google.com/googleplay/android-developer/answer/9899034  
- https://support.google.com/googleplay/android-developer/answer/9858738  
- https://support.google.com/googleplay/android-developer/answer/9899234  
- https://support.google.com/googleplay/android-developer/answer/15800983  
- In-repo: `docs/android-purchase-policy.md`  
- In-repo: `docs/android-native/ANDROID_PACKAGE_MIGRATION_PLAN.md`

## 12. New package release gate (audit extension)

| Gate | Status |
|---|---|
| Sammy approves `com.flexamarket.app` | PENDING |
| Firebase Android app created for new package | NOT STARTED |
| New Play Console application (not silent republish of suspended app) | NOT STARTED |
| Remediation narrative vs prior suspension | NOT STARTED |
| iOS bundle left as `com.flexamarket.mobile` | REQUIRED |
| Website/API/DB unchanged by package cutover | REQUIRED |
