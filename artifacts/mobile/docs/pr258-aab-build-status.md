# PR #258 — Signed AAB build status

**Date:** 2026-11-19 (America/New_York)  
**Package:** `com.flexamarket.app`  
**versionName:** `1.0.1`  
**Target versionCode:** **66** (EAS remote set to 65; production `autoIncrement` → next build **66**)  
**Commit (tip):** `87ef0c018805657b5b43b9bf17411945ac9d2ee6`

## Preview APK investigation

| Build | Commit | versionCode | Status | Usable for device test? |
|-------|--------|-------------|---------|-------------------------|
| `5c113660…` | `a7329e26` | 53 | **canceled** | No — never produced an artifact |
| `1ba8c254…` | `1822b8de` | 53 | in queue (earlier tip; missing later docs/CI fix) | Only if finished; **not** tip commit |
| Tip AAB (this doc) | `87ef0c01` | 66 (planned) | building | Release candidate |

CI failure on earlier tips: `release-preflight` required `runtimeVersion.policy === "appVersion"` while EAS bare workflow needs a string. Fixed in `87ef0c01` to accept matching version string.

## Device / 84-screen matrix

- Local emulator `emulator-5554` (API 34, `-accel off`, swiftshader): **System UI ANR** — UI not interactive; eSIM navigation **UNTESTABLE** on device in this environment.
- No cloud/physical Android device available in this agent VM.
- Code-level wiring verified by unit tests (`notificationDeepLink`, eSIM drawer → `/esim`, payment guard default-ON).
- Screens not exercised on a live Android UI for this tip: **all 84** marked **UNTESTED_ON_DEVICE** (emulator ANR). Prior inventory remains code-complete: 81 complete / 3 verified-disabled.

## Play Console

- Highest versionCode verified from EAS history: **53**
- Local/native previously tracked **64**; remote bumped to **65** before this AAB
- Play Console UI not accessible here — **Play Console confirmation pending**
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` / `google-play-key.json`: **missing** → Internal track submit pending manual upload

## Deliverables

- EAS production AAB link + direct `.aab` URL (filled after build finishes)
- Submission: pending credentials
