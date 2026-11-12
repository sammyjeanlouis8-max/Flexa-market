# Phase 3 migration inventory (Android)

## Snapshot counts (after iOS-all-pages / Phase 3U base)

| Status | Count |
|---|---|
| FULLY_NATIVE | 79 |
| PARTIALLY_NATIVE | 2 |
| PLACEHOLDER | 0 |
| MISSING | 0 |
| BLOCKED | 3 |

iOS RevenueCat + free Music. Remaining BLOCKED: wallet-topup, boost-paid, esim. PARTIAL: push-fcm, product-variations (test DB OK; prod SQL pending). **Not 100%**. See `IOS_VARIANTS_PUSH_REPORT.md`.


Source of truth: `phase3-migration-inventory.json` (83 routes).

## Summary — Phase 3R

| Status | Count |
|--------|------:|
| FULLY_NATIVE | 75 |
| PARTIALLY_NATIVE | 2 |
| PLACEHOLDER | 1 |
| MISSING | 0 |
| BLOCKED | 5 |

Honest ceiling: **not 83/83 FULLY_NATIVE**. Remaining non-FULLY: FCM device proof, intentional website PLACEHOLDER, itemSize-only variations (PARTIAL), Play digital goods ×4 + eSIM. See `PHASE3R_NATIVE_COMPLETION.md`.
