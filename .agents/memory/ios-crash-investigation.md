---
name: iOS TestFlight crash investigation
description: Persistent startup crash on iOS (builds 52-60+), Android works fine
---

## The Problem
Every iOS build crashes immediately on launch (before any UI renders).
Crash dialog: "Flexa Market a rencontré un problème"
Android (same codebase) works perfectly.

## What Was Tried (builds 52-60)

| Build | Change | Result |
|-------|--------|--------|
| 52 | Original | Crash |
| 53 | Fixed duplicate import in (tabs)/_layout.tsx | Crash |
| 54 | 100% WebView rewrite | Crash |
| 55 | Moved setNotificationHandler inside hook; removed aps-environment entitlement conflict; checkOnLaunch: NEVER | Crash |
| 56 | newArchEnabled: true | Crash |
| 57 | (upload failed) | N/A |
| 58 | Removed UIBackgroundModes:["audio"]; removed expo-router origin; simplified _layout.tsx (no fonts/GestureHandler/ErrorBoundary) | Crash |
| 59 | expo-updates: { enabled: false } | Crash |
| 60 | Removed expo-notifications, expo-image-picker, expo-location from plugins; ultra-minimal index.tsx | Pending |

## Key Observations
- Crash happens BEFORE any UI renders (home screen visible behind dialog)
- This means crash is in native module initialization (Obj-C/Swift), not JavaScript
- Android identical codebase works → iOS-specific native module issue

## Suspects (in order of likelihood)
1. expo-notifications — removed in build 60
2. expo-updates — disabled in build 59+
3. expo-router — still in build 60
4. Provisioning profile entitlement mismatch
5. react-native-webview iOS compatibility

## Build 62 — Definitive Final Build (Expo free plan exhausted after this)
- newArchEnabled: false (most likely JS-layer crash cause)
- aps-environment: production entitlement explicit
- expo-notifications plugin back (profile/binary match)
- expo-image-picker + expo-location plugins restored
- Full usePushNotifications hook + video camera bridge restored
- expo-updates: { enabled: false }
- No audio background mode, no expo-router origin
- Simplified _layout.tsx (no fonts/GestureHandler)

**Key insight discovered mid-session:** Splash screen showed on build 59 → crash is in JS layer,
not native module init. newArchEnabled: true (default in SDK 54) likely caused JS-layer instability.

## Next Steps If Build 62 Crashes
- Get actual crash log (user taps "Partager" → email to samueljeanlouis37@icloud.com)
- Try removing expo-router and using a plain RootLayout
- Check provisioning profile entitlements vs binary entitlements
- Consider downgrading to Expo SDK 53

## Critical Fix Applied
- `UIBackgroundModes: ["audio"]` was present → removed in build 58
  (declaring audio background mode without AVAudioSession setup can crash iOS)
- `origin: "https://flexamarket.com"` in expo-router removed in build 58
  (caused router to try external connection during init)
- `Notifications.setNotificationHandler` was at MODULE LEVEL (line 6) → moved inside hook
  (top-level native API calls before module init = iOS crash)

**Why:** Crash before any UI renders = Objective-C/Swift initialization code failing,
not JavaScript. Must isolate by removing native modules one by one.
