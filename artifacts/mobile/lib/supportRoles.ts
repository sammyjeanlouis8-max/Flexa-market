/**
 * Client-side role helpers for Support desk UI gating.
 * Server RBAC remains authoritative — these only hide/show controls.
 */
import type { User } from "@/context/AuthContext";

function roleOf(user: User | null | undefined): string {
  return String(user?.role ?? "").toLowerCase();
}

/** Support desk access (agent + admin + superadmin ranks). */
export function isSupportStaff(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const r = roleOf(user);
  return r === "support" || r === "admin" || r === "superadmin" || r === "moderator";
}

/** Admin+ can assign/reassign tickets. */
export function canAssignSupportTickets(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const r = roleOf(user);
  return r === "admin" || r === "superadmin";
}

export function agentDisplayName(user: User | null | undefined): string {
  const name = user?.name?.trim();
  if (name) return name;
  return "Support agent";
}
