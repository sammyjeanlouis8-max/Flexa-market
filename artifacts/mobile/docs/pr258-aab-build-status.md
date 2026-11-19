# PR #258 — Signed AAB ready

**The new signed AAB is ready.**

| Field | Value |
|-------|--------|
| Package | `com.flexamarket.app` |
| versionName | `1.0.1` |
| versionCode | **66** |
| Commit | `761063a356bbca89342008938f9dcc197ab90b23` |
| EAS | https://expo.dev/accounts/muelsa89/projects/mobile/builds/c1cb2394-fef9-4b5e-a855-6a3679e52a4e |
| Direct `.aab` | https://expo.dev/artifacts/eas/VXcv72AXFjHSdbqcUcn6jCEpbMoUlo28OqwrodyhalA.aab |

## Notes
- Prior build `983993f0` failed (Install dependencies / over-aggressive `.easignore`); this rebuild includes the workspace-package fix.
- Google Play Internal submit **pending** — `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` / `google-play-key.json` not available in this environment.
- Device 84-screen matrix still **UNTESTED_ON_DEVICE** (emulator System UI ANR).
