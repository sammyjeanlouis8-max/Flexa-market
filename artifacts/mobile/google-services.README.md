# Firebase Android config — `com.flexamarket.app`

## Status (Milestone 5)

| Item | Status |
|---|---|
| Existing Firebase project | `flexa-market-8873a` (reuse — do not create a second project) |
| Legacy Android app in `google-services.json` | `com.flexa.market` (**suspended package — do not ship**) |
| Target Android package | `com.flexamarket.app` |
| Matching `google-services.json` for target package | **MISSING — Sammy must register in Firebase Console** |
| `app.json` → `android.googleServicesFile` | **Intentionally omitted** until matching JSON arrives |
| iOS Firebase / `com.flexamarket.mobile` | **Do not modify** |
| Production Expo push backend (`POST/DELETE /api/push/expo-token`) | Unchanged — reused by native app |

## Why tokens fail until cutover

Expo Notifications on Android obtains an FCM-backed Expo push token. That requires a Firebase Android app whose `package_name` matches `com.flexamarket.app`. The checked-in `google-services.json` still lists `com.flexa.market` only. Wiring that file into the new package would produce mismatched builds; leaving `googleServicesFile` unset keeps builds safe but **physical-device FCM registration cannot succeed** until a new JSON is supplied.

## Operator steps (Sammy / Firebase owner)

1. Open Firebase Console → project `flexa-market-8873a` (or the production project already used by Flexa Market).
2. Add Android app with package name **`com.flexamarket.app`** (app nickname: Flexa Market).
3. Download the new `google-services.json`.
4. Replace `artifacts/mobile/google-services.json` on this branch (or provide the file privately to the agent).
5. Set in `app.json` under `expo.android`:
   ```json
   "googleServicesFile": "./google-services.json"
   ```
6. Confirm Cloud Messaging API is enabled; do **not** commit service-account private keys.
7. Rebuild a **development** Android binary (no Play publish / no release AAB without separate approval).
8. Verify: grant notification permission → Expo token starts with `ExponentPushToken` → `POST /api/push/expo-token` succeeds for the signed-in user.

## Security

- Never commit Firebase **service account** JSON or private keys.
- Client `google-services.json` is expected in the app binary; treat it as non-secret configuration, not a credential for server APIs.
- Token registration/deletion is authenticated via JWT; logout removes the device token via `DELETE /api/push/expo-token`.
- Push payloads must not leak private message bodies to unauthorized surfaces — routing uses ids/urls only.

## iOS / production protection

- Do not change iOS bundle id, APNs, or existing Expo project push settings for `com.flexamarket.mobile`.
- Do not remove the legacy `com.flexa.market` Firebase Android app from the Console until Sammy confirms no remaining production dependency (suspended Play listing).
- Do not modify DigitalOcean, Postgres, or production website push code as part of Milestone 5.
