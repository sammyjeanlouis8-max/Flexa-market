# Firebase Android config — `com.flexamarket.app`

## Status (Milestone 5.1)

| Item | Status |
|---|---|
| Existing Firebase project | `flexa-market-8873a` (reuse — do not create a second project) |
| Legacy Android app in `google-services.json` | `com.flexa.market` (**suspended package — do not ship**) |
| Target Android package | `com.flexamarket.app` |
| Matching `google-services.json` for target package | **MISSING — owner Firebase Console registration required** |
| Agent Firebase Console access | **Unavailable** (no Firebase CLI / gcloud / service account in this environment) |
| `app.json` → `android.googleServicesFile` | **Intentionally omitted** until matching JSON arrives |
| iOS Firebase / `com.flexamarket.mobile` | **Do not modify** |
| Production Expo push backend (`POST/DELETE /api/push/expo-token`) | Unchanged — reused by native app |

## Why this agent cannot finish Console registration

Registering an Android app and downloading `google-services.json` requires Firebase Console owner/editor access. This cloud agent has:

- No `firebase` / `gcloud` CLI auth
- No Firebase service-account secret bound
- No authority to invent `mobilesdk_app_id`, API keys, or client entries

Fabricating `google-services.json` would break FCM and is forbidden.

## Exact owner steps (Sammy)

1. Open [Firebase project settings](https://console.firebase.google.com/project/flexa-market-8873a/settings/general).
2. Under **Your apps**, click **Add app** → **Android**.
3. Android package name: **`com.flexamarket.app`**
4. App nickname: **Flexa Market**
5. Debug signing certificate SHA-1: optional for FCM (can add later for Google Sign-In).
6. Click **Register app**.
7. Download **`google-services.json`**.
8. On branch `cursor/native-android-migration-audit-b867`, replace  
   `artifacts/mobile/google-services.json`  
   (or attach the file and ask the agent to apply it).
9. Confirm the downloaded file’s `client[].client_info.android_client_info.package_name` list **includes** `com.flexamarket.app`.  
   It may also still list `com.flexa.market` — that is OK. **Do not delete** existing iOS or production apps.
10. Ask the agent (or edit) `artifacts/mobile/app.json` → `expo.android`:
    ```json
    "googleServicesFile": "./google-services.json"
    ```
11. Confirm Cloud Messaging API is enabled for the project.
12. **Do not** download or commit Firebase **service account** private keys.
13. Rebuild a **development** Android binary (`eas build --profile development` or preview APK).  
    **No Play publish / no release AAB** without separate approval.
14. On device: grant notification permission → Expo token starts with `ExponentPushToken` → signed-in user hits `POST /api/push/expo-token`.

### Validation after the file lands

```bash
cd artifacts/mobile
node scripts/validate-firebase-android.mjs --require-wired
npm run typecheck
node --test tests/firebaseAndroidConfig.test.js tests/firebaseAndroidConfig.ts.test.ts
```

Exit code `2` from the script means the target package is still missing from the JSON.

## Client integration already in place (code)

- `expo-notifications` plugin + `POST_NOTIFICATIONS` permission
- Expo projectId `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e`
- Channels: `flexa-messages`, `orders`, `default`, `promotions`, `admin-broadcast`, `flexa-tv`, `wallet`, `security`, `music`
- Token register / refresh / logout unregister via existing backend
- Cold-start + tap routing (`routeFromPushData`) including Communications for announcements
- Gate helpers: `lib/firebaseAndroidConfig.ts`, `lib/pushLifecycle.ts`

## Security

- Never commit Firebase **service account** JSON or private keys.
- Client `google-services.json` is expected in the app binary; it is not a server credential.
- Token registration/deletion is JWT-authenticated.
- Push routing uses ids/urls — not private message bodies on unauthorized surfaces.

## iOS / production protection

- Do not change iOS bundle id, APNs, or Expo project push settings for `com.flexamarket.mobile`.
- Do not remove the legacy `com.flexa.market` Firebase Android app until Sammy confirms no remaining dependency.
- Do not modify DigitalOcean, Postgres, or production website push code for this milestone.
