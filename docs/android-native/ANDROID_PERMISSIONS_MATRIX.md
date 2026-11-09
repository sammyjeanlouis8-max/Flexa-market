# ANDROID_PERMISSIONS_MATRIX.md

**Status:** Audit extension — documentation only  
**Sources:** Android Photo Picker, runtime permissions, Play Photo & Video Permissions, FGS Help, in-repo `app.json` / purchase policy.

Current `app.json` already **blocks** `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — align native media with **Photo Picker**, not broad gallery access.

---

## Permission rows

### 1. INTERNET / ACCESS_NETWORK_STATE
1. **Name:** `android.permission.INTERNET`, `ACCESS_NETWORK_STATE`  
2. **Feature:** All API traffic  
3. **Mandatory:** Yes for online app  
4. **When requested:** Install-time (normal)  
5. **If denied:** N/A (normal permissions)  
6. **Android versions:** All supported (min 24)  
7. **Docs:** Android permission model  
8. **Tests:** Offline banner + retry  

### 2. POST_NOTIFICATIONS
1. **Name:** `android.permission.POST_NOTIFICATIONS`  
2. **Feature:** FCM order/chat/promo alerts  
3. **Mandatory:** No for browsing; yes for push delivery on API 33+  
4. **When:** After login or first meaningful notification opt-in — **not** cold start spam  
5. **If denied:** App works; in-app notification center still loads via API  
6. **Versions:** Runtime on 13+  
7. **Docs:** https://docs.expo.dev/versions/latest/sdk/notifications/ · Android notification runtime permission  
8. **Tests:** Deny → no crash; grant → token registers  

### 3. CAMERA
1. **Name:** `android.permission.CAMERA`  
2. **Feature:** Capture listing photos/videos, KYC selfie, optional chat camera  
3. **Mandatory:** Only for capture flows  
4. **When:** User taps “Take photo/video”  
5. **If denied:** Fall back to Photo Picker / explain Settings path  
6. **Versions:** Runtime  
7. **Docs:** https://developer.android.com/training/permissions/requesting  
8. **Tests:** Deny then pick from gallery; grant then capture  

### 4. RECORD_AUDIO (microphone)
1. **Name:** `android.permission.RECORD_AUDIO`  
2. **Feature:** **Buyer↔seller messaging voice notes only**; camera video with audio  
3. **Mandatory:** Only while recording  
4. **When:** User presses record on supported chat — **never** for music/video *playback*  
5. **If denied:** Show localized explanation; text/image still work  
6. **Versions:** Runtime  
7. **Docs:** Runtime permissions + mic privacy  
8. **Tests:**  
   - Messaging: record → preview → send → play  
   - Support chat: voice **rejected** (server: “Voice messages are not supported in support chat”)  
   - Music play without mic prompt  

### 5. ACCESS_COARSE_LOCATION / ACCESS_FINE_LOCATION
1. **Name:** Coarse + Fine  
2. **Feature:** Optional nearby discovery / delivery GPS — **not** required for browsing  
3. **Mandatory:** No for marketplace browse  
4. **When:** User opts into “Use my location” or driver/delivery job requiring GPS — **never at splash**  
5. **If denied:** Manual country + saved address + IP fallback remain  
6. **Versions:** Runtime; foreground only unless justified background (drivers may need separate review)  
7. **Docs:** Location permissions best practices  
8. **Tests:** Deny GPS → manual Haiti/DR still filters; manual never overwritten  

### 6. VIBRATE / RECEIVE_BOOT_COMPLETED / WAKE_LOCK
1. **Names:** as in `app.json`  
2. **Feature:** Notification UX / FCM reliability  
3. **Mandatory:** Platform-dependent  
4. **When:** Install-time where applicable  
5. **If denied:** Degraded notifications  
6. **Versions:** varies  
7. **Docs:** FCM / Expo notifications  
8. **Tests:** Reboot token refresh smoke  

### 7. FOREGROUND_SERVICE / FOREGROUND_SERVICE_DATA_SYNC
1. **Names:** as declared  
2. **Feature:** Background media **upload** worker (existing module)  
3. **Mandatory:** If durable uploads continue in background  
4. **When:** Upload starts and OS requires FGS  
5. **If denied / restricted:** Foreground upload only + user messaging  
6. **Versions:** Android 10+ FGS rules; 14+ types  
7. **Docs:** https://support.google.com/googleplay/android-developer/answer/13392821  
8. **Tests:** Upload with app backgrounded; Play FGS declaration accuracy  

### 8. Media read (READ_MEDIA_* / storage) — **DO NOT ADD by default**
1. **Name:** `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / legacy storage  
2. **Feature:** Broad gallery — **avoid**  
3. **Mandatory:** No for Flexa listing/boost/chat picks if Photo Picker used  
4. **When:** N/A — keep **blockedPermissions**  
5. **If “denied”:** Use Photo Picker  
6. **Versions:** 13+ policy focus  
7. **Docs:** https://support.google.com/googleplay/android-developer/answer/15800983 · https://developer.android.com/training/data-storage/shared/photopicker  
8. **Tests:** Multi-image pick without READ_MEDIA_* in merged manifest  

### 9. Future: FOREGROUND_SERVICE_MEDIA_PLAYBACK (music)
1. **Name:** mediaPlayback FGS type (if background music)  
2. **Feature:** Flexa Music background / lock-screen  
3. **Mandatory:** If reliable background audio is claimed  
4. **When:** Playback starts  
5. **If restricted:** Pause with explanation  
6. **Versions:** 14+ typed FGS  
7. **Docs:** FGS Help + https://developer.android.com/guide/topics/media/media-controls  
8. **Tests:** Screen off continues; interruption (call) pauses  

---

## Photo upload behavior (native requirements)

| Requirement | Spec |
|---|---|
| Picker | Android Photo Picker / Expo ImagePicker system UI |
| Multi-select | Sell listing + gallery attachments where web allows multi |
| Preview / remove | Native thumbnails before submit |
| Formats | JPEG/PNG/WebP (match server allowlist) |
| Size | Client compress; enforce server max |
| Progress / retry | Existing upload bridge / WorkManager patterns |
| Drafts | Persist form + local URIs (SecureStore/filesystem) across process death |
| Backend | Existing Wasabi/proxy endpoints — no rewrite |

## Video upload behavior

| Requirement | Spec |
|---|---|
| Select | Photo Picker video |
| Record | Camera + mic only when user starts recording |
| Preview | Native player before upload |
| Duration | Preserve Booster Pro **max 120 seconds** (`MAX_VIDEO_SECONDS`) and other product limits |
| Progress / offline | Percent + resume/retry; keep draft |
| Wasabi / promo | Existing APIs |

## Voice messaging scope

| Surface | Voice allowed? |
|---|---|
| User↔user messages | **Yes** (existing web feature) |
| Customer support chat | **No** — server rejects audio/voice |
| Music / video playback | Must **not** request mic |

---

## Location priority (Smart Location — preserve)

1. Manual country selection  
2. Saved address (authenticated)  
3. GPS if granted  
4. IP geolocation  
5. Manual fallback  

**Invariant (existing web code):** never overwrite `manual: true` shopping destination with IP/GPS (`shoppingLocation.ts`).

---

## Official references

- Photo picker: https://developer.android.com/training/data-storage/shared/photopicker  
- Request permissions: https://developer.android.com/training/permissions/requesting  
- Photo & Video Permissions (Play): https://support.google.com/googleplay/android-developer/answer/15800983  
- FGS requirements: https://support.google.com/googleplay/android-developer/answer/13392821  
- Media controls: https://developer.android.com/guide/topics/media/media-controls  
