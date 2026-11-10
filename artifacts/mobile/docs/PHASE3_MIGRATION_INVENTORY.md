# Phase 3 migration inventory (Android)

Source of truth: `phase3-migration-inventory.json` (83 routes).

## Summary — Phase 3M

| Status | Count |
|--------|------:|
| FULLY_NATIVE | 72 |
| PARTIALLY_NATIVE | 4 |
| PLACEHOLDER | 1 |
| MISSING | 1 |
| BLOCKED | 5 |

### Delta vs Phase 3L

| Status | 3L | 3M |
|--------|---:|---:|
| FULLY_NATIVE | 70 | 72 |
| PARTIALLY_NATIVE | 5 | 4 |
| PLACEHOLDER | 1 | 1 |
| MISSING | 1 | 1 |
| BLOCKED | 6 | 5 |

### Phase 3M highlights
- Phone login: additive OTP `phoneToken` + native `/auth/login-phone` (FULLY_NATIVE)
- Admin analytics hub: broadcast, push campaigns, TV CMS, Music CMS, password security (FULLY_NATIVE)
- **PLACEHOLDER:** website-embed (intentional — no WebView shell)
- **MISSING:** product-variations (no SKU API)
- **BLOCKED:** wallet top-up, paid boost, subscription billing, music purchase, eSIM provider
- **PARTIALLY_NATIVE:** push-fcm (device unverified), boost, subscription, bnpl

See `PHASE3M_DEVICE_READINESS.md` for OTP, payments, FCM, and device checklists.
