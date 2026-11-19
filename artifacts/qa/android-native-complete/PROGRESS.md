# Android native complete — progress

- **PR:** https://github.com/sammyjeanlouis8-max/Flexa-market/pull/258
- **Start SHA:** `d19ce179a3302f9730cd3e899a9a9923b7a5e4bd`
- **Branch tip:** see latest on `cursor/android-native-complete-d484`
- **Package:** `com.flexamarket.app`

## Builds
| Artifact | Status | Link / path |
|----------|--------|-------------|
| EAS preview APK | IN_QUEUE | https://expo.dev/accounts/muelsa89/projects/mobile/builds/2b595ebe-9784-40f9-b9ef-ed0061de96f5 |
| Local release APK (embedded JS, debug-signed) | Built | `/opt/cursor/artifacts/flexa-android-native-complete-release.apk` (72MB) |
| versionCode | app.json floor 64; EAS remote showed 53 on queued build | |

## Device testing blocker
Cloud VM emulator has **no KVM** (`/dev/kvm` unavailable). Emulator boots but **System UI ANR** / black screen — cannot complete interactive role matrix or native screenshot pairs on this host.

**Next:** install EAS preview APK (or local release APK) on a physical device / KVM-capable emulator, then capture WebView\|native pairs into `artifacts/qa/android-native-complete/`.

## WebView refs (guest) ready
`webview-refs/` — home, login, search, listing detail.

## Release channel
**Awaiting confirmation** before Play submit. `eas.json` submit track = `internal`.
