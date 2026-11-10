# Phase 3T — Generate Android test APK (EAS preview)

**Branch:** `cursor/native-phase3t-eas-apk-09ff`  
**Base:** Phase 3S / PR #197  
**Safety:** No Play submit · no production deploy · no DigitalOcean mutate

## Goal

Produce a real installable Android **APK** for package `com.flexa.market` via Expo EAS cloud build (`preview` profile).

## Configuration verified (this run)

| Item | Value |
|------|--------|
| Expo owner / slug | `muelsa89` / `mobile` |
| EAS projectId | `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e` |
| Android package | `com.flexa.market` |
| versionName / versionCode | `1.0.1` / `39` (unchanged) |
| `eas.json` → `preview.android.buildType` | **`apk`** |
| `preview` env | `EXPO_PUBLIC_DOMAIN=flexamarket.com` |
| `google-services.json` package | `com.flexa.market` (matches app.json) |
| EAS CLI | installed (`eas-cli` via npx) |
| Auth | **`eas whoami` → Not logged in** · `EXPO_TOKEN` **missing** |

## Build status (honest)

| Field | Status |
|-------|--------|
| EAS build started | **No** |
| Build ID | **none** |
| Build URL | **none** |
| APK download link | **none** |
| Blocker | Owner must add secret **`EXPO_TOKEN`** (Expo access token for `muelsa89`). Do not paste token in chat. |

Evidence: `npx eas-cli build --platform android --profile preview --non-interactive` cannot authenticate without `EXPO_TOKEN`.

## Command to run after auth

```bash
cd artifacts/mobile
export EXPO_TOKEN=…   # from environment secret — never commit
npx eas-cli whoami
npx eas-cli build --platform android --profile preview --non-interactive --no-wait=false
```

Do **not** pass `--auto-submit`. Do **not** use `production` profile (AAB / Play).

## After successful build — record here

- Build ID:
- Build URL:
- APK URL:
- Commit SHA that was built:

## Physical Android testing checklist (post-install)

Use a real device with the preview APK. Check off only with observed evidence (screenshot / message ID / log).

| # | Journey | Pass? | Evidence |
|---|---------|-------|----------|
| 1 | Cold start + native Home (no WebView marketplace) | | |
| 2 | Signup | | |
| 3 | Login (email) | | |
| 4 | Phone OTP login | | |
| 5 | Password recovery | | |
| 6 | FCM: grant permission → token registered → push received | | |
| 7 | Android back + tab navigation | | |
| 8 | Seller create listing + photo upload | | |
| 9 | Listing / promo video upload | | |
| 10 | Home promo feed ≤2 + scroll audio hard-stop | | |
| 11 | Checkout (wallet and/or Stripe physical goods) | | |
| 12 | Order tracking + Haiti PIN (buyer) | | |
| 13 | Seller ship + label | | |
| 14 | Support chat / ticket | | |
| 15 | Admin / super-admin gates (if test account) | | |
| 16 | Flexa Music background playback | | |
| 17 | Size/color (`itemSize`) save | | |
| 18 | Website opens external browser only | | |

**Do not** mark FCM or OTP verified from emulator-only or checklist toggles alone.
