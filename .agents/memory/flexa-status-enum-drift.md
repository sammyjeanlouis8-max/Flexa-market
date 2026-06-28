---
name: Flexa delivery status-enum drift
description: Adding a new delivery status requires updating many scattered status-enumeration lists in lockstep or the UI/GPS silently breaks.
---

# Flexa delivery status enum drift

When introducing a new delivery `status` value (e.g. the optional `arrived_pickup`
step between `driver_assigned` and `picked_up`), the value must be added to EVERY
status-enumeration list across backend + both screens, not just the state machine.

**Why:** these lists are independent literal arrays; a status missing from one of
them does not error — it silently drops behaviour (no button label, wrong screen,
hidden code panel, stopped GPS). Architect review caught two such gaps after the
first push.

**How to apply — checklist when adding a delivery status:**
- Backend `delivery.ts`: state machine transitions (canDriverAdvance), the
  available-deliveries active-status `inArray(...)`, and the driver-GPS-emit
  active-status `inArray(...)`. (At least two separate `inArray` lists exist.)
- Driver UI `AvailableDeliveries.tsx`: `STATUS_CONFIG`, `nextStatus`, `nextLabel`,
  and the `isBeforeArrived` screen-selector array.
- Buyer UI `DeliveryTracking.tsx`: `STEPS` + `STEP_ICONS`, `STATUS_META`, and the
  verification-code-visibility status array.
- i18n: add matching keys to availableDeliveries block in en.ts/fr.ts/ht.ts.
  Note: DeliveryTracking STATUS_META labels are hardcoded English in production,
  not i18n'd.

**Push notifications:** delivery.ts has a `pushBoth(userId,title,body,data?)` helper
(web sendPushToUser + mobile sendExpoPushToUser, each `.catch(()=>{})`, never
throws). NEVER put the secret verification code in a push payload — code goes via
SMS + socket on accept only.
