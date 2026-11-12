# Flexa Market — Phase 3 Native Migration Inventory

**main:** Phases 1–3D integrated (`65df21a5`)  
**Phase 3E branch:** `cursor/native-buyer-phase3e-09ff`  
**Backend:** `https://flexamarket.com/api`  
**Machine-readable:** [`phase3-migration-inventory.json`](./phase3-migration-inventory.json)  
**Admin audit:** [`PHASE3D_ADMIN_PANEL_INVENTORY.md`](./PHASE3D_ADMIN_PANEL_INVENTORY.md)

## Snapshot counts (after Phase 3E)

| Status | Count |
|---|---|
| FULLY_NATIVE | 40 |
| PARTIALLY_NATIVE | 2 |
| PLACEHOLDER | 11 |
| MISSING | 24 |
| BLOCKED | 5 |

## Phase 3E completed (this branch)

- Forgot password / account recovery (`/api/recovery/*`) via AuthShell + AuthGlobe
- Categories on Search + Home filters
- Delivery tip + driver rating after confirm
- Help Center, Legal (Privacy/Terms/EULA), Security, Delete account
- Public FM- tracking + public seller shop (`/profile/[id]`)
- Listing detail: seller shop link + reviews
- Inventory reconciles image-upload + seller-orders as native (Phase 3D)

## Preserved

Phases 1–3D on `main` — AuthGlobe design unchanged; no WebViews; no APK/deploy.

## Deferred / blocked

- eSIM DEFERRED · Wallet top-up BLOCKED · Admin native DEFERRED  
- Phone login (OTP handlers incomplete in-repo) · push physical-device verification  
- Seller edit-listing, earnings/payouts, listing video, BNPL

## Recommended next (do not auto-start)

Phase 3F: seller edit/inventory/payouts, remaining settings prefs, selective admin tools if authorized.
