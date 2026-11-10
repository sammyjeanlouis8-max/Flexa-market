# Flexa Market — Phase 3 Native Migration Inventory

**PR chain (verified):** #174 → #175 → #176 → #177 → Phase 3G2  
**Phase 3G2 branch:** `cursor/native-seller-phase3g2-09ff` (from push-harden `09f4acdf`)  
**Backend:** `https://flexamarket.com/api`

## Snapshot counts (after Phase 3G2)

| Status | Count |
|---|---|
| FULLY_NATIVE | 51 |
| PARTIALLY_NATIVE | 3 |
| PLACEHOLDER | 6 |
| MISSING | 18 |
| BLOCKED | 5 |
| **Total** | **83** |

Machine-readable source of truth: `phase3-migration-inventory.json`.

## Phase 3G / 3G2 seller highlights

- KYC, seller registration hub, store manager
- Sell drafts + interrupted video recovery
- Resumable chunked Wasabi video (cancel/retry)
- Boost draft builder with Haiti multi-dept/commune
- Campaign filters, pause/resume (paid only), analytics
- Paid boost checkout still **BLOCKED**
- Multi-SKU variations still **MISSING** (itemSize only)

## Safe merge order later

1. #174 → main  
2. #175 → main  
3. #176 → main  
4. #177 → main  
5. Phase 3G2 PR → main  

Do not merge without authorization.
