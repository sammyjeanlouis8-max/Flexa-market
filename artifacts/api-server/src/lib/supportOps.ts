/**
 * Shared operational snapshot for ETA + public availability displays.
 */
import { db, supportThreadsTable, supportMessagesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { computeResponseEta, haitiLocalHour, type EtaBand } from "./supportEta";
import { countAvailableSupportAgents, countPendingSupportTickets, listAvailableSupportAgents } from "./supportPresence";
import type { SupportPriority } from "./supportClassify";

export async function getSupportOpsSnapshot(priority: SupportPriority = "normal"): Promise<{
  agentsOnline: number;
  agents: Awaited<ReturnType<typeof listAvailableSupportAgents>>;
  pendingTickets: number;
  avgFirstResponseMin: number | null;
  eta: EtaBand;
}> {
  const [agents, pendingTickets, avgRow] = await Promise.all([
    listAvailableSupportAgents(),
    countPendingSupportTickets(),
    db
      .execute(sql`
        SELECT AVG(EXTRACT(EPOCH FROM (first_admin_reply_at - created_at)) / 60)::float AS avg_min
        FROM support_threads
        WHERE first_admin_reply_at IS NOT NULL
          AND created_at > NOW() - INTERVAL '30 days'
      `)
      .then((r: any) => {
        const rows = r?.rows ?? r;
        return Array.isArray(rows) ? rows[0] : rows;
      })
      .catch(async () => {
        // Fallback: compute from messages if column freshly added / empty
        const result = await db.execute(sql`
          SELECT AVG(EXTRACT(EPOCH FROM (sm.created_at - st.created_at)) / 60)::float AS avg_min
          FROM support_messages sm
          JOIN support_threads st ON st.id = sm.thread_id
          WHERE sm.is_admin_reply = true
            AND sm.is_internal = false
            AND sm.id = (
              SELECT id FROM support_messages
              WHERE thread_id = st.id AND is_admin_reply = true AND COALESCE(is_internal, false) = false
              ORDER BY created_at ASC LIMIT 1
            )
            AND st.created_at > NOW() - INTERVAL '30 days'
        `).catch(() => null);
        const rows = (result as any)?.rows ?? result;
        return Array.isArray(rows) ? rows[0] : null;
      }),
  ]);

  const avgFirstResponseMin =
    avgRow?.avg_min != null && Number.isFinite(Number(avgRow.avg_min))
      ? Number(avgRow.avg_min)
      : null;

  const eta = computeResponseEta({
    agentsOnline: agents.length,
    pendingTickets,
    openAssignedToOnline: 0,
    avgFirstResponseMin,
    priority,
    localHour: haitiLocalHour(),
  });

  return {
    agentsOnline: agents.length,
    agents,
    pendingTickets,
    avgFirstResponseMin,
    eta,
  };
}

export async function countOpenByStatus(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: supportThreadsTable.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(supportThreadsTable)
    .groupBy(supportThreadsTable.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.count);
  return out;
}
