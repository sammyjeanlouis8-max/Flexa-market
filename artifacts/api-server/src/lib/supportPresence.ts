/**
 * Support agent availability — only authenticated support+ agents who opted in
 * and currently have an active socket in the support-admin room.
 */
import { db, usersTable } from "@workspace/db";
import { or, eq, and, sql } from "drizzle-orm";
import { io, isUserOnline } from "./socketServer";
import { hasRole, isAdminAccessSuspended } from "../middlewares/auth";

/** In-memory availability toggles (userId → available). Default true when on live-support. */
const supportAvailable = new Map<number, boolean>();

export function setSupportAgentAvailable(userId: number, available: boolean): void {
  if (!Number.isFinite(userId) || userId < 1) return;
  supportAvailable.set(userId, available);
}

export function isSupportAgentMarkedAvailable(userId: number): boolean {
  if (!supportAvailable.has(userId)) return true; // default available while in support console
  return supportAvailable.get(userId) === true;
}

function socketsInSupportAdmin(): Set<number> {
  const ids = new Set<number>();
  if (!io) return ids;
  const room = io.sockets.adapter.rooms.get("support-admin");
  if (!room) return ids;
  for (const socketId of room) {
    const sock = io.sockets.sockets.get(socketId);
    const uid = sock?.data?.userId as number | undefined;
    if (typeof uid === "number" && uid > 0) ids.add(uid);
  }
  return ids;
}

export type AvailableSupportAgent = {
  id: number;
  name: string;
  avatar: string | null;
  role: string;
};

/**
 * Count unique available support agents (no admins who are unavailable / suspended).
 */
export async function listAvailableSupportAgents(): Promise<AvailableSupportAgent[]> {
  const roomIds = socketsInSupportAdmin();
  // Also include online support agents who toggled available even if room join lagged
  const candidates = new Set<number>([...roomIds]);
  for (const [uid, avail] of supportAvailable) {
    if (avail && isUserOnline(uid)) candidates.add(uid);
  }
  if (candidates.size === 0) return [];

  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar: usersTable.avatar,
      role: usersTable.role,
      isAdmin: usersTable.isAdmin,
      isSuperAdmin: usersTable.isSuperAdmin,
      isAdminSuspended: usersTable.isAdminSuspended,
      adminSuspendedUntil: usersTable.adminSuspendedUntil,
    })
    .from(usersTable)
    .where(sql`${usersTable.id} IN (${sql.join([...candidates].map((id) => sql`${id}`), sql`, `)})`);

  const out: AvailableSupportAgent[] = [];
  for (const u of rows) {
    if (!hasRole(u as any, "support")) continue;
    if (isAdminAccessSuspended(u as any)) continue;
    if (!isSupportAgentMarkedAvailable(u.id)) continue;
    // Must be online OR in support-admin room
    if (!roomIds.has(u.id) && !isUserOnline(u.id)) continue;
    out.push({
      id: u.id,
      name: u.name,
      avatar: u.avatar ?? null,
      role: (u.role as string) || (u.isSuperAdmin ? "superadmin" : u.isAdmin ? "admin" : "support"),
    });
  }
  return out;
}

export async function countAvailableSupportAgents(): Promise<number> {
  return (await listAvailableSupportAgents()).length;
}

export async function countPendingSupportTickets(): Promise<number> {
  const { supportThreadsTable } = await import("@workspace/db");
  const [fallback] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(sql`${supportThreadsTable.status} IN ('open', 'in_progress', 'waiting_customer')`);
  return Number(fallback?.count ?? 0);
}

export async function pickAgentForRouting(category: string): Promise<number | null> {
  const agents = await listAvailableSupportAgents();
  if (agents.length === 0) return null;
  const { supportThreadsTable } = await import("@workspace/db");

  // Prefer agents with lighter open workload
  const loads = await Promise.all(
    agents.map(async (a) => {
      const [row] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(supportThreadsTable)
        .where(
          and(
            eq(supportThreadsTable.assignedAdminId, a.id),
            sql`${supportThreadsTable.status} IN ('open', 'in_progress', 'waiting_customer')`,
          ),
        );
      return { id: a.id, count: Number(row?.count ?? 0), role: a.role };
    }),
  );

  loads.sort((a, b) => a.count - b.count || a.id - b.id);
  // Prefer dedicated support role for abuse; otherwise lightest load
  if (category === "abuse") {
    const mods = loads.filter((l) => l.role === "moderator" || l.role === "admin" || l.role === "superadmin");
    if (mods.length) return mods[0].id;
  }
  return loads[0]?.id ?? null;
}

/** Lightweight helper used by analytics — support-capable staff in DB (not presence). */
export async function listSupportCapableUsers(): Promise<Array<{ id: number; name: string; avatar: string | null }>> {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar: usersTable.avatar,
      role: usersTable.role,
      isAdmin: usersTable.isAdmin,
      isSuperAdmin: usersTable.isSuperAdmin,
      isAdminSuspended: usersTable.isAdminSuspended,
    })
    .from(usersTable)
    .where(
      or(
        eq(usersTable.isAdmin, true),
        eq(usersTable.isSuperAdmin, true),
        eq(usersTable.role, "support"),
        eq(usersTable.role, "moderator"),
        eq(usersTable.role, "admin"),
        eq(usersTable.role, "superadmin"),
      ),
    );
  return rows
    .filter((u) => hasRole(u as any, "support") && !isAdminAccessSuspended(u as any))
    .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar ?? null }));
}
