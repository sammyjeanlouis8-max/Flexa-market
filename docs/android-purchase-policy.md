# Android purchase restrictions

## Release decision (updated 2026-11-19)

**Owner override:** digital purchases are allowed again on Android. The server
guard (`androidDigitalPurchaseGuard`) is **off by default**. Set
`ANDROID_DIGITAL_PURCHASE_GUARD=1` only if you need to re-block Play builds.

When the guard is off, the Android app may initiate:

- Vendor subscription wallet-pay
- Listing / video boost wallet initiate
- Music track / artist wallet purchase
- FM Wallet funding (card Stripe Checkout + Haiti MonCash initiate)

Physical marketplace checkout, deliveries, wallet balances/history, withdrawals,
transfers, and driver tips were never blocked by this policy.

## Optional re-enable

Both web presentation and server purchase endpoints still recognize Android via
the FlexaMarketAndroid / legacy WebView user-agent markers. With
`ANDROID_DIGITAL_PURCHASE_GUARD=1`, initiation of the digital routes above returns
`403` + `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE`. Settlement/webhooks for already-paid
transactions stay open either way.

## Before submitting a new Android release

- Build a new signed AAB with an increased version code. A GitHub or website deployment cannot modify an AAB already uploaded to Play Console.
- Inspect the **merged release manifest**, not only Expo's public configuration. Broad photo/video library access, obsolete storage permissions, and battery-optimization exemption must not be reintroduced by dependencies.
- Confirm the Android system picker can attach a selected photo/video without broad gallery permission. Confirm microphone/camera permission denial is recoverable.
- Check the actual target SDK and Play Console's current requirement; an app.json field alone does not prove the compiled target.
- Exercise app startup, sign-in, chat, physical checkout and digital-purchase flows on an Android device.
- Supply accurate Data Safety answers, reviewer access, privacy and account-deletion URLs in Play Console. Repository changes cannot submit these declarations.
- Verify account-deletion behavior and retention disclosures separately. An anonymization endpoint alone is not evidence that every related record has been erased.
- Review any Play Console policy notice against the exact uploaded version. These safeguards reduce known risks but cannot guarantee approval.

## Sources

- [Google Play payments policy FAQ](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
- [Google Play photo/video permissions](https://support.google.com/googleplay/android-developer/answer/15800983?hl=en)

Some countries/programs permit alternative billing subject to enrollment and conditions. Re-enabling the guard does not implement Play Billing or alternative billing enrollment.
