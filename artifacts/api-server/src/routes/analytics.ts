import { Router } from "express";
import { db, siteDailyVisitsTable, siteVisitDedupeTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

/** UTC calendar day as YYYY-MM-DD (matches boost_daily_impressions convention). */
function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function normalizeVisitorKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().slice(0, 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(key)) return null;
  return key;
}

/**
 * POST /api/analytics/site-visit
 * Public, idempotent per visitorKey + UTC day. Counts unique browser visits.
 */
router.post("/analytics/site-visit", async (req, res): Promise<void> => {
  const visitorKey = normalizeVisitorKey(req.body?.visitorKey);
  if (!visitorKey) {
    res.status(400).json({ error: "Invalid visitorKey" });
    return;
  }

  const date = utcDateKey();

  try {
    const inserted = await db
      .insert(siteVisitDedupeTable)
      .values({ visitorKey, date })
      .onConflictDoNothing()
      .returning({ visitorKey: siteVisitDedupeTable.visitorKey });

    if (inserted.length > 0) {
      await db
        .insert(siteDailyVisitsTable)
        .values({ date, visitCount: 1 })
        .onConflictDoUpdate({
          target: siteDailyVisitsTable.date,
          set: { visitCount: sql`${siteDailyVisitsTable.visitCount} + 1` },
        });
    }

    res.json({ ok: true, counted: inserted.length > 0, date });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to record visit" });
  }
});

export default router;
