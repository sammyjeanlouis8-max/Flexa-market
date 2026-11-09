import { Router } from "express";
import {
  db,
  siteDailyVisitsTable,
  siteVisitDedupeTable,
  siteSessionsTable,
  sitePageViewsTable,
} from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { optionalAuth } from "../middlewares/auth";

const router = Router();

const CF_COUNTRY: Record<string, string> = {
  HT: "Haiti", DO: "Dominican Republic", US: "USA", FR: "France", CA: "Canada",
  MX: "Mexico", BR: "Brazil", CL: "Chile", GB: "United Kingdom", DE: "Germany",
  ES: "Spain", IT: "Italy", MQ: "Martinique", GP: "Guadeloupe",
  GF: "French Guiana", CU: "Cuba", JM: "Jamaica", PR: "Puerto Rico",
  TT: "Trinidad and Tobago",
};

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function normalizeVisitorKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().slice(0, 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(key)) return null;
  return key;
}

function normalizeSessionId(raw: unknown): string | null {
  return normalizeVisitorKey(raw);
}

function normalizePath(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  try {
    const path = raw.split("?")[0].split("#")[0].trim() || "/";
    return path.slice(0, 200);
  } catch {
    return "/";
  }
}

function normalizeDevice(raw: unknown): string {
  const d = String(raw ?? "").toLowerCase();
  if (d === "mobile" || d === "tablet" || d === "desktop") return d;
  return "unknown";
}

function normalizeSource(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase().trim().slice(0, 40);
  if (!s) return "direct";
  if (["direct", "organic", "social", "referral", "email", "ads", "app"].includes(s)) return s;
  return "other";
}

function countryFromRequest(req: { headers: Record<string, unknown> }, bodyCountry?: unknown): string | null {
  if (typeof bodyCountry === "string" && bodyCountry.trim()) {
    const c = bodyCountry.trim().slice(0, 80);
    // Only accept known marketplace labels — never free-form spoof expansion.
    const allowed = Object.values(CF_COUNTRY);
    if (allowed.some(a => a.toLowerCase() === c.toLowerCase())) {
      return allowed.find(a => a.toLowerCase() === c.toLowerCase())!;
    }
  }
  const cf = String(req.headers["cf-ipcountry"] ?? "").trim().toUpperCase();
  return CF_COUNTRY[cf] ?? null;
}

function isProductPath(path: string): boolean {
  return /^\/listings?\/\d+/i.test(path) || /^\/product\//i.test(path);
}

/**
 * POST /api/analytics/site-visit
 * Privacy-conscious visitor + session beacon.
 * - Opaque visitorKey (client UUID) — one unique visitor count per UTC day
 * - Opaque sessionId — refreshed via heartbeats; page refreshes do NOT mint a new unique visitor
 * - Guests and registered users both counted (registered flagged when authenticated)
 * - Country from CF-IPCountry (no raw IP stored)
 */
