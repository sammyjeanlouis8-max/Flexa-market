# Flexa Market — Phase 3 Native Migration Inventory

**PR #172 (Phases 1–3C):** `cursor/native-auth-globe-android-09ff` — OPEN, not merged  
**Phase 3D branch:** `cursor/native-seller-phase3d-09ff`  
**Backend:** `https://flexamarket.com/api`  
**Machine-readable:** [`phase3-migration-inventory.json`](./phase3-migration-inventory.json)  
**Admin audit:** [`PHASE3D_ADMIN_PANEL_INVENTORY.md`](./PHASE3D_ADMIN_PANEL_INVENTORY.md)

## Snapshot counts (after Phase 3D)

| Status | Count |
|---|---|
| FULLY_NATIVE | 29 |
| PARTIALLY_NATIVE | 5 |
| PLACEHOLDER | 12 |
| MISSING | 31 |
| BLOCKED | 5 |

## Phase 3D completed (this branch)

- Seller: Sell (Wasabi multi-image progress/cancel/retry), My Listings, Sales dashboard, Offers
- Chat Pro Max: voice/video/reply/read receipts/offer-from-chat
- Support + FlexaBot (voice **prohibited** in support)
- Smart notification deep-links expanded
- Admin panel: **inventory only** (native deferred)

## Preserved

Phases 1–3C on PR #172 tip (`b08b461f`) — this branch forks from that commit.

## Deferred / blocked

- eSIM DEFERRED · Wallet top-up BLOCKED · Admin native DEFERRED  
- Listing video composer, link unfurling, full public shop polish

## Recommended next (do not auto-start)

Phase 3E: seller shop polish, listing edit form, remaining settings, selective admin tools if authorized.
