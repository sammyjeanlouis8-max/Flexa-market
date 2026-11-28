/**
 * Séduire Beauty public launch gate.
 * Keep in sync with marketplace + mobile `BEAUTY_PUBLIC_LAUNCH`.
 *
 * While false: Super Admin ONLY (not regular Admin / Moderator).
 * Intentionally avoids importing auth middleware (SESSION_SECRET side effects).
 */
export const BEAUTY_PUBLIC_LAUNCH = true;

function roleOf(user: { role?: string | null } | null | undefined): string {
  return String(user?.role || "").trim().toLowerCase().replace(/[\s-_]+/g, "");
}

/** Super Admin only — used when public launch is false. */
export function canAccessBeautyStaff(
  user: { isSuperAdmin?: boolean; isAdmin?: boolean; role?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return roleOf(user) === "superadmin";
}

export function canAccessBeautyModule(
  user: { isSuperAdmin?: boolean; isAdmin?: boolean; role?: string | null } | null | undefined,
): boolean {
  return BEAUTY_PUBLIC_LAUNCH || canAccessBeautyStaff(user);
}

export const BEAUTY_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "additional_info_required",
  "approved",
  "rejected",
  "suspended",
  "closed",
] as const;

export type BeautyApplicationStatus = (typeof BEAUTY_APPLICATION_STATUSES)[number];

/** Statuses that may appear in public discover listings. */
export const BEAUTY_PUBLIC_LISTING_STATUSES = new Set(["approved"]);

export const BEAUTY_BUSINESS_TYPES = [
  "beauty_studio",
  "barbershop",
  "independent_beauty",
  "independent_barber",
  "mobile_beauty",
  "mobile_barber",
] as const;

export type BeautyBusinessType = (typeof BEAUTY_BUSINESS_TYPES)[number];

/**
 * Appointment lifecycle transitions (server-validated).
 * Payment status is tracked separately.
 */
export const BEAUTY_APPOINTMENT_TRANSITIONS: Record<string, string[]> = {
  pending_confirmation: ["confirmed", "cancelled_by_customer", "cancelled_by_business", "expired"],
  confirmed: ["checked_in", "in_progress", "cancelled_by_customer", "cancelled_by_business", "rescheduled", "no_show"],
  checked_in: ["in_progress", "cancelled_by_business", "no_show"],
  in_progress: ["completed", "cancelled_by_business"],
  completed: [],
  cancelled_by_customer: [],
  cancelled_by_business: [],
  rescheduled: ["confirmed", "cancelled_by_customer", "cancelled_by_business"],
  no_show: [],
  expired: [],
};

export function canTransitionBeautyAppointment(from: string, to: string): boolean {
  const allowed = BEAUTY_APPOINTMENT_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/** Active bookings that block a professional's calendar slot. */
export const BEAUTY_BLOCKING_APPOINTMENT_STATUSES = new Set([
  "pending_confirmation",
  "confirmed",
  "checked_in",
  "in_progress",
  "rescheduled",
]);

export const BEAUTY_PRIVACY_NOTICE =
  "Your identification documents and selfie are strictly confidential. They are used to verify your identity and protect the Flexa Market community. Only authorized Flexa Market security and verification personnel can access this information. Your documents and selfie will never appear on your public Séduire Beauty profile.";
