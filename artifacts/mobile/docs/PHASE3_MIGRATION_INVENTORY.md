# Flexa Market — Phase 3 Native Migration Inventory

**Phase 3E:** [#174](https://github.com/sammyjeanlouis8-max/Flexa-market/pull/174) OPEN  
**Phase 3F:** [#175](https://github.com/sammyjeanlouis8-max/Flexa-market/pull/175) OPEN (base: 3E)  
**Phase 3G branch:** `cursor/native-seller-phase3g-09ff` (tip of 3F `f4e88fc6`)  
**Backend:** `https://flexamarket.com/api`

## Snapshot counts (after Phase 3G)

| Status | Count |
|---|---|
| FULLY_NATIVE | 51 |
| PARTIALLY_NATIVE | 3 |
| PLACEHOLDER | 6 |
| MISSING | 18 |
| BLOCKED | 5 |
| **Total features** | **83** (+1 product-variations tracker) |

## Phase 3G completed

- KYC native submit (admin review; no auto-approve)
- Seller registration path (KYC + payout + sell)
- Store manager invite + manager dashboard
- Sell drafts (AsyncStorage) + drafts hub
- Chunked Wasabi video upload (listing + boost draft)
- Boost **draft** campaign builder (Haiti dept/commune; paid launch blocked)
- `itemSize` single-field size/variant (multi-SKU **MISSING** — no backend API)

## Explicit blockers

- `boost-paid` BLOCKED (Play digital goods)
- `product-variations` MISSING (no variant APIs)
- No server listing-draft table (client drafts only)

## Safe merge order later

1. #174 → main  
2. #175 → main  
3. Phase 3G PR → main  

Do not merge without authorization.
