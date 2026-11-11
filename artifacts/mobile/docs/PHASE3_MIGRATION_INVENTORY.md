# Phase 3 migration inventory (Android)

## Snapshot counts (after iOS-all-pages / Phase 3U base)

| Status | Count |
|---|---|
| FULLY_NATIVE | 78 |
| PARTIALLY_NATIVE | 2 |
| PLACEHOLDER | 0 |
| MISSING | 0 |
| BLOCKED | 4 |

iOS RevenueCat unlocks `subscription-billing`. Remaining BLOCKED: wallet-topup, boost-paid, music-purchase, esim. PARTIAL: push-fcm, product-variations. **Not 100%** — external contracts / SQL / device verification required.


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
