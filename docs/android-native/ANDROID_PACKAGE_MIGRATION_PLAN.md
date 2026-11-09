# ANDROID_PACKAGE_MIGRATION_PLAN.md

**Status:** Proposal only — **package name NOT changed in code**  
**Date:** 2026-11-09 (America/New_York)  
**Constraint:** Keep iOS, website, backend, DB, DO, Wasabi unchanged.

---

## 1. Current identifiers (audited)

| Platform | Identifier | Location |
|---|---|---|
| Android (current / suspended lineage) | `com.flexa.market` | `artifacts/mobile/app.json` → `expo.android.package` |
| Android versionCode | `39` (as of audit) | `app.json` |
| iOS (DO NOT CHANGE) | `com.flexamarket.mobile` | `app.json` → `expo.ios.bundleIdentifier` |
| URL scheme | `flexamarket` | `app.json` → `scheme` |
| Firebase Android client | package `com.flexa.market` | `artifacts/mobile/google-services.json` |
| EAS project | `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e` | `app.json` / `eas.json` |

**Conflict check:** Proposed name must not equal `com.flexa.market` or `com.flexamarket.mobile`.

---

## 2. Proposed new Android package name

### Primary recommendation
**`com.flexamarket.app`**

### Why this name
- Clear brand ownership (`flexamarket`) without reusing the suspended package (`com.flexa.market`).
- Distinct from iOS (`com.flexamarket.mobile`) — reverse-DNS family is fine; packages differ.
- Short, professional, conventional for a consumer storefront app.
- No collision with current Expo/iOS identifiers in-repo.

### Alternates (if Play/Firebase claim fails)
1. `com.flexamarket.android`
2. `com.flexamarket.shop`

**Do not implement any of these until Sammy explicitly authorizes the change.**

---

## 3. Google Play enforcement — package rename is NOT a bypass

### Official sources (accessed this update)
- Enforcement Process: https://support.google.com/googleplay/android-developer/answer/9899234  
- Managing Policy Violations and Appeals: https://support.google.com/googleplay/android-developer/answer/9899142  
- Spam (Webviews & Affiliate Spam): https://support.google.com/googleplay/android-developer/answer/9899034  
- Developer Policy Center: https://play.google.com/about/developer-content-policy/

### Verified policy themes (not invented)
From **Enforcement Process** (live page):
- Removals/suspensions affect the app (and prior versions); multiple removals may escalate.
- **Do not attempt to republish a removed app until all policy violations are fixed.**
- Repeated or serious violations can terminate individual or **related** developer accounts.

### Compliance interpretation for Flexa Market
| Claim | Status |
|---|---|
| New package automatically clears prior suspension | **FALSE / unverified as a remedy** — treat as **not** a cure |
| New package alone guarantees approval | **FALSE** |
| Must fix root policy issues (mere WebView, payments, UGC, etc.) | **REQUIRED** |
| May create related-account / repeat-violation risk if submitting a clone WebView under a new package without remediation | **HIGH RISK** — avoid |

**Mandatory approach:** Ship a **genuine native** app that fixes the cited issues, document remediation for Play review, use appeals/process where applicable.  
**Forbidden approach:** Repackage the same WebView shell under a new application ID to evade enforcement.

*Unverified in this environment:* Exact Play Console notice text for the prior Flexa suspension (requires Console access). Attach that notice to the compliance file when available.

---

## 4. Required configuration changes (when authorized)

| Area | Change | Touches production? |
|---|---|---|
| `artifacts/mobile/app.json` | `android.package` → `com.flexamarket.app`; reset/bump `versionCode` for new listing | No (mobile config) |
| `google-services.json` | Register **new** Firebase Android app for `com.flexamarket.app`; download new JSON | Firebase project config |
| FCM / Expo push | New FCM credentials for new package; re-register device tokens | Backend token table grows; old tokens obsolete |
| EAS credentials | New Android keystore / Play App Signing for **new** Play listing | Expo/Play only |
| Play Console | **New** application listing (new package ≠ update of suspended app) | Play only |
| Deep links / App Links | Update intent filters / Digital Asset Links for new package; keep `flexamarket://` scheme if desired | Website `.well-known` may need new package fingerprint |
| OAuth (Google etc.) | If used: add Android OAuth client for new package + SHA-1 | Cloud console |
| Stripe / payment return URLs | Usually https website — **no change** if checkout remains web/Custom Tabs | Prefer none |
| iOS bundle id | **Unchanged** `com.flexamarket.mobile` | — |
| Website / API / Postgres / DO / Wasabi | **Unchanged** | — |
| UA marker | Keep `FlexaMarketAndroid/…` semantics; optional version bump | API guard remains |

### Explicit non-changes
- Do not rewrite backend business logic for package rename.
- Do not migrate user/order/media data.
- Do not change iOS native project package/bundle for this Android effort.

---

## 5. Deep links & scheme

| Item | Plan |
|---|---|
| Custom scheme `flexamarket://` | Can remain; both apps can theoretically register (prefer Android App Links with package-specific verification) |
| HTTPS App Links (`flexamarket.com`) | Add/replace `assetlinks.json` entries for **new** package signing cert |
| Push deep links | Continue opening native routes (not WebView) after migration |

---

## 6. Verification checklist (pre-submit)

1. `app.json` package = approved name; iOS bundle untouched.  
2. `google-services.json` `package_name` matches.  
3. EAS build AAB `applicationId` matches (`aapt dump badging`).  
4. FCM test notification to a device on the new app.  
5. Login + API calls succeed.  
6. Play listing is a **new** app with remediation notes; not a silent republish of the suspended binary.  
7. Legal/compliance review of prior suspension notice completed by Sammy.

---

## 7. Status

| Item | Status |
|---|---|
| Proposal | **READY FOR REVIEW** |
| Code change | **NOT STARTED** (blocked on approval) |
| Play Console new listing | **NOT STARTED** |
| Firebase new Android app | **NOT STARTED** |
