# Android native vs WebView screen matrix — PR #258

- **Package:** `com.flexamarket.app`
- **Branch tip SHA:** `a7329e26932816d27652bfff161f7dea9299937f`
- **EAS preview build:** `5c113660-8889-4a7c-af26-37e1445e8a16` (queued/building)
- **Policy:** Digital purchases **verified disabled** (guard ON). Music free. Physical checkout OK.
- **Device test rule:** A screen counts as tested only after running on Android.

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
