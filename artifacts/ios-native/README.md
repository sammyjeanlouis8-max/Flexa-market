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

---

## How to build and push to TestFlight

### One-time setup — GitHub Secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these 3 secrets:

| Secret name     | Value |
|-----------------|-------|
| `ASC_KEY_ID`    | `JR8LBAM37G` |
| `ASC_ISSUER_ID` | Find it at [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API → copy the **Issuer ID** shown at the top |
| `ASC_KEY_P8`    | The full contents of `AuthKey_JR8LBAM37G.p8` (the file that starts with `-----BEGIN PRIVATE KEY-----`) |

### Trigger a build

1. Go to GitHub repo → **Actions** tab
2. Click **"iOS Native — Build & TestFlight"**
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait ~15–20 minutes
5. Build appears in TestFlight automatically

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
    ├── NotificationDelegate.swift
    └── Info.plist
```

## App credentials
- Bundle ID: `com.flexamarket.mobile`
- Team ID: `D782MM56VY`
- ASC App ID: `6754947270`
- Provisioning profile: managed automatically by Xcode (automatic signing)
