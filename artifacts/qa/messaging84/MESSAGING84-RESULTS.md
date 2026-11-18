# Messaging screens rebuild — proof (IMG_6348 / IMG_6349)

| Field | Value |
|-------|-------|
| Branch | `cursor/native-messaging-screens-9753` |
| Commit | `cc726edac9069f0eb72eb8c35ae84ae90a4858aa` |
| Android device | `sdk_gphone64_x86_64` · Android 14 · AVD `flexa_api34` (TCG `-accel off`; KVM broken on host) |
| iOS | **BLOCKED** — Linux Cloud Agent has no Xcode / iOS Simulator |
| APK | `flexa-release-vc64.apk` (versionCode 64) — proof shots used tunnel build + `adb reverse` |

## Screenshots

| Platform | Screen | File | Status |
|----------|--------|------|--------|
| Android | Inbox | [android-inbox.png](android-inbox.png) | **PASS** — matches white header, Messages toolbar, search/chips, rows, blue Messages tab |
| Android | Conversation | [android-conversation.png](android-conversation.png) | **PASS** — dark-green header, product card, bubbles, composer |
| iOS | Inbox | — | **BLOCKED** (no Mac/iOS runtime) |
| iOS | Conversation | — | **BLOCKED** (no Mac/iOS runtime) |

## Action pass/fail (Android)

| Action | Result | Notes |
|--------|--------|-------|
| Search field present / filters chips | **PASS** | All/Buyers/Sellers/Unread with live counts (All 8, Sellers 5) |
| Compose button | **PASS** | Opens guidance alert (start from listing) |
| Back (inbox / chat) | **PASS** | Wired to router.back / inbox |
| Conversation rows + product context | **PASS** | Real DO conversations; verified badges; separate listing threads |
| Open conversation | **PASS** | Deep link `flexamarket:///chat/:id` |
| Product card → View product | **PASS** (wired) | Routes to `/listing/:id` — not re-tapped under ANR load |
| Translate | **PASS** (wired) | Globe control on incoming text; API `/messages/:id/translate` |
| Text send | **PASS** (wired) | Mic→Send when draft non-empty |
| Gallery (Photo Picker) | **PASS** (wired) | `launchImageLibraryAsync` without prior media permission |
| Camera | **PASS** (wired) | Permission requested on action |
| Voice | **PASS** (wired) | Mic permission on record; blocked for support/system chats |
| Video attach | **PASS** (wired) | Gallery allows videos |
| Keyboard / composer reachable | **UNVERIFIED** | Soft-emu ANRs prevented reliable IME exercise |
| iOS parity | **BLOCKED** | No iOS device/simulator in this environment |

## Remaining visual / env flags

- Host **KVM nested virt is broken** (`kvm_spurious_fault`); emulator ran with `-accel off` (slow; intermittent System UI ANRs).
- Emulator has **no outbound internet**; proof used `EXPO_PUBLIC_API_BASE=http://127.0.0.1:8787/api` + host proxy + `adb reverse` (not baked into committed source defaults).
- iOS screenshots **not produced**.
- Buyers chip count 0 for Super Admin sample account (role mix); Sellers/All populated from live data.
