# Phase 3M — Android device readiness & audits

**Branch:** `cursor/native-device-phase3m-09ff`  
**Base:** Phase 3L tip `aa4ecad1` (PR #185)  
**Status:** Release-candidate configuration prepared — **physical-device validation NOT claimed**

## Inventory recount (83 routes)

| Status | Before 3L/3M start | After Phase 3M |
|--------|--------------------|----------------|
| FULLY_NATIVE | 70 | **72** |
| PARTIALLY_NATIVE | 5 | **4** |
| PLACEHOLDER | 1 | **1** |
| MISSING | 1 | **1** |
| BLOCKED | 6 | **5** |

### Completed in 3M
- Phone login native UI + additive backend `phoneToken` issuer (`generatePhoneToken`)
- Admin broadcast email/SMS composers
- Admin manual push campaign composer
- Flexa TV CMS (programs + broadcast controls)
- Flexa Music CMS (artists verify, playlists, bulk track actions, storage stats)
- Password-hash security tools UI
- Auth globe low-end Android tuning (earlier lite/low thresholds + faster jank downgrade)

### Remaining incomplete
| ID | Status | Blocker |
|----|--------|---------|
| push-fcm | PARTIALLY_NATIVE | Physical Android FCM delivery unverified |
| boost | PARTIALLY_NATIVE | Paid checkout companion BLOCKED |
| subscription | PARTIALLY_NATIVE | Play Billing companion BLOCKED |
| bnpl | PARTIALLY_NATIVE | Inline BNPL composer uses listing Stripe path |
| website-embed | PLACEHOLDER | Intentional — no WebView marketplace shell |
| product-variations | MISSING | No SKU/variant inventory API |
| wallet-topup | BLOCKED | Play digital goods / alternate billing |
| subscription-billing | BLOCKED | Play Billing |
| boost-paid | BLOCKED | Play digital goods |
| music-purchase | BLOCKED | Play digital goods |
| esim | BLOCKED | External eSIM provider |

---

## Phone OTP (Step 4)

**Finding:** Live `/api/otp/*` had been repurposed for **email** wallet withdrawal and returned `withdrawalToken`. OpenAPI still specifies phone `{phone,country}` → `phoneToken`. `generatePhoneToken` existed but was unused.

**3M fix (additive, non-breaking):**
- `POST /otp/send` with `{phone,country}` → SMS via Twilio (or DEV `devCode` without Twilio)
- `POST /otp/verify` with `{phone,country,code}` → `{phoneToken,phone,country}` via `generatePhoneToken` (30m JWT `type: phone-verified`)
- Email/JWT path unchanged → still returns `withdrawalToken` for cashout only
- Native `/auth/login-phone` refuses any response that includes `withdrawalToken` instead of `phoneToken`
- Security preserved: bcrypt OTP, 5m expiry, 3 attempts, 3 sends / 2m, no reuse

**Env dependency:** Production SMS needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.

---

## Product variations (Step 5)

Listings only expose optional `itemSize` text. **No SKU / multi-variant inventory API.**

Required backend contract (do not invent):
```
GET  /api/listings/:id/variants
POST /api/listings/:id/variants   { sku, label, price, stock, imageUrl? }
PUT  /api/listings/:id/variants/:variantId
DELETE /api/listings/:id/variants/:variantId
Cart/checkout must accept variantId and price/stock must be server-authoritative.
```

---

## Payments vs Google Play (Step 6)

| Workflow | Provider today | Play classification | 3M action |
|----------|----------------|---------------------|-----------|
| Physical product checkout | Stripe / MonCash (Haiti rules) | Physical goods — external OK | Preserve |
| Wallet top-up | Stripe/wallet | Digital — Play Billing required for Play distribution | BLOCKED |
| Paid promotional boosts | Stripe | Digital service — treat as Play-gated | BLOCKED |
| Digital subscriptions / VIP | Stripe/wallet | Digital — Play Billing | BLOCKED |
| Music purchases | Stripe/wallet | Digital content | BLOCKED |
| Flex Card repayment | Wallet | Debt repayment to platform wallet — review with counsel; keep wallet path | Native repay preserved |
| eSIM purchases | N/A | Digital telecom — provider + Play review | BLOCKED |
| BNPL on physical checkout | Stripe BNPL | Tied to physical goods checkout | Partial native eligibility |

**Haiti eligibility rules preserved** (MonCash / local cash agents / Haiti wallet ledger).  
**No real payments executed. No production gateway config changed.**

Uncertain classifications flagged for legal/product review before any Play Billing work: Flex Card repayment, commission promo cashouts, cash-agent settlements.

---

## FCM (Step 7)

Wired today:
- Expo Notifications + `POST /api/push/expo-token`
- Permission prompt, token refresh/register, logout unregister
- Foreground handler, notification channels, deep links, inbox sync
- Admin `/push/manual-send` composer (superadmin)

**Not claimed verified:** end-to-end delivery on a physical Android device with production FCM V1 credentials in EAS.

### Physical-device FCM checklist
1. Build release/preview APK/AAB with correct `com.flexa.market` + `google-services.json` / EAS FCM V1
2. Install on real Android phone (not emulator-only)
3. Grant notification permission
4. Sign in → confirm `/api/push/expo-token` 200 and token row in DB
5. Send admin test / manual push → notification appears foreground + background
6. Tap notification → deep link opens expected screen
7. Open notification center → detail page works
8. Logout → token unregistered / invalidated
9. Token refresh after reinstall

---

## Media / promotional videos (Step 8)

Prior phases already cover resumable video drafts, progress, cancellation, boost drafts, Flexa Music persistent player. 3M does not reimplement. TV CMS adds admin program/broadcast controls; user TV/Music players unchanged.

---

## Android build readiness (Step 11)

- Package: `com.flexa.market` (do not change)
- Prepare: `npx expo prebuild` / EAS `preview` or `production` profile **without Play submit**
- Do **not** merge, deploy DigitalOcean, publish Play, or process live payments
- Device QA dependencies: Twilio (phone OTP), FCM credentials, Stripe/MonCash sandboxes, staff admin account

### Device validation checklist (manual)
- [ ] Login / signup + globe animation (low-end phone)
- [ ] Language persistence
- [ ] Buyer browse / cart / physical Stripe checkout (sandbox)
- [ ] Seller listing create/edit / video upload resume
- [ ] Driver dashboard
- [ ] Admin hub modules + broadcast/push/TV/Music/security (superadmin)
- [ ] Chat + support tickets
- [ ] Camera / uploads
- [ ] FCM checklist above
- [ ] Android back button / offline toast behavior

---

## Recommendation (next phase)
1. Physical Android FCM + phone OTP SMS validation  
2. Backend multi-SKU variant APIs → native variation UI  
3. Play Billing / counsel review for digital goods only  
4. eSIM provider integration when contracted  
