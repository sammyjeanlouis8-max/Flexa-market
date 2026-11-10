# Android Push — Real Device Test Plan

**Status:** Physical-device delivery is **NOT verified** by CI or this agent run.  
**Architecture under test:** Expo Notifications → Expo Push Token → `POST /api/push/expo-token` → Expo Push API → FCM (package `com.flexa.market`).

## Preconditions

1. Build a **preview or production** Android APK/AAB with EAS (`credentialsSource: remote`).
2. Confirm EAS project `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e` has **FCM V1** credentials configured in Expo (Google service account uploaded in EAS — never commit the JSON).
3. Confirm `google-services.json` in the binary matches Firebase project `flexa-market-8873a` / package `com.flexa.market`.
4. Use a **physical Android device** (emulators often cannot obtain FCM tokens).
5. Sign in with a real Flexa Market account.

## Cases

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Permission grant | Fresh install → sign in → allow notifications | Token registers; `/api/push/expo-token` 200 |
| 2 | Permission deny | Deny notifications | No crash; status shows permission denied; no token spam |
| 3 | Foreground | App open → trigger chat/order/admin test push | Banner/list/sound; tap opens correct native route |
| 4 | Background | App backgrounded → push | System tray; tap deep-links (chat/orders/wallet/tv/music/boosts/…) |
| 5 | Terminated | Force-stop app → push → open from tray | Cold-start `getLastNotificationResponseAsync` navigates correctly |
| 6 | Channel IDs | Inspect notification channel on device | `flexa-messages`, `orders`, `default`, `admin-broadcast`, `flexa-tv`, `system` exist |
| 7 | Logout cleanup | Sign out | `DELETE /api/push/expo-token` succeeds; further pushes not delivered to this install for that user |
| 8 | Account switch | User A → User B on same device | A’s device token removed; B receives pushes only |
| 9 | Token refresh | Clear app data / reinstall → sign in | New token upserted; old dead tokens pruned on send (`DeviceNotRegistered`) |
| 10 | Offline register | Airplane mode at login → reconnect | Retry eventually registers without crashing |
| 11 | Inbox sync | Push with `notificationId` → tap | In-app inbox marks that row read; **no duplicate local row** |
| 12 | Admin test | Admin `POST /api/push/test-expo` for userId | Device receives system-channel notification |

## How to trigger pushes safely

- Chat: send a Kominike message to the test user from another account.
- Orders: complete a sandbox/test order if available.
- Admin: authenticated admin `POST /api/push/test-expo` `{ "userId": <id> }`.

## Pass criteria

All 12 cases pass on at least one physical Android device on API 33+ and one on API 29–32 if possible.  
Until then, reports must say: **physical-device FCM delivery not verified**.

## External credentials checklist (do not commit)

- [ ] EAS FCM V1 service account linked to project `45ba4fe9-…`
- [ ] Firebase Android app `com.flexa.market` in `flexa-market-8873a`
- [ ] Matching `google-services.json` in the release binary
- [ ] No service-account JSON in git
