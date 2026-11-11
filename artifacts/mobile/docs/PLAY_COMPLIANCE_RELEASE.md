# Google Play compliance release — `com.flexa.market`

**Branch:** `cursor/play-compliance-aab-09ff`  
**Package:** `com.flexa.market` (unchanged — do **not** bypass enforcement with a new package)  
**versionName / versionCode:** `1.0.1` / **40**  
**Target SDK:** 36  
**Do not submit or publish from this agent without explicit owner authorization.**

## 1) Enforcement notice & release path

| Item | Status |
|------|--------|
| Exact Play removal / appeal decision text in-repo | **Missing / pending evidence** — notice text not present in the repository or this agent VM |
| Policy cited by Google | **Pending evidence** (owner must paste Console notice) |
| Package strategy | **Keep `com.flexa.market`** — a new package ID is not used to bypass enforcement |
| Compliant update on existing listing | **Pending Console confirmation** — after technical fixes, owner verifies whether Console allows a replacement AAB on the suspended/restricted listing before any new listing |

Owner action: open Play Console → Policy status / Appeals for `com.flexa.market` → export the exact notice + cited policy section into this doc before resubmit.

## 2) Android experience (native)

Primary marketplace flows remain Expo Router native screens (not a website shell): home browse/search, auth, listing detail, cart, Stripe physical checkout via system browser, orders, chat, support, sell, wallet (non-top-up), admin desks.

`website` route intentionally opens the public site in the platform browser for external navigation only.

**Device smoke of empty/loading/offline/error:** **pending evidence** until a signed AAB/APK is installed on a physical device (blocked in this session by missing `EXPO_TOKEN` injection).

## 3) Photo & video permissions (fixed in this release)

| Change | Evidence |
|--------|----------|
| System picker helper | `lib/systemMediaPicker.ts` — `launchImageLibraryAsync` with `legacy:false`; **never** calls `requestMediaLibraryPermissionsAsync` |
| Call sites migrated | sell, edit-listing, edit-profile, KYC, chat, support, music cover, boost draft video, admin TV CMS |
| Manifest removals | `READ_MEDIA_IMAGES/VIDEO`, legacy storage, unused `CAMERA`, unused location, `SYSTEM_ALERT_WINDOW` via `tools:node="remove"` |
| Runtime mic | Chat voice still requests mic **only** when recording starts |

Automated: `tests/playComplianceRelease.test.js`, `scripts/release-preflight.mjs`.

## 4) Payment path treatment

| Flow | Treatment | Play Billing? | Status |
|------|-----------|---------------|--------|
| Physical goods Stripe / BNPL / cart checkout | Allowed (hosted browser / existing providers) | Not required | **Verified** (code + prior native phases) |
| Wallet balance / history / redeem / P2P transfer | Allowed | N/A | **Verified** |
| Wallet top-up / Card FM | Disabled UI + server `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE` | Required if re-enabled | **Verified disabled** |
| Subscriptions purchase / portal restore | Purchase UI blocked; cancel-at-period-end allowed | Required if re-enabled | **Verified disabled** |
| Paid boosts / Advantage+ launch | Drafts only; launch blocked client+server | Required if re-enabled | **Verified disabled** |
| Music buy / artist plans | No purchase CTAs; API blocked | Required if re-enabled | **Verified disabled** |
| eSIM | Honest blocked shell; no catalog/checkout | Would require policy review | **Verified disabled** |
| Deep link / chat / WebView digital checkout | Server UA guard + native markers | — | **Verified** (middleware); **pending** physical deep-link proof |

No Play Billing SDK is shipped in this release. Digital goods stay unavailable rather than routed off-Play.

## 5) UGC, privacy, safety

| Requirement | Status |
|-------------|--------|
| Terms / EULA acceptance at login/register/phone | **Verified** (code) |
| In-app user block + report (chat) | **Verified** |
| In-app listing report (counterfeit/IP/prohibited/spam) | **Verified** (added this release) |
| Moderator queues (reports / moderation / appeals) | **Verified** (admin native) |
| Account deletion in-app | **Verified** (`/delete-account`) |
| Public web deletion URL | **Verified** (`https://flexamarket.com/delete-account`) |
| Privacy policy / Data Safety parity | **Pending evidence** — owner must align Console Data Safety with SDKs (Expo, Firebase Messaging, Stripe browser checkout, analytics if any) |
| Restricted / counterfeit / IP handling | Report reasons + admin tools **Verified**; enforcement ops **pending** owner process |

## 6) Play Console checklist (owner)

- [ ] Confirm whether existing listing accepts a compliant update (vs. permanent removal)
- [ ] Deactivate / replace noncompliant bundles on all tracks (internal/closed/open/production)
- [ ] Upload AAB versionCode **≥ 40**, package `com.flexa.market`
- [ ] Content rating questionnaire current
- [ ] Target audience / Families policy (if applicable — default adult marketplace: document N/A)
- [ ] Ads declaration
- [ ] Data Safety form
- [ ] Store listing, screenshots, feature graphic
- [ ] Reviewer login instructions
- [ ] Trader status / EU DSA declaration if still pending
- [ ] Photo & Video Permissions declaration: **not** requesting broad access (picker only)
- [ ] Do **not** submit until enforcement path is confirmed

## 7) AAB build evidence (this session)

| Field | Value |
|-------|--------|
| `EXPO_TOKEN` in agent VM | **absent** (length 0) |
| `eas whoami` | Not logged in |
| Production command | `eas build --platform android --profile production --non-interactive` |
| Result | **Failed** — Expo account required / `Error: build command failed` |
| Build ID | **none** |
| AAB path / URL | **none — success not claimed** |
| Log | `/tmp/eas-production-aab-attempt.txt` on agent VM |

Fresh Cloud Agent session required after `EXPO_TOKEN` is bound to environment `70ee1718-d7ea-11f1-ba91-f63b1661ac50`.

## 8) Policy matrix (applicable vs N/A)

| Policy area | Verdict |
|-------------|---------|
| Photo & Video Permissions | **Verified** (code/manifest); device pick/cancel **pending** |
| Payments (digital goods) | **Verified** disabled without Play Billing |
| Payments (physical goods) | **Verified** allowed |
| User-generated content | **Verified** report/block/moderation entry points |
| Account deletion | **Verified** in-app + web |
| Data Safety / privacy disclosures | **Pending evidence** |
| Deceptive behavior / WebView shell | **Verified** primary UX is native Router |
| Device & network abuse | **Pending** physical device battery/FGS review |
| Families / Ads / Gambling / Crypto | **N/A** for shipped features (document if Console asks) |
| Enforcement appeal | **Pending evidence** (notice text missing here) |
