# Phase 3N — Gap closure & remaining blockers

**Branch:** `cursor/native-phase3n-gaps-09ff`  
**Base:** Phase 3M tip `9c375864` (PR #187)  
**Safety:** No merge · no DigitalOcean deploy · no Play submit · no real payments

## Remaining 11 routes (audit)

| ID | Path(s) | Before | After 3N | Exact blocker / evidence |
|----|---------|--------|----------|--------------------------|
| bnpl | `/bnpl`, `/stripe-checkout` (+ BNPL) | PARTIAL | **FULLY_NATIVE** | Wired `POST /bnpl/checkout` → system browser |
| subscription | `/subscription` | PARTIAL | **FULLY_NATIVE** | Cancel via `POST /subscription/cancel`; paid = companion `subscription-billing` |
| boost | `/boost`, `/boost-create`, `/my-boosts`, `/boost-analytics` | PARTIAL | **FULLY_NATIVE** | Unpaid drafts/analytics complete; paid = companion `boost-paid` |
| push-fcm | PushBootstrap + notifications diagnostics | PARTIAL | **PARTIALLY_NATIVE** | Physical FCM E2E + EAS FCM V1 dashboard still unverified |
| website-embed | `/website` | PLACEHOLDER | PLACEHOLDER | Intentional — no marketplace WebView |
| product-variations | _(none)_ | MISSING | MISSING | No SKU/variant API — only `itemSize` text |
| wallet-topup | `/wallet` | BLOCKED | BLOCKED | Play digital goods + Android guard |
| subscription-billing | `/subscription` | BLOCKED | BLOCKED | Play Billing / RevenueCat purchase SDK |
| boost-paid | `/boost` | BLOCKED | BLOCKED | Play digital goods; server now rejects Android `mode:launch` |
| music-purchase | music detail (no buy CTA) | BLOCKED | BLOCKED | Play digital goods |
| esim | `/esim` | BLOCKED | BLOCKED | No provider API in api-server |

## Inventory recount (83)

| Status | 3M | 3N |
|--------|---:|---:|
| FULLY_NATIVE | 72 | **75** |
| PARTIALLY_NATIVE | 4 | **1** |
| PLACEHOLDER | 1 | 1 |
| MISSING | 1 | 1 |
| BLOCKED | 5 | 5 |

## Product variations — required contract (do not invent)

Listings only expose optional `itemSize` (`listings.itemSize`). No variant tables or routes found.

```
GET    /api/listings/:id/variants
POST   /api/listings/:id/variants   { sku, label, options, price, stock, imageUrl? }
PUT    /api/listings/:id/variants/:variantId
DELETE /api/listings/:id/variants/:variantId
Cart / stripe / bnpl checkout must accept variantId; price+stock server-authoritative.
```

## Payments vs Play (unchanged policy)

| Flow | Classification | 3N action |
|------|----------------|-----------|
| Physical Stripe + BNPL | Physical goods — external OK | BNPL wired |
| Wallet top-up / VIP / paid boost / music | Digital — Play Billing | Remain BLOCKED |
| Flex Card repay / transfers | Wallet ops (not funding) | Preserved |
| eSIM | Provider missing | BLOCKED |

## FCM — physical device checklist (not verified)

1. EAS preview/production build with `com.flexa.market` + `google-services.json`
2. Confirm Expo dashboard FCM V1 credentials for project `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e`
3. Install on physical Android → grant notification permission
4. Sign in → Notifications screen shows `token: registered`
5. Admin `/admin/push-campaigns` or `/api/push/test-expo` → foreground + background delivery
6. Tap deep-link → correct screen; logout → token unregistered

In-app diagnostics on `/notifications` show token/permission/package/EAS — **delivery success is not claimed**.

## Vercel CI failures (legacy / account)

Observed on #185 and #187:
- `Vercel – flexa-market-api-server-{g97n,2jmn,fihd}` → **Account is blocked**
- Meaningful GitHub Action `Mobile release preflight` / `Verify iOS release inputs` → **pass**

Repo evidence:
- **No** `vercel.json`; no first-party Vercel deploy scripts
- Production deploy: `.github/workflows/deploy.yml` → **DigitalOcean App Platform** (`DO_APP_ID`)
- Agent memory: disconnect Vercel GitHub App; DO is production hosting

**Conclusion:** Vercel checks are legacy/account-level status noise, not Flexa Market production CI. Do **not** change DigitalOcean infrastructure or reconnect Vercel without owner approval.

## Security notes
- Auth globe, translations, admin RBAC, navigation preserved
- `POST /booster/campaigns` with `mode:launch` now returns `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE` for Android native UA (drafts still allowed)
- Subscription `uncancel` / checkout / wallet-pay remain guard-blocked on Android

## Next steps (Phase 3O+)
1. Physical Android FCM + Twilio phone OTP validation  
2. Backend multi-SKU variants → native UI  
3. Play Billing counsel review for digital goods only  
4. Owner: disconnect blocked Vercel GitHub integration (optional hygiene)  
5. eSIM provider contract when ready  
