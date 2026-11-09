# Phase 2 — Milestone 5.1 Report (Firebase / FCM)

**Branch:** `cursor/native-android-migration-audit-b867`  
**PR:** #171  
**Updated:** 2026-11-09 (America/New_York)  
**Package:** `com.flexamarket.app`  
**Firebase project:** `flexa-market-8873a`  

---

## 1. Firebase registration status

| Check | Result |
|---|---|
| Project `flexa-market-8873a` present in checked-in `google-services.json` | **YES** |
| Android app `com.flexamarket.app` registered in that JSON | **NO** |
| Legacy Android app `com.flexa.market` still listed | **YES** (preserved; do not delete) |
| Agent able to register app in Firebase Console | **NO** — no Console / gcloud / Firebase CLI credentials in this environment |
| Fabricated config | **NOT DONE** (forbidden) |

**Owner action required** to register `com.flexamarket.app` and supply the real `google-services.json`. Exact steps: `artifacts/mobile/google-services.README.md` and the environment setup action recorded for this run.

---

## 2. Android package verification

- `app.json` → `expo.android.package` = `com.flexamarket.app` ✓  
- `POST_NOTIFICATIONS` declared ✓  
- iOS `com.flexamarket.mobile` unchanged ✓  

---

## 3. google-services.json status

- File path: `artifacts/mobile/google-services.json`
- Contents: **legacy-only** (`com.flexa.market`)
- `expo.android.googleServicesFile`: **unset** (correct until target package appears)
- Validator: `lib/firebaseAndroidConfig.ts` + `scripts/validate-firebase-android.mjs`  
  Current script exit: **2 (blocked)** until Console registration

---

## 4. Expo configuration status

| Item | Status |
|---|---|
| `expo-notifications` plugin | Configured |
| Expo EAS projectId | `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e` |
| `googleServicesFile` wired | **Deferred** (awaiting matching JSON) |
| Push bootstrap (`PushBootstrap` / `useNativePush`) | Present |
| Existing backend `/api/push/expo-token` | Reused (no duplicate system) |
| Notification preferences `notifyPush` | Preserved via `/users/me/preferences` |

---

## 5. Push notification implementation (client architecture)

**Channels:** `flexa-messages`, `orders`, `default`, `promotions`, `admin-broadcast`, `flexa-tv`, `wallet`, `security`, `music`

**Lifecycle:** Android 13+ permission → Expo token → register when JWT present → refresh on AppState/token listener → unregister on logout

**States:** foreground banner handler; background tap listener; cold-start via `getLastNotificationResponseAsync`

**Routing coverage:** chat, support, orders/payments/delivery, seller sales, boosts/promo videos, Flexa Music (→ notifications until music screen exists), wallet, security, system announcements → `/communications`

**Dedup:** clientMessageId on chat sends; server upsert for Expo tokens; notification center by id

**Delivery claim:** **NOT VERIFIED on device** — cannot claim push works until Sammy supplies JSON + a real device/emulator FCM test.

---

## 6. Tests executed / passed

| Suite | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| Unit: firebaseAndroidConfig + pushLifecycle + notificationRouting + prior | **PASS** (36/36) |
| `node scripts/validate-firebase-android.mjs` | **EXIT 2** — expected blocker (target package missing) |
| Live device FCM delivery | **NOT RUN** |
| Emulator push delivery | **NOT RUN** |
| Authenticated token register E2E | **NOT RUN** (needs device token + user JWT) |

---

## 7. Tests not executed

- Physical Android / emulator FCM end-to-end
- Background / killed-state delivery after JSON cutover
- Token refresh under FCM rotation on device
- Logout unregister against production with a real Expo token

---

## 8. Remaining blockers

1. **Sammy:** Register Firebase Android app `com.flexamarket.app` and replace `google-services.json`
2. Wire `googleServicesFile: "./google-services.json"` only after package match validates
3. Rebuild development client; run device push QA
4. No merge / deploy / AAB / Play publish

---

## 9. Required owner actions

See numbered Console steps in `artifacts/mobile/google-services.README.md`.  
After the file is on the branch, authorize the agent to set `googleServicesFile` and re-run validation (or do it manually).

---

## 10. Files modified / added

- `lib/firebaseAndroidConfig.ts`, `lib/pushLifecycle.ts`
- `hooks/useNativePush.ts`, `components/PushBootstrap.tsx`, `lib/notificationRouting.ts`, `lib/pushToken.ts`
- `scripts/validate-firebase-android.mjs`
- Tests: `firebaseAndroidConfig.*`, `pushLifecycle.test.ts`, routing updates
- Docs: this file, `ANDROID_PROGRESS.md`, `google-services.README.md`, test results / risks

---

## 11. Branch / PR status

Work on `cursor/native-android-migration-audit-b867` / PR #171.  
**Do not merge. Do not deploy. Do not publish. Do not start Milestone 6.**

---

## 12. STOP

Milestone 5.1 complete for all work possible **without** Firebase Console access. Waiting on owner `google-services.json` before claiming FCM delivery readiness.