router.post("/analytics/site-visit", optionalAuth, async (req, res): Promise<void> => {
  const visitorKey = normalizeVisitorKey(req.body?.visitorKey);
  const sessionId = normalizeSessionId(req.body?.sessionId);
  if (!visitorKey || !sessionId) {
    res.status(400).json({ error: "Invalid visitorKey or sessionId" });
    return;
  }

  const date = utcDateKey();
  const path = normalizePath(req.body?.path);
  const device = normalizeDevice(req.body?.device);
  const trafficSource = normalizeSource(req.body?.source ?? req.body?.trafficSource);
  const country = countryFromRequest(req as any, req.body?.country);
  const event = String(req.body?.event ?? "visit").toLowerCase(); // visit | pageview | heartbeat
  const userId = req.userId ?? null;
  const isRegistered = !!userId;

  try {
    // Unique visitor per day (page refresh / heartbeat must NOT increment again).
    const inserted = await db
      .insert(siteVisitDedupeTable)
      .values({
        visitorKey,
        date,
        country,
        device,
        isRegistered,
        trafficSource,
      })
      .onConflictDoNothing()
      .returning({ visitorKey: siteVisitDedupeTable.visitorKey });

    const isNewUnique = inserted.length > 0;
    if (isNewUnique) {
      await db
        .insert(siteDailyVisitsTable)
        .values({
          date,
          visitCount: 1,
          guestVisitors: isRegistered ? 0 : 1,
          registeredVisitors: isRegistered ? 1 : 0,
        })
        .onConflictDoUpdate({
          target: siteDailyVisitsTable.date,
          set: {
            visitCount: sql`${siteDailyVisitsTable.visitCount} + 1`,
            guestVisitors: isRegistered
              ? siteDailyVisitsTable.guestVisitors
              : sql`${siteDailyVisitsTable.guestVisitors} + 1`,
            registeredVisitors: isRegistered
              ? sql`${siteDailyVisitsTable.registeredVisitors} + 1`
              : siteDailyVisitsTable.registeredVisitors,
          },
        });
    } else if (isRegistered) {
      // Promote guest→registered if they log in later same day (best-effort).
      await db.execute(sql`
        UPDATE site_visit_dedupe
        SET is_registered = TRUE
        WHERE visitor_key = ${visitorKey} AND date = ${date} AND is_registered = FALSE
      `);
    }

    // Upsert session — heartbeats / pageviews refresh last_seen without new unique visitor.
    const existingSession = await db
      .select({ sessionId: siteSessionsTable.sessionId, pageViews: siteSessionsTable.pageViews })
      .from(siteSessionsTable)
      .where(eq(siteSessionsTable.sessionId, sessionId))
      .limit(1);

    const isNewSession = existingSession.length === 0;
    const countPageView = event === "pageview" || event === "visit";

    if (isNewSession) {
      await db.insert(siteSessionsTable).values({
        sessionId,
        visitorKey,
        userId,
        isRegistered,
        country,
        device,
        trafficSource,
        landingPath: path,
        pageViews: countPageView ? 1 : 0,
        date,
      });
      await db
        .insert(siteDailyVisitsTable)
        .values({ date, visitCount: 0, sessionCount: 1, pageViewCount: countPageView ? 1 : 0 })
        .onConflictDoUpdate({
          target: siteDailyVisitsTable.date,
          set: {
            sessionCount: sql`${siteDailyVisitsTable.sessionCount} + 1`,
            pageViewCount: countPageView
              ? sql`${siteDailyVisitsTable.pageViewCount} + 1`
              : siteDailyVisitsTable.pageViewCount,
          },
        });
    } else {
      const patch: Record<string, unknown> = {
        lastSeenAt: sql`NOW()`,
      };
      if (userId) {
        patch.userId = userId;
        patch.isRegistered = true;
      }
      if (countPageView) {
        patch.pageViews = sql`${siteSessionsTable.pageViews} + 1`;
      }
      await db
        .update(siteSessionsTable)
        .set(patch as any)
        .where(eq(siteSessionsTable.sessionId, sessionId));
      if (countPageView) {
        await db
          .insert(siteDailyVisitsTable)
          .values({ date, visitCount: 0, pageViewCount: 1 })
          .onConflictDoUpdate({
            target: siteDailyVisitsTable.date,
            set: { pageViewCount: sql`${siteDailyVisitsTable.pageViewCount} + 1` },
          });
      }
    }

    if (countPageView) {
      await db.insert(sitePageViewsTable).values({
        sessionId,
        visitorKey,
        path,
        isProduct: isProductPath(path),
        date,
      });
    }

    res.json({
      ok: true,
      countedUnique: isNewUnique,
      newSession: isNewSession,
      date,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to record visit" });
  }
});

/**
 * Active sessions = last_seen within the last 5 minutes (guests + registered).
 */
export async function countActiveSessions(): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(siteSessionsTable)
      .where(sql`${siteSessionsTable.lastSeenAt} > NOW() - INTERVAL '5 minutes'`);
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

export async function getVisitorBreakdown(rangeStart: string, rangeEnd: string) {
  const [guestRow] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(siteVisitDedupeTable)
    .where(and(
      gte(siteVisitDedupeTable.date, rangeStart),
      sql`${siteVisitDedupeTable.date} <= ${rangeEnd}`,
      eq(siteVisitDedupeTable.isRegistered, false),
    ));
  const [regRow] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(siteVisitDedupeTable)
    .where(and(
      gte(siteVisitDedupeTable.date, rangeStart),
      sql`${siteVisitDedupeTable.date} <= ${rangeEnd}`,
      eq(siteVisitDedupeTable.isRegistered, true),
    ));

  const countries = await db.execute(sql`
    SELECT COALESCE(country, 'Unknown') AS country, COUNT(*)::int AS visitors
    FROM site_visit_dedupe
    WHERE date >= ${rangeStart} AND date <= ${rangeEnd}
    GROUP BY 1
    ORDER BY visitors DESC
    LIMIT 12
  `) as unknown as { rows: Array<{ country: string; visitors: number }> };

  const devices = await db.execute(sql`
    SELECT COALESCE(device, 'unknown') AS device, COUNT(*)::int AS visitors
    FROM site_visit_dedupe
    WHERE date >= ${rangeStart} AND date <= ${rangeEnd}
    GROUP BY 1
    ORDER BY visitors DESC
  `) as unknown as { rows: Array<{ device: string; visitors: number }> };

  const sources = await db.execute(sql`
    SELECT COALESCE(traffic_source, 'direct') AS source, COUNT(*)::int AS visitors
    FROM site_visit_dedupe
    WHERE date >= ${rangeStart} AND date <= ${rangeEnd}
    GROUP BY 1
    ORDER BY visitors DESC
  `) as unknown as { rows: Array<{ source: string; visitors: number }> };

  const [pv] = await db
    .select({ total: sql<number>`COALESCE(SUM(${siteDailyVisitsTable.pageViewCount}), 0)` })
    .from(siteDailyVisitsTable)
    .where(and(
      gte(siteDailyVisitsTable.date, rangeStart),
      sql`${siteDailyVisitsTable.date} <= ${rangeEnd}`,
    ));

  const [productViews] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(sitePageViewsTable)
    .where(and(
      gte(sitePageViewsTable.date, rangeStart),
      sql`${sitePageViewsTable.date} <= ${rangeEnd}`,
      eq(sitePageViewsTable.isProduct, true),
    ));

  return {
    guests: Number(guestRow?.total ?? 0),
    registered: Number(regRow?.total ?? 0),
    pageViews: Number(pv?.total ?? 0),
    productViews: Number(productViews?.total ?? 0),
    countries: countries.rows ?? [],
    devices: devices.rows ?? [],
    sources: sources.rows ?? [],
  };
}

export default router;
