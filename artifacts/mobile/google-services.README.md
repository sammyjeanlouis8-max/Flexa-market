# Firebase Android config

`google-services.json` in this folder historically targets **`com.flexa.market`** (suspended package).

Phase 2 Android package is **`com.flexamarket.app`**.

Until a new Firebase Android app is created for `com.flexamarket.app` and a matching `google-services.json` is supplied:

1. `app.json` does **not** reference `googleServicesFile` (avoids package mismatch builds).
2. FCM / Expo push on Android for the new package will not work.
3. Do not publish an AAB without the correct Firebase file and Sammy approval.

iOS push / `GoogleService-Info.plist` (if any) must remain unchanged with bundle `com.flexamarket.mobile`.
