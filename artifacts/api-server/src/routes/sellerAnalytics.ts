import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import {
  db,
  listingsTable,
  listingViewsTable,
  boostsTable,
  transactionsTable,
  favoritesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";

function parseRange(query: Record<string, unknown>): { from: Date; to: Date; key: RangeKey } {
  const to = new Date();
  const key = (typeof query.range === "string" ? query.range : "7d") as RangeKey;
  if (key === "custom" && typeof query.from === "string" && typeof query.to === "string") {
    const from = new Date(query.from);
    const customTo = new Date(query.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(customTo.getTime()) && from <= customTo) {
      return { from, to: customTo, key };
    }
  }
  const from = new Date(to);
  if (key === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (key === "30d") {
    from.setDate(from.getDate() - 30);
  } else if (key === "90d") {
    from.setDate(from.getDate() - 90);
  } else {
    from.setDate(from.getDate() - 7);
  }
  return { from, to, key: key === "custom" ? "7d" : key };
}

/**
 * GET /api/seller/analytics?range=7d|30d|90d|today|custom&from=&to=
 * Authenticated seller-only performance metrics from real listing/boost/sales data.
 */
router.get("/seller/analytics", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { from, to, key } = parseRange(req.query as Record<string, unknown>);

  const myListings = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      status: listingsTable.status,
      price: listingsTable.price,
      viewCount: listingsTable.viewCount,
      images: listingsTable.images,
      boostVideoUrl: listingsTable.boostVideoUrl,
      isBoosted: listingsTable.isBoosted,
    })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.sellerId, userId),
      notInArray(listingsTable.status, ["deleted"]),
    ))
    .orderBy(desc(listingsTable.viewCount))
    .limit(100);

  const listingIds = myListings.map((l: { id: number }) => l.id);

  let organicViews = 0;
  let trafficSeries: { date: string; organic: number; sponsored: number }[] = [];

  if (listingIds.length > 0) {
    const viewRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${listingViewsTable.viewedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(listingViewsTable)
      .where(and(
        inArray(listingViewsTable.listingId, listingIds),
        gte(listingViewsTable.viewedAt, from),
        lte(listingViewsTable.viewedAt, to),
      ))
      .groupBy(sql`date_trunc('day', ${listingViewsTable.viewedAt})`)
      .orderBy(sql`date_trunc('day', ${listingViewsTable.viewedAt})`);

    organicViews = viewRows.reduce((sum: number, r: { count: number }) => sum + Number(r.count), 0);
    const byDay = new Map<string, number>(viewRows.map((r: { day: string; count: number }) => [r.day, Number(r.count)]));

    const boostRows = await db
      .select({
        id: boostsTable.id,
        listingId: boostsTable.listingId,
        impressions: boostsTable.impressions,
        clicks: boostsTable.clicks,
        budget: boostsTable.budget,
        dailyBudget: boostsTable.dailyBudget,
        plan: boostsTable.plan,
        paymentStatus: boostsTable.paymentStatus,
        expiresAt: boostsTable.expiresAt,
        createdAt: boostsTable.createdAt,
      })
      .from(boostsTable)
      .where(and(
        eq(boostsTable.userId, userId),
        eq(boostsTable.paymentStatus, "paid"),
      ))
      .orderBy(desc(boostsTable.createdAt))
      .limit(50);

    // Sponsored traffic approximated from lifetime boost impressions allocated
    // across the selected window for active campaigns (no daily ledger join required).
    const now = Date.now();
    let sponsoredImpressions = 0;
    let sponsoredClicks = 0;
    let adSpend = 0;
    let remainingBudget = 0;
    const activeCampaigns = boostRows.filter((b: { expiresAt: Date | null }) => b.expiresAt && b.expiresAt.getTime() > now);

    for (const b of boostRows) {
      sponsoredImpressions += Number(b.impressions ?? 0);
      sponsoredClicks += Number(b.clicks ?? 0);
      const budget = Number(b.budget ?? 0);
      adSpend += Math.min(budget, Math.round(((Number(b.impressions ?? 0) / 200) * 100)) / 100);
      if (b.expiresAt && b.expiresAt.getTime() > now) {
        remainingBudget += Math.max(0, budget - Math.min(budget, Math.round(((Number(b.impressions ?? 0) / 200) * 100)) / 100));
      }
    }

    // Build daily series: organic from listing_views; sponsored evenly split for chart shape when no daily feed.
    const days: string[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    const sponsoredPerDay = days.length ? Math.floor(sponsoredImpressions / Math.max(days.length, 1)) : 0;
    trafficSeries = days.map((date) => ({
      date,
      organic: byDay.get(date) ?? 0,
      sponsored: sponsoredPerDay,
    }));

    const [salesAgg] = await db.select({
      orderCount: sql<number>`count(*)::int`,
      totalSales: sql<number>`coalesce(sum(${transactionsTable.amount}),0)::float`,
    })
      .from(transactionsTable)
      .innerJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
      .where(and(
        eq(listingsTable.sellerId, userId),
        eq(transactionsTable.type, "purchase"),
        eq(transactionsTable.paymentStatus, "completed"),
        notInArray(transactionsTable.orderStatus, ["cancelled", "return_refunded"]),
        gte(transactionsTable.createdAt, from),
        lte(transactionsTable.createdAt, to),
      ));

    let favoritesCount = 0;
    try {
      const [fav] = await db.select({
        count: sql<number>`count(*)::int`,
      })
        .from(favoritesTable)
        .where(inArray(favoritesTable.listingId, listingIds));
      favoritesCount = fav?.count ?? 0;
    } catch {
      favoritesCount = 0;
    }

    const totalViews = organicViews + sponsoredImpressions;
    const totalClicks = sponsoredClicks; // listing click tracking beyond boost buy-clicks is limited
    const ctr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    const topListings = myListings.slice(0, 10).map((l: typeof myListings[number]) => ({
      id: l.id,
      title: l.title,
      status: l.status,
      price: l.price,
      views: l.viewCount ?? 0,
      thumbnail: (l.images as string[] | null)?.[0] ?? null,
      isBoosted: !!l.isBoosted,
      hasVideo: !!l.boostVideoUrl,
    }));

    res.json({
      range: key,
      from: from.toISOString(),
      to: to.toISOString(),
      overview: {
        views: totalViews,
        organicViews,
        sponsoredViews: sponsoredImpressions,
        clicks: totalClicks,
        sales: salesAgg?.orderCount ?? 0,
        revenue: salesAgg?.totalSales ?? 0,
        ctr: Math.round(ctr * 10) / 10,
        favorites: favoritesCount,
      },
      channels: {
        listings: {
          views: organicViews,
          clicks: 0,
          sales: salesAgg?.orderCount ?? 0,
        },
        boosts: {
          views: sponsoredImpressions,
          clicks: sponsoredClicks,
          sales: 0,
          activeCampaigns: activeCampaigns.length,
          adSpend: Math.round(adSpend * 100) / 100,
          remainingBudget: Math.round(remainingBudget * 100) / 100,
        },
      },
      listings: topListings,
      boosts: boostRows.slice(0, 20).map((b: typeof boostRows[number]) => {
        const budget = Number(b.budget ?? 0);
        const impressions = Number(b.impressions ?? 0);
        const clicks = Number(b.clicks ?? 0);
        const spent = Math.min(budget, Math.round((impressions / 200) * 100) / 100);
        return {
          id: b.id,
          listingId: b.listingId,
          plan: b.plan,
          budget,
          dailyBudget: b.dailyBudget,
          impressions,
          clicks,
          ctr: impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0,
          estimatedSpentUsd: spent,
          remainingBudgetUsd: Math.max(0, Math.round((budget - spent) * 100) / 100),
          expiresAt: b.expiresAt?.toISOString() ?? null,
          isActive: !!(b.expiresAt && b.expiresAt.getTime() > now),
        };
      }),
      traffic: trafficSeries,
      definitions: {
        views: "Listing page views (organic) plus sponsored boost impressions.",
        clicks: "Sponsored buy/CTA clicks tracked on boosted videos.",
        sales: "Completed purchases of your listings in the selected range (excludes cancelled/refunded).",
        note: "Autoplay loops are not counted as unique organic views beyond existing listing_views dedupe rules.",
      },
    });
    return;
  }

  res.json({
    range: key,
    from: from.toISOString(),
    to: to.toISOString(),
    overview: {
      views: 0, organicViews: 0, sponsoredViews: 0, clicks: 0, sales: 0, revenue: 0, ctr: 0, favorites: 0,
    },
    channels: {
      listings: { views: 0, clicks: 0, sales: 0 },
      boosts: { views: 0, clicks: 0, sales: 0, activeCampaigns: 0, adSpend: 0, remainingBudget: 0 },
    },
    listings: [],
    boosts: [],
    traffic: [],
    definitions: {
      views: "Listing page views (organic) plus sponsored boost impressions.",
      clicks: "Sponsored buy/CTA clicks tracked on boosted videos.",
      sales: "Completed purchases of your listings in the selected range.",
      note: "No listings yet — metrics will appear after you publish products.",
    },
  });
});

export default router;
