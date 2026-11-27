/**
 * Flexa Restaurant public launch gate.
 * Keep in sync with marketplace `RESTAURANT_PUBLIC_LAUNCH`.
 * false = Super Admin / Admin / Moderator only until explicit public approval.
 *
 * Intentionally avoids importing auth middleware (SESSION_SECRET side effects)
 * so unit tests can load this module in isolation.
 */
export const RESTAURANT_PUBLIC_LAUNCH = false;

function roleOf(user: { role?: string | null } | null | undefined): string {
  return String(user?.role || "").trim().toLowerCase().replace(/[\s-]+/g, "");
}

export function canAccessRestaurantStaff(
  user: { isSuperAdmin?: boolean; isAdmin?: boolean; role?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const role = roleOf(user);
  return role === "superadmin" || role === "admin" || role === "moderator";
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

/** Order lifecycle (server-enforced). Owner-managed delivery — no Flexa driver steps yet. */
export const RESTAURANT_ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["pending", "placed", "cancelled", "canceled"],
  pending: ["accepted", "confirmed", "rejected", "cancelled", "canceled"],
  placed: ["accepted", "confirmed", "rejected", "cancelled", "canceled"],
  accepted: ["confirmed", "preparing", "ready", "ready_for_pickup", "cancelled", "canceled"],
  confirmed: ["preparing", "ready", "ready_for_pickup", "cancelled", "canceled"],
  preparing: ["ready", "ready_for_pickup", "cancelled", "canceled"],
  ready: ["ready_for_pickup", "out_for_delivery", "completed", "delivered"],
  ready_for_pickup: ["completed", "delivered", "out_for_delivery"],
  out_for_delivery: ["delivered", "completed"],
  delivered: ["completed", "refund_pending"],
  completed: ["refund_pending"],
  rejected: [],
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
