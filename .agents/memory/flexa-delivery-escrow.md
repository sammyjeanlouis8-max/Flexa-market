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

## Known follow-up (not the timer bug)
- `/orders/:id/confirm-delivery`: for Haiti/DR (`isManualDelivery`) it lets the BUYER release escrow from `pending`/`ready_to_ship` too (any active status), so a manual buyer confirm can release funds with no driver involvement. This is buyer-initiated (not auto), so it's part of the later state-machine rebuild, not the auto-completion fix. Tighten for FM-pool orders in a future phase.
