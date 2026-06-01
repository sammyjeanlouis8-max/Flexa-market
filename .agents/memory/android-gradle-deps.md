---
name: Android Gradle build deps
description: react-native-webview version requirement for SDK 54 Android builds
---

## Rule
`react-native-webview` must be `13.15.0` (not `13.12.5`) for Expo SDK 54.

## Why
SDK 54 expects react-native-webview@13.15.0. Using 13.12.5 causes Android Gradle builds to fail with `EAS_BUILD_UNKNOWN_GRADLE_ERROR`. This was discovered via `expo install --check` which flagged the version mismatch.

## How to apply
Before any EAS build, run:
```bash
cd artifacts/mobile && node_modules/.bin/expo install --check
```
Fix any outdated packages before building.

## EAS Build context
- Android preview APK `514af399` (2026-06-01) — first successful build after webview fix
- APK URL: https://expo.dev/artifacts/eas/b3e7cCCGL92ejB9AXMnoft.apk
