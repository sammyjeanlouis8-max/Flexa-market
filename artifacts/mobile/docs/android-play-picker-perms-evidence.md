# Android Play Photo Picker + Permissions Evidence

**Branch:** `cursor/android-play-picker-perms-09ff`  
**Package:** `com.flexamarket.app`  
**iOS bundle:** `com.flexamarket.mobile` (unchanged)  
**Backend:** DigitalOcean (`flexamarket.com`)  
**Play submit:** **NOT done** — evidence only  

## Build artifact verification

| Check | Result |
|---|---|
| `targetSdkVersion` | **36** (Android 16) — from `aapt2 dump badging` on release APK |
| `compileSdkVersion` | **36** |
| `minSdkVersion` | **24** |
| Application ID | `com.flexamarket.app` |
| versionName / versionCode | `1.0.1` / `55` |
| Device under test | Emulator `flexa_api36` (API 36, `google_apis/x86_64`) |

### Merged release permissions (android.permission.*)

| Permission | Feature |
|---|---|
| `INTERNET` / `ACCESS_NETWORK_STATE` | API + CDN |
| `CAMERA` | Declared for future / camera capture; gallery attach uses Photo Picker (no runtime camera request in gallery flows) |
| `RECORD_AUDIO` | Buyer–seller chat voice record only (runtime on mic tap) |
| `POST_NOTIFICATIONS` | Push prep / notification settings (Android 13+) |
| `VIBRATE` / `WAKE_LOCK` / `RECEIVE_BOOT_COMPLETED` | Notifications |
| `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` | Background upload module |
| `MODIFY_AUDIO_SETTINGS` | expo-av audio session |
| `SYSTEM_ALERT_WINDOW` | Dependency merge (Expo/RN); not used for overlay UX in these flows |

**Blocked / absent from release merge (required):**

- `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED`
- `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`

Selecting existing media uses the **system Photo Picker** (`com.google.android.photopicker`) without a broad gallery permission prompt.

### 16 KB page-size (packaged `.so`)

Release APK ELF `PT_LOAD` align check:

| ABI | Result |
|---|---|
| `arm64-v8a` | **PASS** (all libs ≥ 16 KB) |
| `x86_64` | **PASS** (all libs ≥ 16 KB) |
| `armeabi-v7a` / `x86` | FAIL (4 KB) — 32-bit ABIs; Play 16 KB gate targets 64-bit. Prefer shipping only `arm64-v8a` (+ `x86_64` for emulators) in Play builds. |

Smoke: API 36 emulator boot + install + Home / Sell / Chat / Transfer exercised.

## Implementation summary

1. **`lib/pickMedia.ts` + `lib/persistPickedFile.ts`** — Android Photo Picker via `expo-image-picker` without `requestMediaLibraryPermissionsAsync`; DocumentPicker fallback; in-app 8-image cap; persist `content://` into app documents for drafts.
2. Wired into ListingEditor (Add Product ≤8), edit-profile, KYC, boost-video, chat image attach, support ticket image/video (no voice).
3. **`lib/audioPermission.ts` + chat mic** — RECORD_AUDIO only on mic tap; rationale Alert; Settings link when permanently denied; stop on background/leave; `clientMessageId` idempotency; playback without mic.
4. **SafeWebView** — removed proactive RECORD_AUDIO on Messages WebView load.
5. **Money Transfer** — WebView parity multi-step (search → amount → confirm → done) with Market / Wholesale tabs.
6. Location permissions removed from declared set (manual city/location fields only).

## Evidence screenshots

| File | What it shows |
|---|---|
| `/opt/cursor/artifacts/pr235_money_transfer_before.png` | Pre-fix single-page Transfer mock |
| `/opt/cursor/artifacts/pr235_money_transfer_after.png` | Native Money Transfer with hero, fees info, Market/Wholesale tabs, search |
| `/opt/cursor/artifacts/pr235_photo_picker_add_product.png` | System Photo Picker (`com.google.android.photopicker`) from Sell / Add |
| `/opt/cursor/artifacts/pr235_mic_permission_chat.png` | In-app mic rationale from chat mic tap |
| `/opt/cursor/artifacts/pr235_mic_system_permission.png` | Android system “Allow Flexa Market to record audio?” |

## Billing / Play policy notes

- Physical goods: Stripe / Card FM (existing).
- Digital boosts / subscriptions: keep Play Billing path or keep purchase unavailable in Play builds (`ANDROID_DIGITAL_PURCHASE_UNAVAILABLE` / deferred) — **not submitted**.
- Privacy / Data safety / UGC moderation: unchanged backend; account deletion routes present (`/delete-account`).

## 84-screen verification (this run)

See `android-play-84-checklist.md`. Android exercised for core picker/permission/transfer flows on API 36; full 84-row matrix marked PASS / PARTIAL / UNVERIFIED with blockers. iOS not re-run on this machine (no iOS simulator) → **iOS UNVERIFIED** unless covered by prior PRs.
