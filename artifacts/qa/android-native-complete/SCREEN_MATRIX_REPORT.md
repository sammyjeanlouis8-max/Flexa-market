# Android native vs WebView screen matrix — PR #258

- **Package:** `com.flexamarket.app`
- **Branch tip SHA:** `432d6eb0684748c03b785557bbba61233cad3c73`
- **EAS preview build:** `328f4ca0-d562-4beb-981b-fdfaf483ac64` (IN_QUEUE; obsolete `5c113660` canceled)
- **Policy:** Digital purchases **verified disabled** (guard ON). Music free. Physical checkout OK.
- **Device test rule:** A screen counts as tested only after running on Android.
- **Blockers:** Cloud emulator black screencap / flaky UiAutomator; Play key secret still missing.

## Status legend
- `PASS` — native opened via normal nav; main action exercised; API/state OK; compared to WebView
- `PASS_DISABLED` — purchase path correctly blocked (UI +/or API 403)
- `BLOCKED` — cannot test; reason required
- `UNVERIFIED` — not yet run on device; reason required

## Payment / policy checks
| Check | Result | Notes |
|---|---|---|
| Music Buy button absent | UNVERIFIED | Awaiting tip-SHA APK install |
| Music playback without wallet | UNVERIFIED | |
| Subscription purchase disabled | UNVERIFIED | |
| Boost paid initiate disabled | UNVERIFIED | |
| Wallet top-up / Stripe / MonCash blocked | UNVERIFIED | |
| Physical cart checkout available | UNVERIFIED | |
| eSIM drawer → screen → back | UNVERIFIED | |

## 84 screens
(Populate after device run. Until then all rows are UNVERIFIED — awaiting EAS APK `5c113660…` for SHA `a7329e26`.)

See `android-native-complete-inventory.json` for the 84 feature ids.
