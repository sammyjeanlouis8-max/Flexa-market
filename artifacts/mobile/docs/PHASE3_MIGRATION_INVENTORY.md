# Phase 3 migration inventory (Android)

Source of truth: `phase3-migration-inventory.json` (83 routes).

## Summary — Phase 3N

| Status | Count |
|--------|------:|
| FULLY_NATIVE | 75 |
| PARTIALLY_NATIVE | 1 |
| PLACEHOLDER | 1 |
| MISSING | 1 |
| BLOCKED | 5 |

### Delta vs Phase 3M

| Status | 3M | 3N |
|--------|---:|---:|
| FULLY_NATIVE | 72 | 75 |
| PARTIALLY_NATIVE | 4 | 1 |
| PLACEHOLDER | 1 | 1 |
| MISSING | 1 | 1 |
| BLOCKED | 5 | 5 |

### Phase 3N highlights
- BNPL physical checkout wired (`/bnpl/checkout` + Pay later on `/stripe-checkout`)
- Subscription cancel-at-period-end; paid upgrade companion remains BLOCKED
- Boost unpaid drafts/analytics FULLY_NATIVE; paid launch companion BLOCKED (+ Android `mode:launch` rejected)
- push-fcm still PARTIAL (device unverified)
- website-embed PLACEHOLDER · product-variations MISSING · 5 digital/provider BLOCKED

See `PHASE3N_GAP_CLOSURE.md` for Vercel/DO and FCM checklists.
