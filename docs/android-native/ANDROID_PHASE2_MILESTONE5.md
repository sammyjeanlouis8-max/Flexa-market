# Phase 2 — Milestone 5 Report

**Branch:** `cursor/native-android-migration-audit-b867`  
**PR:** #171  
**Updated:** 2026-11-09 (America/New_York)  
**Package:** `com.flexamarket.app` (not published)  
**App name:** Flexa Market  

---

## 1. Completed functionality

### Firebase / FCM
- Documented cutover for package `com.flexamarket.app` against existing Firebase project `flexa-market-8873a`
- Left `googleServicesFile` **unset** so builds do not bind the suspended `com.flexa.market` JSON
- Native push bootstrap: Android channels, Android 13+ permission, Expo token register/refresh/retry, logout unregister
- Reuses existing `POST/DELETE /api/push/expo-token` (no duplicate push system)
- iOS Firebase / production push backend untouched

### Push notifications
- Channels: `flexa-messages`, `orders`, `default`, `promotions`, `admin-broadcast`
- Foreground banner handler; background/closed tap routing via notification response listener
- Routing for chat, support, orders/payments/delivery, boosts/videos, wallet, security, announcements → Communications
- Duplicate prevention: clientMessageId on sends; notification list dedupe by id; push token register is upsert on server
- Preference toggle via existing `GET/PUT /users/me/preferences` (`notifyPush`)

### Notification center
- Native `notifications.tsx`: history, unread count, categories, timestamps, mark read / mark all, tap routing
- System announcements open `/communications` (filtered admin_broadcast history; backend already stores even if push fails)

### Native chat / messaging
- Inbox conversations + support unread badge
- Chat thread: poll messages, text + image send (Photo Picker + Wasabi upload), video open, **no voice compose**
- Listing → Message seller (`POST /conversations`)
- Support tickets: list, create, thread, ETA/agent/ticketRef, ratings on closed tickets, **no voice**
- FlexaBot screen via existing `POST /chatbot/message` with escalate to support

### Reliability / security
- JWT-authenticated API calls for messages, notifications, tokens
- Logout removes Expo token ownership
- Push routing uses ids/urls — does not invent private message bodies for unauthorized surfaces
- Error logging without dumping tokens/message bodies in UI

---

## 2. Firebase configuration status

| Item | Status |
|---|---|
| Reuse project `flexa-market-8873a` | Documented / intended |
| Register Android app `com.flexamarket.app` | **BLOCKED — requires Sammy in Firebase Console** |
| Matching `google-services.json` | **MISSING** |
| Wire `googleServicesFile` in app.json | **Deferred** until matching JSON |
| FCM on physical device for new package | **NOT OPERATIONAL** until cutover |
| iOS / production Firebase | Unchanged |

See `artifacts/mobile/google-services.README.md`.

---

## 3. Notification types routed

New chat messages, support replies, orders/status/payments/delivery, boosts/promo videos, seller-related via same center, system announcements (`admin_broadcast`), security, wallet — via `lib/notificationRouting.ts` + existing backend types. Delivery depends on server push fan-out already in production APIs.

---

## 4. Chat features completed

Buyer/seller messaging, support tickets (refs, agents, ETA, ratings), FlexaBot, history + poll sync, read indicators (server marks on fetch), image attachments send/receive, video receive/open, product conversations via listing start, order-related via notification routing. **Voice not introduced.**

---

## 5. Files created / modified (high level)

**Created:** `hooks/useNativePush.ts`, `lib/notificationRouting.ts`, `lib/pushToken.ts`, `components/PushBootstrap.tsx`, `app/chat/[id].tsx`, `app/notifications.tsx`, `app/communications.tsx`, `app/support/index.tsx`, `app/support/[id].tsx`, `app/chatbot.tsx`, tests (`notificationRouting`, `pushToken`, `firebaseAndroidConfig`), this report, updated `google-services.README.md`.

**Modified:** `app/(tabs)/inbox.tsx`, `app/_layout.tsx`, `app/listing/[id].tsx` (Message seller), progress/test docs.

---

## 6. APIs integrated

| API | Use |
|---|---|
| `GET/POST /conversations` | Inbox / start chat |
| `GET/POST /conversations/:id/messages` | Thread + send (text/image) |
| `GET /support/threads`, `POST /support/threads` | Ticket list/create |
| `GET/POST /support/threads/:id(/messages)` | Thread + reply |
| `POST /support/threads/:id/rate` | CSAT |
| `GET /support/unread-count` | Inbox badge |
| `POST /chatbot/message` | FlexaBot |
| `GET /notifications`, unread-count, read, read-all | Notification center |
| `GET/PUT /users/me/preferences` | notifyPush |
| `POST/DELETE /push/expo-token` | Device token lifecycle |
| Storage upload helpers | Chat image attachments |

---

## 7. Tests executed

| Suite | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| Unit: notificationRouting + pushToken + firebaseAndroidConfig + prior | **PASS** (28/28) |
| Live API auth gates (conversations, notifications, push token, support, prefs, chatbot) → 401; `/chatbot/status` 200 | **PASS** |
| Emulator / physical FCM end-to-end | **NOT RUN** |
| Authenticated chat send E2E | **NOT RUN** (no test user credentials) |
| Real Firebase Console registration | **NOT EXECUTED** (operator action) |

---

## 8. Tests not executed (require device / Firebase / credentials)

- Physical Android FCM token mint for `com.flexamarket.app`
- Background / killed-state notification delivery
- Duplicate push suppression under flaky network on device
- Authenticated message send + support ticket create against production
- Google Play policy review / AAB install

---

## 9. Remaining blockers

1. Sammy must register Firebase Android app `com.flexamarket.app` and supply matching `google-services.json`
2. Then set `googleServicesFile` and rebuild a **dev** client
3. Device QA matrix for push cold/warm start
4. No Play publish / no release AAB without separate approval

---

## 10. Security risks

- Until Firebase cutover, Android push is non-functional for the new package (fail-safe, not a data leak)
- Client `google-services.json` must never be confused with a service-account key
- Ensure push payloads continue to avoid private message bodies in unauthorized contexts (server already uses truncated previews)

---

## 11. Google Play compliance risks

- Primary UI remains native RN (not WebView) for chat/notifications
- `POST_NOTIFICATIONS` declared; runtime request on Android 13+
- Do not attempt to republish suspended `com.flexa.market`
- Digital goods still blocked pending Billing compliance (unchanged from M4)

---

## 12. Branch / PR status

Work lands on `cursor/native-android-migration-audit-b867` / PR #171. **Do not merge. Do not deploy. Do not publish.**

---

## 13. Recommended next milestone

**Milestone 6 (proposed):** Wallet / seller center / remaining account screens + device QA for push after Firebase JSON cutover — **only after explicit Sammy authorization.**

**STOP after Milestone 5.**
