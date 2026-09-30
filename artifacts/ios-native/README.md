# Flexa Market — Native iOS App

100% pure Swift WKWebView shell loading `https://flexamarket.com`.  
Zero React Native, zero npm, zero Expo — just ~300 lines of Swift.

## Features
- Full-screen WKWebView (flexamarket.com)
- Swipe back / forward gesture
- Loading spinner on first load
- Offline screen with "Eseye ankò" retry button (Haitian Creole)
- Push notifications (APNs) injected into the web page
- Stripe, camera, photo picker all work natively inside WKWebView
- Durable background file uploads through `URLSession` background upload tasks

---

## How to build and push to TestFlight

### One-time setup — GitHub Secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Keep the three existing App Store Connect API secrets, and add the two signing
secrets below. Never commit the `.p12` file or its password, and do not send
either in chat.

| Secret name     | Value |
|-----------------|-------|
| `ASC_KEY_ID` | Existing App Store Connect API key ID |
| `ASC_ISSUER_ID` | Existing App Store Connect issuer ID |
| `ASC_KEY_P8` | Existing App Store Connect API private key |
| `IOS_SIGNING_P12_BASE64` | Base64 encoding of an **active** Apple Distribution `.p12` with its private key |
| `IOS_SIGNING_P12_PASSWORD` | Password that opens that `.p12` |

On a Mac, copy the base64 value from a local `.p12` without printing it in the
terminal: `base64 -i /path/to/certificate.p12 | tr -d '\n' | pbcopy`. Paste
directly into the GitHub secret field. Use the actual path to your file; do not
upload it to the repository. If the certificate has been revoked, this release
lane fails rather than creating or revoking another certificate.

### Trigger a build

1. Go to GitHub repo → **Actions** tab
2. Click the existing **iOS Native — Build & TestFlight** workflow
3. Click **"Run workflow"**, choose the `agent/ios-legacy-1-0-1-20260930`
   branch, then run it. Never run this legacy release from `main`.
4. Wait ~15–20 minutes
5. Confirm **Flexa Market 1.0.1 (97)** appears in TestFlight under
   `com.flexamarket.mobile` after Apple finishes processing. App Store
   submission is a separate step.

---

## Project structure

```
artifacts/ios-native/
├── project.yml                  # xcodegen config → generates .xcodeproj
├── ExportOptions.plist          # tells Xcode to upload directly to TestFlight
├── Assets.xcassets/
│   ├── AppIcon.appiconset/      # icon-1024.png copied from mobile project at build time
│   └── LaunchBackground.colorset/
└── Sources/
    ├── App.swift                # @main AppDelegate, push token forwarding
    ├── SceneDelegate.swift      # Scene lifecycle
    ├── WebViewController.swift  # WKWebView, offline screen, push injection
    ├── BackgroundUploadManager.swift # Keychain-backed staged upload transport
    ├── NotificationDelegate.swift
    └── Info.plist
```

## App credentials
- Bundle ID: `com.flexamarket.mobile` (legacy Apple listing)
- Release version/build: `1.0.1 (97)`
- Team ID: `D782MM56VY`
- Provisioning profile: selected for the reusable `.p12` identity by Fastlane

## Background upload bridge

The standalone shell exposes `window.__flexaBackgroundUploadsV1 = true` only
inside the trusted `https://flexamarket.com` main frame. The marketplace can
send `{type:"flexa-upload", requestId, action, ...}` through
`window.webkit.messageHandlers.flexaUpload.postMessage(payload)`. Native
responses are dispatched as the `flexa-upload-result` custom event.

`begin` accepts only the fixed production upload API
`https://flexamarket.com/api/storage/uploads`, UUID job/session IDs, and 8 MiB
chunk geometry. The token is stored in the Keychain, incoming base64 staging
segments are written to Application Support, and URLSession uploads raw 8 MiB
files sequentially. Jobs survive app termination; transient failures back off
up to five times, while 401/403 failures remain visible as `failed` for an
explicit later `begin` (which refreshes the Keychain token after checking
immutable upload metadata) plus `start`. A repeated `start` is idempotent for
active/completed work; cancelled work is never restarted automatically. Retry
tasks use `earliestBeginDate`, not an in-process timer. Completed and cancelled
uploads remove staged files and credentials. Incomplete staging expires after
24 hours.

This environment cannot run Xcode or an iOS simulator, so the Swift transport
has not been locally compiled here. `project.yml` includes all of `Sources`,
so `BackgroundUploadManager.swift` is included when the Xcode project is
generated. Validate a release build/device background handoff in Xcode before
shipping.
