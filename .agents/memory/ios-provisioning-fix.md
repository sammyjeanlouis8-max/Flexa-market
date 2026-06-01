---
name: iOS build provisioning + expo-notifications
description: expo-notifications auto-adds aps-environment; must stay in package.json; use entitlements override to block
---

## Rule
Keep `expo-notifications` in `artifacts/mobile/package.json` (removing it breaks Android Gradle builds).
Block `aps-environment` entitlement by adding `"entitlements": {}` under `ios` in `app.json`.

## Why
- Removing expo-notifications from package.json causes Android Gradle to fail with `EAS_BUILD_UNKNOWN_GRADLE_ERROR` (the package is a transitive dep for Android native code)
- expo-notifications presence (even without plugin entry) causes Expo prebuild to auto-add `aps-environment` to iOS entitlements
- The EAS-managed provisioning profile created 2026-05-26 does NOT include Push Notifications capability
- The `entitlements: {}` override in app.json prevents expo-notifications from injecting `aps-environment`

## How to apply
In `app.json` under `expo.ios`:
```json
"ios": {
  "entitlements": {},
  ...
}
```
The usePushNotifications hook is stubbed to no-op (hooks/usePushNotifications.ts).
Push notifications can be re-enabled later by regenerating the provisioning profile with Push Notifications capability via `eas credentials`.
