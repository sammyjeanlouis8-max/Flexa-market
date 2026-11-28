/**
 * Flexa Restaurant public launch gate.
 * Keep in sync with marketplace + mobile `RESTAURANT_PUBLIC_LAUNCH`.
 *
 * While false: Super Admin ONLY (not regular Admin / Moderator).
 * Intentionally avoids importing auth middleware (SESSION_SECRET side effects).
 */
export const RESTAURANT_PUBLIC_LAUNCH = false;

function roleOf(user: { role?: string | null } | null | undefined): string {
  return String(user?.role || "").trim().toLowerCase().replace(/[\s-_]+/g, "");
}

/** Super Admin only — used when public launch is false. */
export function canAccessRestaurantStaff(
  user: { isSuperAdmin?: boolean; isAdmin?: boolean; role?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return roleOf(user) === "superadmin";
}

export function canAccessRestaurantModule(
  user: { isSuperAdmin?: boolean; isAdmin?: boolean; role?: string | null } | null | undefined,
): boolean {
  return RESTAURANT_PUBLIC_LAUNCH || canAccessRestaurantStaff(user);
}

/** Canonical application / listing statuses for restaurants. */
export const RESTAURANT_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "additional_info_required",
  "approved",
  "published",
  "rejected",
  "suspended",
  "closed",
] as const;

export type RestaurantApplicationStatus = (typeof RESTAURANT_APPLICATION_STATUSES)[number];

/** Statuses that may appear in public discover listings. */
export const RESTAURANT_PUBLIC_LISTING_STATUSES = new Set(["published", "approved"]);

/**
 * Business-managed order lifecycle.
 * No Flexa Driver steps — restaurant owns prep + delivery/pickup confirmation.
 */
export const RESTAURANT_ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["order_placed", "canceled", "cancelled"],
  order_placed: ["confirmed", "rejected", "canceled", "cancelled"],
  pending: ["order_placed", "confirmed", "rejected", "canceled", "cancelled"],
  placed: ["confirmed", "rejected", "canceled", "cancelled"],
  accepted: ["confirmed", "preparing", "canceled", "cancelled"],
  confirmed: ["preparing", "rejected", "canceled", "cancelled"],
  preparing: ["ready_for_pickup", "out_for_delivery", "canceled", "cancelled"],
  ready: ["ready_for_pickup", "out_for_delivery"],
  ready_pickup: ["ready_for_pickup", "completed"],
  ready_for_pickup: ["completed", "out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: ["completed", "refund_pending"],
  completed: ["refund_pending"],
  rejected: ["refund_pending", "refunded"],
  cancelled: ["refund_pending", "refunded"],
  canceled: ["refund_pending", "refunded"],
  refund_pending: ["refunded"],
  refunded: [],
};

export function canTransitionRestaurantOrder(from: string, to: string): boolean {
  const allowed = RESTAURANT_ORDER_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/** Normalize legacy aliases to the canonical status set. */
export function normalizeRestaurantOrderStatus(status: string): string {
  const s = String(status || "").trim().toLowerCase();
  const map: Record<string, string> = {
    pending: "order_placed",
    placed: "order_placed",
    accepted: "confirmed",
    ready: "ready_for_pickup",
    ready_pickup: "ready_for_pickup",
    cancelled: "canceled",
  };
  return map[s] || s;
}

/** Incoming queue: paid/new orders waiting for owner accept. */
export const RESTAURANT_INCOMING_ORDER_STATUSES = new Set([
  "order_placed",
  "pending",
  "placed",
  "pending_payment",
]);

export function isRestaurantIncomingOrderStatus(status: string): boolean {
  const raw = String(status || "").trim().toLowerCase();
  if (RESTAURANT_INCOMING_ORDER_STATUSES.has(raw)) return true;
  return normalizeRestaurantOrderStatus(raw) === "order_placed";
}

export const RESTAURANT_FULFILLMENT_DISCLAIMER =
  "Delivery is managed directly by this business.";

export const RESTAURANT_DRIVER_POLICY =
  "Flexa Driver never transports Flexa Restaurant food orders. The business is fully responsible for preparation, packaging, temperature control, and delivery or pickup.";
