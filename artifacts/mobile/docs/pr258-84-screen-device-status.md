# PR #258 — 84-screen Android device status

**Verdict:** Device matrix **blocked** on this VM. Emulator online but System UI ANR prevents navigation.

| Item | Result |
|------|--------|
| Emulator | `emulator-5554` API 34, no KVM, swiftshader |
| eSIM menu → native screen → Back | **UNTESTED_ON_DEVICE** (ANR) |
| 84 screens live navigation | **UNTESTED_ON_DEVICE** (all) |
| Code inventory | 81 complete / 0 partial / 3 verified disabled |
| Unit tests | notification deep links + eSIM drawer wiring pass |

Mark every screen **UNTESTED_ON_DEVICE** until a physical/cloud device run is attached.
