# Android purchase restrictions

## Release decision

The Android app must not initiate payments for subscriptions, listing/video boosts,
music purchases, artist plans, or wallet funding while compliant native Play Billing
is unavailable / unverified end-to-end. This applies to all Android app users, not
only reviewers. Do not offer external purchase links as a replacement.

**Server guard is ON by default.** Set `ANDROID_DIGITAL_PURCHASE_GUARD=0` (or
`false` / `off` / `no`) only for explicit non-Play debugging. Production and
Internal testing builds must keep the default.

**Flexa Music** is free in the Android app for this release: no Buy button, no
wallet purchase path in the player. Playback must work without payment or wallet
balance.

Physical marketplace checkout (cart / Stripe / wallet for **physical goods**),
deliveries, wallet balances/history, withdrawals, transfers, and driver tips are
not digital-content purchases and remain available.

Already-paid transactions must still be settled through the existing verified,
idempotent payment-completion paths. Blocking initiation of a new digital purchase
must not confiscate a payment made before the restrictions.

## Client + server enforcement

- Native UI shows an honest “unavailable until Play Billing” message for
  subscription purchase, paid boost launch, and wallet top-up / card recharge.
- Server middleware `androidDigitalPurchaseGuard` rejects Android UA initiation of
  the protected digital routes with `403` + `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE`.
- Android recognition includes FlexaMarketAndroid and legacy WebView markers.

A **verified disabled** digital purchase (UI message + 403 from API) is an
acceptable Internal testing result until Play Billing E2E passes.

## Before submitting a new Android release

- Build a new signed AAB with an increased version code. A GitHub or website deployment cannot modify an AAB already uploaded to Play Console.
- Inspect the **merged release manifest**, not only Expo's public configuration.
- Exercise app startup, sign-in, chat, physical checkout and digital-purchase **blocks** on an Android device.
- Supply accurate Data Safety answers, reviewer access, privacy and account-deletion URLs in Play Console.

## Sources

- [Google Play payments policy FAQ](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
- [Google Play photo/video permissions](https://support.google.com/googleplay/android-developer/answer/15800983?hl=en)
