# Android purchase restrictions

## Release decision

The Android app must not initiate payments for subscriptions, listing/video boosts, music purchases, artist plans, or wallet funding while compliant native digital billing is unavailable. This applies to all Android app users, not only reviewers. Do not offer external purchase links as a replacement.

The regular website retains its purchase flows. Android users retain access to content and entitlements they already own, subscription cancellation, physical marketplace checkout, deliveries, wallet balances/history, withdrawals and transfers. Driver tips for completed physical deliveries are not digital-content purchases.

Both web presentation and server purchase endpoints enforce this distinction. Android recognition includes the legacy Android WebView user agent so the hosted safeguards also apply to existing binaries. New native builds append an explicit FlexaMarketAndroid marker. This is a distribution-policy control, not an authentication or authorization boundary.

Already-paid transactions must still be settled through the existing verified, idempotent payment-completion paths. Blocking the initiation of a new digital purchase must not confiscate a payment made before the restrictions.

## Before submitting a new Android release

- Build a new signed AAB with an increased version code. A GitHub or website deployment cannot modify an AAB already uploaded to Play Console.
- Inspect the **merged release manifest**, not only Expo's public configuration. Broad photo/video library access, obsolete storage permissions, and battery-optimization exemption must not be reintroduced by dependencies.
- Confirm the Android system picker can attach a selected photo/video without broad gallery permission. Confirm microphone/camera permission denial is recoverable.
- Check the actual target SDK and Play Console's current requirement; an app.json field alone does not prove the compiled target.
- Exercise app startup, sign-in, chat, physical checkout and digital-purchase restrictions on an Android device.
- Supply accurate Data Safety answers, reviewer access, privacy and account-deletion URLs in Play Console. Repository changes cannot submit these declarations.
- Verify account-deletion behavior and retention disclosures separately. An anonymization endpoint alone is not evidence that every related record has been erased.
- Review any Play Console policy notice against the exact uploaded version. These safeguards reduce known risks but cannot guarantee approval.

## Sources

- [Google Play payments policy FAQ](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
- [Google Play photo/video permissions](https://support.google.com/googleplay/android-developer/answer/15800983?hl=en)

Some countries/programs permit alternative billing subject to enrollment and conditions. This release does not assume eligibility or implement those exceptions.