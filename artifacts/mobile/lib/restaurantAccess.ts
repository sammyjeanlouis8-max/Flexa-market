/**
 * Flexa Restaurant rollout gate.
 * false → any signed-in user can browse; owner tools still need KYC verified.
 * true → same (public browse). Kept for parity with wholesaleAccess.
 */
export const RESTAURANT_PUBLIC_LAUNCH = true;

export type RestaurantUser = {
  id?: number;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  role?: string | null;
  kycStatus?: string | null;
} | null | undefined;

/** Browse hub — any authenticated user when public launch is on. */
export function canAccessRestaurant(user: RestaurantUser): boolean {
  if (!user) return false;
  if (RESTAURANT_PUBLIC_LAUNCH) return true;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const role = String(user.role ?? "").trim().toLowerCase();
  return role === "superadmin" || role === "admin" || role === "moderator";
}

/** Map Market KYC status → restaurant identity gate statuses. */
export function mapKycToRestaurantVerification(
  kycStatus: string | null | undefined,
): "unverified" | "pending_review" | "verified" | "rejected" {
  switch (kycStatus) {
    case "approved":
      return "verified";
    case "pending":
      return "pending_review";
    case "rejected":
      return "rejected";
    default:
      return "unverified";
  }
}

export function canPublishRestaurant(user: RestaurantUser): boolean {
  return mapKycToRestaurantVerification(user?.kycStatus) === "verified";
}
