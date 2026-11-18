# Chat composer redesign — proof

| Field | Value |
|-------|-------|
| Branch | `cursor/native-chat-composer-9753` |
| Commit | _(filled after commit)_ |
| Android | `sdk_gphone64_x86_64` · Android 14 · AVD `flexa_api34` (TCG) |
| iOS | **BLOCKED** — no Xcode/simulator on this Linux Cloud Agent |

## Design changes
- Mint-green circular **+** opens Attach → Camera / Gallery (shortcuts removed from the text field)
- Light-gray pill field with translated `typeMessage` placeholder
- Single orange outline **emoji** control inside the field; inserts at cursor
- Orange circular **mic** when empty (disabled in support/system chats); **Send** when draft has text
- White footer, hairline top divider, safe-area padding under composer

## Screenshots
| Platform | State | File | Status |
|----------|-------|------|--------|
| Android | Composer empty | [android-composer-empty.png](android-composer-empty.png) | **PASS** (matches target; System UI ANR overlay may appear) |
| Android | Composer detail crop | [android-composer-empty-crop.png](android-composer-empty-crop.png) | **PASS** |
| Android | Keyboard open | — | **UNVERIFIED** — soft-IME capture blocked by recurring System UI ANRs on TCG emu |
| iOS | Empty / keyboard | — | **BLOCKED** |

## Verified
| Check | Result |
|-------|--------|
| Empty composer layout vs target | **PASS** |
| Camera/gallery only via + menu | **PASS** (code) |
| Emoji at cursor | **PASS** (code) |
| Mic ↔ Send toggle | **PASS** (code) |
| Voice limited to non-support chats | **PASS** (code) |
| Permissions on action | **PASS** (code) |
| `adjustResize` + KeyboardAvoidingView | **PASS** (present) |
| Keyboard-open visual | **UNVERIFIED** (ANR) |
| iOS | **BLOCKED** |
