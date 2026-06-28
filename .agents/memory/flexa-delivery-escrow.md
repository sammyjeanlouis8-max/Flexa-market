---
name: Flexa delivery escrow & auto-completion
description: Why Flexa orders auto-completed with no driver, and the rule for releasing escrow on FM-pool deliveries
---

# Flexa delivery escrow / auto-completion

- Two parallel models: `transactionsTable` = the ORDER (`orderStatus`, `autoReleaseAt`, `escrowReleased`); `deliveriesTable` = the DELIVERY (driver lifecycle, `status`, `delivery_method`).
- The **Flexa driver pool** ("FM driver") = deliveries with `delivery_method IN ('motorcycle','car')`. They start at delivery `status='waiting'` (no driver) until a driver accepts. Personal-driver = `delivery_method` NULL, status `on_the_way`, code-based. Bus = `delivery_method='bus'`. Carrier/non-Haiti = no deliveries row, tracking number.

## Rule: FM-pool escrow releases ONLY on real delivery, never on a timer
- **Why:** `runAutoRelease()` (in `routes/transactions.ts`, scheduled by its own `setInterval` at module load, ~every 30 min — NOT registered in `index.ts`) released escrow + set `orderStatus='completed'` for any order where `autoReleaseAt <= NOW()` and `orderStatus IN ('shipped','delivered')`. But the seller's `/orders/:id/ship` with `useFmDriver` marks the order `shipped` + sets a 3-day `autoReleaseAt` AT SHIP TIME while the delivery is still `waiting`. So orders that NO driver ever accepted auto-completed and released funds — the reported "orders auto-complete without a driver" bug.
- **How to apply:** the auto-release query now has a `NOT EXISTS` gate excluding any order with an FM-pool delivery (`delivery_method IN ('motorcycle','car')`) whose `status <> 'delivered'`. FM-pool escrow must release only via actual driver delivery (code verification in `confirmDelivery`, delivery.ts). Do NOT re-add timer auto-release for FM-pool orders. Personal/bus/carrier flows still use the timer (intentional safety net) and were left untouched.

## Delivery state machine (server-side guard)
- Canonical driver flow: `waiting` → `driver_assigned` (accept: atomic lock `WHERE status='waiting' .returning()`) → `picked_up` → `on_the_way` → `arrived` → `delivered` (delivered ONLY via `/delivery/:id/verify-code`, requires `arrived` + buyer secret code; releases escrow + credits driver). Terminal: `cancelled`, `buyer_absent`.
- `PATCH /delivery/:id/status` now enforces `DRIVER_STATUS_TRANSITIONS` (no skip/backtrack) and does an **atomic compare-and-set** (`WHERE id AND status=<prev> AND driver_user_id`) — 409 on race. Do not reintroduce a flat status whitelist without current-status validation.
- `arrived_pickup` = spec's "Arrived at Pickup" step, added as an OPTIONAL forward branch (`driver_assigned → arrived_pickup → picked_up`); current frontend still goes `driver_assigned → picked_up` directly. Keep it feature-flagged until the driver screens (timeline/i18n/socket consumers) support it.
- Buyer cancel rule: buyer (and seller-reject) may cancel ONLY when a delivery row is absent or `status='waiting'`. Once past waiting → only admin/support.

## Resolved: buyer self-confirm escrow leak (was the known follow-up)
- `/orders/:id/confirm-delivery` for Haiti/DR let the BUYER release escrow from any active status with no driver involvement. **Fixed:** that endpoint now looks up the order's delivery and blocks (409 `fmDriverDelivery`) for FM-pool orders (`delivery_method IN ('motorcycle','car')`) whose `status <> 'delivered'`. FM-pool escrow releases ONLY via driver code verification. Personal/bus/carrier flows untouched.
