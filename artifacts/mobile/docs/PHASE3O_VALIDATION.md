# Phase 3O — Native completion & functional validation

**Branch:** `cursor/native-phase3o-validate-09ff`  
**Base:** Phase 3N tip `370eeb46` (PR #188)  
**Safety:** No merge · no DigitalOcean deploy · no Play submit · no real payments

## Target honesty: not 83/83 FULLY_NATIVE

“83/83 where technically and functionally appropriate” **does not** mean inventing APIs or claiming device verification. Eight inventory rows correctly remain non-FULLY_NATIVE:

| Count | Status | IDs | Why not FULLY_NATIVE |
|------:|--------|-----|----------------------|
| 75 | FULLY_NATIVE | (rest) | Verified RN + API wiring |
| 1 | PARTIALLY_NATIVE | `push-fcm` | Physical FCM E2E + EAS FCM V1 unverified |
| 1 | PLACEHOLDER | `website-embed` | Intentional — no marketplace WebView |
| 1 | MISSING | `product-variations` | No SKU/variant backend |
| 5 | BLOCKED | wallet-topup, subscription-billing, boost-paid, music-purchase, esim | Play digital goods and/or missing provider |

**Inventory after 3O:** still **75 / 1 / 1 / 1 / 5** of 83.

---

## Completed in Phase 3O (safe polish)

### Flexa Boost (unpaid path)
- Local form draft persistence (`lib/boostDrafts.ts`) so interrupted sessions don’t lose title/audience/video URL
- Video preview via `NativeVideoPlayer` on `/boost-create`
- Age/gender audience controls passed to existing `/booster/campaigns` draft API
- Promo `/videos` list now plays with `NativeVideoPlayer` (unload on unmount)
- `User-Agent: FlexaMarketAndroid` on booster API (strengthens `mode:launch` rejection)

### FCM
- Retry registration control on `/notifications`
- UA on expo-token POST/DELETE
- Still **PARTIALLY_NATIVE** — do not claim physical delivery

### Auth globe
- Preserved (adaptive GL + lite path from 3M). No WebView.

### Product variations
- Confirmed: only optional `itemSize` text exists
- Required contract unchanged (documented; not invented)

### Payments compliance
| Flow | Finding | 3O action |
|------|---------|-----------|
| Physical Stripe / BNPL | Allowed | Preserved |
| Wallet top-up / VIP / paid boost / music | Digital — Play Billing | Remain BLOCKED |
| eSIM | No provider API | Remain BLOCKED |

### Infrastructure
- Production = DigitalOcean App Platform
- Vercel checks = legacy account-blocked noise — not migrated, not fixed via infra change

---

## Physical-device FCM checklist (unchanged requirement)

See also `ANDROID_PUSH_DEVICE_TEST_PLAN.md` if present.

1. EAS build with `com.flexa.market` + `google-services.json`
2. Expo dashboard FCM V1 for project `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e`
3. Physical Android → grant permission → Notifications shows `token: registered`
4. Admin test / manual push → FG + BG delivery
5. Deep link tap · logout unregister

---

## Recommended Phase 3P
1. Physical Android FCM + Twilio OTP validation session  
2. Backend multi-SKU variants → native UI  
3. Play Billing counsel for digital goods only  
4. Optional: disconnect Vercel GitHub App (hygiene)  
5. eSIM provider when contracted  
