# PR #258 — Signed AAB build status

**Date:** 2026-11-19 (America/New_York)  
**Package:** `com.flexamarket.app`  
**versionName:** `1.0.1`  
**versionCode:** **66** (EAS remote was 65; production `autoIncrement` → **66**)  
**Commit:** `aef3e56644c71e9c896f7252b88ca95c27ee6f28`  
**EAS build:** https://expo.dev/accounts/muelsa89/projects/mobile/builds/983993f0-ef91-413f-b0a3-be357fd3fd5f

## Preview APK investigation

| Build | Commit | versionCode | Status | Usable for device test? |
|-------|--------|-------------|---------|-------------------------|
| `5c113660…` | `a7329e26` | 53 | **canceled** | No — never produced an artifact |
| `1ba8c254…` | `1822b8de` | 53 | queued/earlier tip | Not tip; missing later CI/docs commits |
| `983993f0…` (AAB) | `aef3e566` | **66** | building | Release candidate |

CI failure on earlier tips: `release-preflight` required `runtimeVersion.policy === "appVersion"` while EAS bare workflow needs a string. Fixed in `87ef0c01` to accept matching version string.

## Device / 84-screen matrix

- Local emulator `emulator-5554` (API 34, `-accel off`, swiftshader): **System UI ANR** — UI not interactive; eSIM navigation **UNTESTABLE** on device in this environment ([Android emulator eSIM smoke](bc-074045cb-48cf-59f4-8bac-c5f6dda1f63d)).
- No cloud/physical Android device available in this agent VM.
- Code-level wiring verified by unit tests (`notificationDeepLink`, eSIM drawer → `/esim`, payment guard default-ON).
- Screens not exercised on a live Android UI for this tip: **all 84** marked **UNTESTED_ON_DEVICE** (emulator ANR). Prior inventory remains code-complete: 81 complete / 3 verified-disabled (subscription, boost, wallet top-up).

## Play Console

- Highest versionCode verified from EAS history: **53**
- Remote bumped to **65** then auto-incremented to **66** for this AAB
- Play Console UI not accessible here — **Play Console confirmation pending**
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` / `google-play-key.json`: **missing** → Internal track submit pending manual upload

## Deliverables

- EAS: https://expo.dev/accounts/muelsa89/projects/mobile/builds/983993f0-ef91-413f-b0a3-be357fd3fd5f
- Direct `.aab` URL: _(pending build finish)_
- Submission: pending credentials
