/**
 * Phase 3 — Delivery state machine.
 *
 * Single source of truth for which delivery status transitions are valid.
 * Every code path that mutates `deliveriesTable.status` MUST run through
 * `assertTransition()` (or its thrower-free cousin `canTransition()`) first.
 * This eliminates the class of bug where one route accidentally moves a
 * delivery from `delivered` back to `waiting`, leaves it in an impossible
 * combination (e.g. `picked_up` + null `acceptedAt`), or skips the escrow
 * release path by jumping straight to `cancelled`.
 *
 * Statuses are documented inline. The transitions table is built from the
 * actual flows in `routes/delivery.ts`, with `disputed` added for Phase 4.
 * No DB schema change is required — we treat `status` as a tagged-string
 * column and rely on this module as the gate.
 */

export type DeliveryStatus =
  // Initial — buyer has paid, no driver yet.
  | "waiting"
  // Driver has been matched and notified, awaiting acceptance.
  | "driver_assigned"
  // Driver is on the way to / has reached the pickup point.
  | "picked_up"
  // Driver has arrived at the buyer's drop-off location.
  | "arrived"
  // Driver has delivered; awaiting buyer verification code OR auto-release.
  | "delivered"
  // Buyer (or auto-release cron) confirmed receipt — payout has fired.
  | "completed"
  // Buyer was not present at drop-off; driver awaits reschedule decision.
  | "buyer_absent"
  // Driver failed to pick up the item from the seller.
  | "failed_pickup"
  // Item is being driven back to the seller after a refusal / no-show.
  | "returning"
  // Seller confirmed the returned item; refund path fires.
  | "returned"
  // Seller closed the order from their side (manual abandon).
  | "seller_closed"
  // Buyer / seller / driver raised a formal dispute (Phase 4). Frozen
  // until an admin resolves it.
  | "disputed"
  // Cancelled before any driver was engaged.
  | "cancelled";

export const ALL_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "waiting",
  "driver_assigned",
  "picked_up",
  "arrived",
  "delivered",
  "completed",
  "buyer_absent",
  "failed_pickup",
  "returning",
  "returned",
  "seller_closed",
  "disputed",
  "cancelled",
] as const;

// Terminal states — no further transition allowed from these.
const TERMINAL_STATUSES: ReadonlySet<DeliveryStatus> = new Set([
  "completed",
  "returned",
  "seller_closed",
  "cancelled",
]);

/**
 * Allowed forward transitions. `disputed` can be entered from almost any
 * non-terminal status because either party can raise an issue at any point
 * before the money has moved (post-completion disputes flow through Stripe
 * chargeback, not this state).
 *
 * If a transition is missing here, it is denied. Add new flows here and
 * here only — do NOT bypass via raw `db.update(...)` calls.
 */
const TRANSITIONS: Record<DeliveryStatus, ReadonlySet<DeliveryStatus>> = {
  waiting: new Set<DeliveryStatus>([
    "driver_assigned",
    "cancelled",
    "disputed",
  ]),
  driver_assigned: new Set<DeliveryStatus>([
    "picked_up",
    "failed_pickup",
    "waiting", // driver cancelled — recycled back into the matching pool
    "cancelled",
    "disputed",
  ]),
  picked_up: new Set<DeliveryStatus>([
    "arrived",
    "delivered", // legacy direct jump still used by some flows
    "returning",
    "disputed",
  ]),
  arrived: new Set<DeliveryStatus>([
    "delivered",
    "buyer_absent",
    "returning",
    "disputed",
  ]),
  delivered: new Set<DeliveryStatus>([
    "completed",
    "disputed",
  ]),
  buyer_absent: new Set<DeliveryStatus>([
    "delivered", // buyer arrived after reschedule
    "returning",
    "disputed",
  ]),
  failed_pickup: new Set<DeliveryStatus>([
    "returning",
    "cancelled",
    "disputed",
  ]),
  returning: new Set<DeliveryStatus>([
    "returned",
    "disputed",
  ]),
  // Terminal — explicit empty sets keep the type system honest.
  completed: new Set<DeliveryStatus>([]),
  returned: new Set<DeliveryStatus>([]),
  seller_closed: new Set<DeliveryStatus>([]),
  cancelled: new Set<DeliveryStatus>([]),
  // Disputed exits only through admin resolution back into one of the
  // existing terminal/refund paths.
  disputed: new Set<DeliveryStatus>([
    "completed",
    "returned",
    "cancelled",
  ]),
};

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === "string" && (ALL_DELIVERY_STATUSES as readonly string[]).includes(value);
}

export function isTerminal(status: DeliveryStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  if (from === to) return true; // idempotent re-write is allowed
  return TRANSITIONS[from].has(to);
}

export class InvalidDeliveryTransitionError extends Error {
  readonly from: DeliveryStatus;
  readonly to: DeliveryStatus;
  constructor(from: DeliveryStatus, to: DeliveryStatus) {
    // Defensive: `from` may be an unknown string (e.g. raw query param) when
    // assertTransition throws. Only enumerate allowed-next when we have a
    // valid source status.
    const allowedNext = (TRANSITIONS as Record<string, ReadonlySet<DeliveryStatus> | undefined>)[from];
    const allowedList = allowedNext ? [...allowedNext].join(", ") : "<unknown source>";
    super(
      `Invalid delivery status transition: "${from}" → "${to}". ` +
      `Allowed next statuses from "${from}": [${allowedList || "<terminal>"}].`,
    );
    this.name = "InvalidDeliveryTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Throw if the transition is not allowed. Caller should map the thrown
 * error to a 409 Conflict response. The unknown-status guard means raw
 * strings from query params are safe to pass in.
 */
export function assertTransition(from: unknown, to: unknown): void {
  if (!isDeliveryStatus(from)) {
    throw new InvalidDeliveryTransitionError(
      (from as DeliveryStatus) ?? ("<unknown>" as DeliveryStatus),
      isDeliveryStatus(to) ? to : ("<unknown>" as DeliveryStatus),
    );
  }
  if (!isDeliveryStatus(to)) {
    throw new InvalidDeliveryTransitionError(from, ("<unknown>" as DeliveryStatus));
  }
  if (!canTransition(from, to)) {
    throw new InvalidDeliveryTransitionError(from, to);
  }
}

/**
 * Convenience helper for routes: returns the next status if allowed,
 * otherwise returns null. Callers can branch without try/catch.
 */
export function nextStatusOrNull(from: DeliveryStatus, to: DeliveryStatus): DeliveryStatus | null {
  return canTransition(from, to) ? to : null;
}
