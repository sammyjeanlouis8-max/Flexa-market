/**
 * Boost Analytics — owner-scoped campaign performance APIs.
 * Metrics use recorded counters / events only; unavailable metrics return null + available:false.
 */
import { Router } from "express";
import {
  db,
  boostsTable,
  listingsTable,
  boostDailyImpressionsTable,
  boostAnalyticsEventsTable,
  listingViewsTable,
  commentsTable,
  transactionsTable,
} from "@workspace/db";
import { and, eq, sql, gte, inArray, desc } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import {
  estimatedSpendUsd,
  metric,
  normalizeEventType,
  normalizeTrafficSource,
  recordBoostEvent,
  findActiveBoostForListing,
  BOOST_TRAFFIC_SOURCES,
  type BoostTrafficSource,
} from "../lib/boostAnalytics";
import { logger } from "../lib/logger";

const router = Router();

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days after last boost interaction

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

function parseRange(raw: unknown): { key: RangeKey; from: Date | null; to: Date } {
  const key = (String(raw ?? "30d") as RangeKey);
  const to = new Date();
  const startOfUtcDay = (d: Date) => {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  };
  if (key === "all") return { key, from: null, to };
  if (key === "today") return { key, from: startOfUtcDay(to), to };
  const days = key === "7d" ? 7 : key === "90d" ? 90 : 30;
  const from = startOfUtcDay(new Date(to.getTime() - (days - 1) * 86_400_000));
  return { key, from, to };
}

function resolveCampaignStatus(row: {
  paymentStatus: string;
  campaignStatus: string | null;
  expiresAt: Date;
  boostExpiresAt?: Date | null;
}, now: Date): string {
  const expired = row.expiresAt <= now || (!!row.boostExpiresAt && row.boostExpiresAt <= now);
  let status = row.campaignStatus || "pending";
  if (row.paymentStatus === "draft" || status === "draft") return "draft";
  if (row.paymentStatus === "pending") return "pending";
  if (row.paymentStatus === "rejected" || status === "rejected") return "rejected";
  if (row.paymentStatus === "cancelled" || status === "cancelled") return "cancelled";
  if (status === "paused" && row.paymentStatus === "paid" && !expired) return "paused";
  if (row.paymentStatus === "paid" && !expired) return "active";
  if (row.paymentStatus === "paid" && expired) return "expired";
  return status || "pending";
}

function pct(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

/** GET /api/boost-analytics — dashboard overview for the authenticated seller. */
router.get("/boost-analytics", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const range = parseRange(req.query.range);
  const statusFilter = String(req.query.status ?? "all").toLowerCase();
  const q = String(req.query.q ?? "").trim().toLowerCase();

  try {
    const now = new Date();
    const rows = await db
      .select({
        boostId: boostsTable.id,
        listingId: listingsTable.id,
        title: sql<string>`COALESCE(${boostsTable.adTitle}, ${listingsTable.title})`,
        thumbnail: sql<string | null>`COALESCE(${listingsTable.boostImageUrl}, ${listingsTable.images}[1])`,
        boostVideoUrl: listingsTable.boostVideoUrl,
        paymentStatus: boostsTable.paymentStatus,
        campaignStatus: boostsTable.campaignStatus,
        impressions: boostsTable.impressions,
        clicks: boostsTable.clicks,
        skips: boostsTable.skips,
        videoViews: boostsTable.videoViews,
        budget: boostsTable.budget,
        price: boostsTable.price,
        plan: boostsTable.plan,
        startsAt: boostsTable.startsAt,
        expiresAt: boostsTable.expiresAt,
        boostExpiresAt: listingsTable.boostExpiresAt,
        favoriteCount: listingsTable.favoriteCount,
        sharesCount: listingsTable.sharesCount,
        createdAt: boostsTable.createdAt,
      })
      .from(boostsTable)
      .innerJoin(listingsTable, eq(listingsTable.id, boostsTable.listingId))
      .where(eq(boostsTable.userId, userId))
      .orderBy(desc(boostsTable.createdAt))
      .limit(200);

    let campaigns = rows.map((r) => {
      const status = resolveCampaignStatus(r, now);
      const budget = Number(r.budget ?? r.price ?? 0);
      const impressions = r.impressions ?? 0;
      const spend = estimatedSpendUsd(impressions, budget);
      const clicks = r.clicks ?? 0;
      const videoViews = r.videoViews ?? 0;
      return {
        boostId: r.boostId,
        listingId: r.listingId,
        title: r.title,
        thumbnail: r.thumbnail,
        boostVideoUrl: r.boostVideoUrl,
        status,
        budget,
        spend,
        remainingBudget: Math.max(0, Math.round((budget - spend) * 100) / 100),
        impressions,
        clicks,
        skips: r.skips ?? 0,
        videoViews,
        likes: r.favoriteCount ?? 0,
        shares: r.sharesCount ?? 0,
        ctr: pct(clicks, impressions),
        cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : null,
        cpm: impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : null,
        startsAt: (r.startsAt ?? r.createdAt)?.toISOString() ?? null,
        endsAt: (r.boostExpiresAt ?? r.expiresAt)?.toISOString() ?? null,
        remainingMs:
          status === "active"
            ? Math.max(0, (r.boostExpiresAt ?? r.expiresAt).getTime() - now.getTime())
            : 0,
      };
    });

    if (statusFilter && statusFilter !== "all") {
      campaigns = campaigns.filter((c) => c.status === statusFilter);
    }
    if (q) {
      campaigns = campaigns.filter((c) => c.title.toLowerCase().includes(q));
    }

    const paid = campaigns.filter((c) => ["active", "paused", "expired", "completed"].includes(c.status) || c.impressions > 0 || c.spend > 0);
    const totalImpressions = paid.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = paid.reduce((s, c) => s + c.clicks, 0);
    const totalViews = paid.reduce((s, c) => s + c.videoViews, 0);
    const totalSpend = Math.round(paid.reduce((s, c) => s + c.spend, 0) * 100) / 100;
    const totalLikes = paid.reduce((s, c) => s + c.likes, 0);
    const totalShares = paid.reduce((s, c) => s + c.shares, 0);

    const listingIds = [...new Set(paid.map((c) => c.listingId))];
    let totalComments = 0;
    let uniqueViewers: number | null = null;
    let attributedRevenue = 0;
    let purchases = 0;

    if (listingIds.length > 0) {
      const [commentRow] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(commentsTable)
        .where(inArray(commentsTable.listingId, listingIds));
      totalComments = Number(commentRow?.n ?? 0);

      const viewConds = [inArray(listingViewsTable.listingId, listingIds)];
      if (range.from) viewConds.push(gte(listingViewsTable.viewedAt, range.from));
      const [uv] = await db
        .select({ n: sql<number>`COUNT(DISTINCT ${listingViewsTable.ipHash})::int` })
        .from(listingViewsTable)
        .where(and(...viewConds));
      uniqueViewers = Number(uv?.n ?? 0);

      // Attributed purchases: paid purchase txs for boosted listings within campaign window ∪ 7d after end
      const purchaseRows = await db
        .select({
          listingId: transactionsTable.listingId,
          amount: transactionsTable.amount,
          createdAt: transactionsTable.createdAt,
          paymentStatus: transactionsTable.paymentStatus,
          orderStatus: transactionsTable.orderStatus,
        })
        .from(transactionsTable)
        .where(
          and(
            inArray(transactionsTable.listingId, listingIds),
            eq(transactionsTable.type, "purchase"),
            eq(transactionsTable.paymentStatus, "paid"),
            sql`COALESCE(${transactionsTable.orderStatus}, '') NOT IN ('cancelled', 'refunded', 'failed')`,
          ),
        );

      const windowByListing = new Map<number, { start: number; end: number }>();
      for (const c of paid) {
        const start = c.startsAt ? new Date(c.startsAt).getTime() : 0;
        const end = (c.endsAt ? new Date(c.endsAt).getTime() : now.getTime()) + ATTRIBUTION_WINDOW_MS;
        const prev = windowByListing.get(c.listingId);
        if (!prev) windowByListing.set(c.listingId, { start, end });
        else windowByListing.set(c.listingId, { start: Math.min(prev.start, start), end: Math.max(prev.end, end) });
      }

      for (const p of purchaseRows) {
        if (!p.listingId) continue;
        const w = windowByListing.get(p.listingId);
        if (!w) continue;
        const t = p.createdAt.getTime();
        if (t >= w.start && t <= w.end) {
          purchases += 1;
          attributedRevenue += Number(p.amount ?? 0);
        }
      }
      attributedRevenue = Math.round(attributedRevenue * 100) / 100;
    }

    // Daily series from boost_daily_impressions for owned boosts
    const boostIds = campaigns.map((c) => c.boostId);
    let series: Array<{ date: string; impressions: number; clicks: number; videoViews: number }> = [];
    if (boostIds.length > 0) {
      const dayConds = [inArray(boostDailyImpressionsTable.boostId, boostIds)];
      if (range.from) {
        dayConds.push(gte(boostDailyImpressionsTable.date, range.from.toISOString().slice(0, 10)));
      }
      const daily = await db
        .select({
          date: boostDailyImpressionsTable.date,
          impressions: sql<number>`COALESCE(SUM(${boostDailyImpressionsTable.impressionCount}), 0)::int`,
        })
        .from(boostDailyImpressionsTable)
        .where(and(...dayConds))
        .groupBy(boostDailyImpressionsTable.date)
        .orderBy(boostDailyImpressionsTable.date);

      const eventConds = [
        inArray(boostAnalyticsEventsTable.boostId, boostIds),
        inArray(boostAnalyticsEventsTable.eventType, ["product_click", "video_view"]),
      ];
      if (range.from) eventConds.push(gte(boostAnalyticsEventsTable.createdAt, range.from));
      const eventDaily = await db
        .select({
          date: sql<string>`(${boostAnalyticsEventsTable.createdAt})::date::text`,
          clicks: sql<number>`COUNT(*) FILTER (WHERE ${boostAnalyticsEventsTable.eventType} = 'product_click')::int`,
          videoViews: sql<number>`COUNT(*) FILTER (WHERE ${boostAnalyticsEventsTable.eventType} = 'video_view')::int`,
        })
        .from(boostAnalyticsEventsTable)
        .where(and(...eventConds))
        .groupBy(sql`(${boostAnalyticsEventsTable.createdAt})::date`)
        .orderBy(sql`(${boostAnalyticsEventsTable.createdAt})::date`);

      const byDate = new Map<string, { impressions: number; clicks: number; videoViews: number }>();
      for (const d of daily) {
        byDate.set(d.date, { impressions: Number(d.impressions), clicks: 0, videoViews: 0 });
      }
      for (const e of eventDaily) {
        const cur = byDate.get(e.date) ?? { impressions: 0, clicks: 0, videoViews: 0 };
        cur.clicks = Number(e.clicks);
        cur.videoViews = Number(e.videoViews);
        byDate.set(e.date, cur);
      }
      series = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));
    }

    // Traffic sources from recorded events only
    let trafficSources: Array<{ source: BoostTrafficSource; count: number; pct: number }> = [];
    if (boostIds.length > 0) {
      const srcConds = [
        inArray(boostAnalyticsEventsTable.boostId, boostIds),
        eq(boostAnalyticsEventsTable.eventType, "impression"),
      ];
      if (range.from) srcConds.push(gte(boostAnalyticsEventsTable.createdAt, range.from));
      const srcRows = await db
        .select({
          source: boostAnalyticsEventsTable.source,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(boostAnalyticsEventsTable)
        .where(and(...srcConds))
        .groupBy(boostAnalyticsEventsTable.source);
      const totalSrc = srcRows.reduce((s, r) => s + Number(r.count), 0);
      trafficSources = BOOST_TRAFFIC_SOURCES.map((source) => {
        const count = Number(srcRows.find((r) => r.source === source)?.count ?? 0);
        return { source, count, pct: totalSrc > 0 ? Math.round((count / totalSrc) * 1000) / 10 : 0 };
      }).filter((r) => r.count > 0);
    }

    const conversionRate = pct(purchases, totalClicks);
    const roas = totalSpend > 0 ? Math.round((attributedRevenue / totalSpend) * 100) / 100 : null;

    res.json({
      range: {
        key: range.key,
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      attributionWindowDays: 7,
      summary: {
        totalBoostSpend: metric(totalSpend, true, "Estimated from delivered impressions ($1 ≈ 200 impressions), capped at campaign budget"),
        totalVideoViews: metric(totalViews, true),
        uniqueViewers: metric(uniqueViewers, uniqueViewers != null, "Distinct listing-view sessions on boosted products"),
        totalImpressions: metric(totalImpressions, true),
        totalLikes: metric(totalLikes, true, "Listing favorites (hearts)"),
        totalComments: metric(totalComments, true),
        totalShares: metric(totalShares, true),
        totalSaves: metric(totalLikes, true, "Same as likes/favorites in Flexa Market"),
        productClicks: metric(totalClicks, true),
        addToCartEvents: metric(null, false, "Add-to-cart attribution is not recorded yet"),
        purchases: metric(purchases, true, "Paid purchases of boosted products within campaign + 7-day window; cancelled/refunded excluded"),
        attributedRevenue: metric(attributedRevenue, true, "Gross paid purchase amount in attribution window"),
        clickThroughRate: metric(pct(totalClicks, totalImpressions), totalImpressions > 0),
        conversionRate: metric(conversionRate, totalClicks > 0),
        costPerClick: metric(totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : null, totalClicks > 0 && totalSpend > 0),
        costPerMille: metric(totalImpressions > 0 ? Math.round((totalSpend / totalImpressions) * 1000 * 100) / 100 : null, totalImpressions > 0 && totalSpend > 0),
        returnOnAdSpend: metric(roas, totalSpend > 0 && attributedRevenue > 0),
        totalWatchTime: metric(null, false, "Watch-time tracking not enabled yet"),
        averageWatchDuration: metric(null, false),
        videoCompletionRate: metric(null, false),
        retention3s: metric(null, false),
        retention5s: metric(null, false),
        completion25: metric(null, false),
        completion50: metric(null, false),
        completion75: metric(null, false),
        completion100: metric(null, false),
        newFollowers: metric(null, false, "Follower attribution not measured yet"),
      },
      series,
      trafficSources,
      trafficSourcesAvailable: trafficSources.length > 0,
      searchTerms: [] as Array<{ query: string; count: number; pct: number }>,
      searchTermsAvailable: false,
      searchTermsNote: "Search-to-boost attribution requires recorded search-source events",
      audience: {
        available: false,
        note: "Audience breakdowns require privacy-safe aggregated device/geo events",
        countries: [] as Array<{ key: string; count: number; pct: number }>,
        devices: [] as Array<{ key: string; count: number; pct: number }>,
      },
      campaigns,
      definitions: {
        impression: "Boosted video became the active card in a feed placement",
        videoView: "Qualified video view recorded via booster/video events",
        productClick: "Buy / product overlay click on a boosted video",
        spend: "Estimated delivery cost from impressions; not invented schedule spend",
        unavailable: "Shown as Not available when no recorded events exist for that metric",
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /boost-analytics failed");
    res.status(500).json({ error: "Failed to load boost analytics" });
  }
});

/** GET /api/boost-analytics/:boostId — single campaign analytics (owner only). */
router.get("/boost-analytics/:boostId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const boostId = parseInt(String(req.params.boostId), 10);
  if (!boostId) { res.status(400).json({ error: "Invalid boost id" }); return; }

  try {
    const now = new Date();
    const [row] = await db
      .select({
        boostId: boostsTable.id,
        listingId: listingsTable.id,
        title: sql<string>`COALESCE(${boostsTable.adTitle}, ${listingsTable.title})`,
        thumbnail: sql<string | null>`COALESCE(${listingsTable.boostImageUrl}, ${listingsTable.images}[1])`,
        boostVideoUrl: listingsTable.boostVideoUrl,
        productTitle: listingsTable.title,
        productPrice: listingsTable.price,
        paymentStatus: boostsTable.paymentStatus,
        campaignStatus: boostsTable.campaignStatus,
        impressions: boostsTable.impressions,
        clicks: boostsTable.clicks,
        skips: boostsTable.skips,
        videoViews: boostsTable.videoViews,
        budget: boostsTable.budget,
        price: boostsTable.price,
        plan: boostsTable.plan,
        startsAt: boostsTable.startsAt,
        expiresAt: boostsTable.expiresAt,
        boostExpiresAt: listingsTable.boostExpiresAt,
        favoriteCount: listingsTable.favoriteCount,
        sharesCount: listingsTable.sharesCount,
        createdAt: boostsTable.createdAt,
      })
      .from(boostsTable)
      .innerJoin(listingsTable, eq(listingsTable.id, boostsTable.listingId))
      .where(and(eq(boostsTable.id, boostId), eq(boostsTable.userId, userId)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Campaign not found" }); return; }

    const status = resolveCampaignStatus(row, now);
    const budget = Number(row.budget ?? row.price ?? 0);
    const impressions = row.impressions ?? 0;
    const spend = estimatedSpendUsd(impressions, budget);
    const clicks = row.clicks ?? 0;
    const videoViews = row.videoViews ?? 0;

    const [commentRow] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(commentsTable)
      .where(eq(commentsTable.listingId, row.listingId));

    const [uv] = await db
      .select({ n: sql<number>`COUNT(DISTINCT ${listingViewsTable.ipHash})::int` })
      .from(listingViewsTable)
      .where(eq(listingViewsTable.listingId, row.listingId));

    const daily = await db
      .select({
        date: boostDailyImpressionsTable.date,
        impressions: boostDailyImpressionsTable.impressionCount,
      })
      .from(boostDailyImpressionsTable)
      .where(eq(boostDailyImpressionsTable.boostId, boostId))
      .orderBy(boostDailyImpressionsTable.date);

    const srcRows = await db
      .select({
        source: boostAnalyticsEventsTable.source,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(boostAnalyticsEventsTable)
      .where(
        and(
          eq(boostAnalyticsEventsTable.boostId, boostId),
          eq(boostAnalyticsEventsTable.eventType, "impression"),
        ),
      )
      .groupBy(boostAnalyticsEventsTable.source);
    const totalSrc = srcRows.reduce((s, r) => s + Number(r.count), 0);
    const trafficSources = BOOST_TRAFFIC_SOURCES.map((source) => {
      const count = Number(srcRows.find((r) => r.source === source)?.count ?? 0);
      return { source, count, pct: totalSrc > 0 ? Math.round((count / totalSrc) * 1000) / 10 : 0 };
    }).filter((r) => r.count > 0);

    const engagementByDay = await db
      .select({
        date: sql<string>`(${boostAnalyticsEventsTable.createdAt})::date::text`,
        likes: sql<number>`COUNT(*) FILTER (WHERE ${boostAnalyticsEventsTable.eventType} = 'save')::int`,
        shares: sql<number>`COUNT(*) FILTER (WHERE ${boostAnalyticsEventsTable.eventType} = 'share')::int`,
        clicks: sql<number>`COUNT(*) FILTER (WHERE ${boostAnalyticsEventsTable.eventType} = 'product_click')::int`,
        views: sql<number>`COUNT(*) FILTER (WHERE ${boostAnalyticsEventsTable.eventType} = 'video_view')::int`,
      })
      .from(boostAnalyticsEventsTable)
      .where(eq(boostAnalyticsEventsTable.boostId, boostId))
      .groupBy(sql`(${boostAnalyticsEventsTable.createdAt})::date`)
      .orderBy(sql`(${boostAnalyticsEventsTable.createdAt})::date`);

    const start = (row.startsAt ?? row.createdAt).getTime();
    const end = (row.boostExpiresAt ?? row.expiresAt).getTime() + ATTRIBUTION_WINDOW_MS;
    const purchaseRows = await db
      .select({
        amount: transactionsTable.amount,
        createdAt: transactionsTable.createdAt,
        orderStatus: transactionsTable.orderStatus,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.listingId, row.listingId),
          eq(transactionsTable.type, "purchase"),
          eq(transactionsTable.paymentStatus, "paid"),
          sql`COALESCE(${transactionsTable.orderStatus}, '') NOT IN ('cancelled', 'refunded', 'failed')`,
        ),
      );
    let purchases = 0;
    let attributedRevenue = 0;
    for (const p of purchaseRows) {
      const t = p.createdAt.getTime();
      if (t >= start && t <= end) {
        purchases += 1;
        attributedRevenue += Number(p.amount ?? 0);
      }
    }
    attributedRevenue = Math.round(attributedRevenue * 100) / 100;

    const searchRows = await db
      .select({
        query: boostAnalyticsEventsTable.searchQuery,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(boostAnalyticsEventsTable)
      .where(
        and(
          eq(boostAnalyticsEventsTable.boostId, boostId),
          sql`${boostAnalyticsEventsTable.searchQuery} IS NOT NULL`,
          sql`length(trim(${boostAnalyticsEventsTable.searchQuery})) > 0`,
        ),
      )
      .groupBy(boostAnalyticsEventsTable.searchQuery)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(20);
    const searchTotal = searchRows.reduce((s, r) => s + Number(r.count), 0);

    const audienceCountries = await db
      .select({
        key: boostAnalyticsEventsTable.country,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(boostAnalyticsEventsTable)
      .where(
        and(
          eq(boostAnalyticsEventsTable.boostId, boostId),
          sql`${boostAnalyticsEventsTable.country} IS NOT NULL`,
        ),
      )
      .groupBy(boostAnalyticsEventsTable.country)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(12);

    const audienceDevices = await db
      .select({
        key: boostAnalyticsEventsTable.device,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(boostAnalyticsEventsTable)
      .where(
        and(
          eq(boostAnalyticsEventsTable.boostId, boostId),
          sql`${boostAnalyticsEventsTable.device} IS NOT NULL`,
        ),
      )
      .groupBy(boostAnalyticsEventsTable.device)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(8);

    const audienceTotal = audienceCountries.reduce((s, r) => s + Number(r.count), 0)
      + audienceDevices.reduce((s, r) => s + Number(r.count), 0);

    res.json({
      campaign: {
        boostId: row.boostId,
        listingId: row.listingId,
        title: row.title,
        thumbnail: row.thumbnail,
        boostVideoUrl: row.boostVideoUrl,
        product: { title: row.productTitle, price: row.productPrice },
        status,
        budget,
        spend,
        remainingBudget: Math.max(0, Math.round((budget - spend) * 100) / 100),
        plan: row.plan,
        startsAt: (row.startsAt ?? row.createdAt)?.toISOString() ?? null,
        endsAt: (row.boostExpiresAt ?? row.expiresAt)?.toISOString() ?? null,
        remainingMs:
          status === "active"
            ? Math.max(0, (row.boostExpiresAt ?? row.expiresAt).getTime() - now.getTime())
            : 0,
        canRenew: status === "expired" || status === "completed",
      },
      overview: {
        videoViews: metric(videoViews, true),
        impressions: metric(impressions, true),
        uniqueViewers: metric(Number(uv?.n ?? 0), true),
        productClicks: metric(clicks, true),
        likes: metric(row.favoriteCount ?? 0, true),
        comments: metric(Number(commentRow?.n ?? 0), true),
        shares: metric(row.sharesCount ?? 0, true),
        skips: metric(row.skips ?? 0, true),
        ctr: metric(pct(clicks, impressions), impressions > 0),
        spend: metric(spend, true),
        totalWatchTime: metric(null, false),
        averageWatchDuration: metric(null, false),
        videoCompletionRate: metric(null, false),
        retention3s: metric(null, false),
        retention5s: metric(null, false),
        completion25: metric(null, false),
        completion50: metric(null, false),
        completion75: metric(null, false),
        completion100: metric(null, false),
        newFollowers: metric(null, false),
      },
      series: daily.map((d) => ({
        date: d.date,
        impressions: d.impressions,
      })),
      engagementSeries: engagementByDay,
      trafficSources,
      trafficSourcesAvailable: trafficSources.length > 0,
      searchTerms: searchRows.map((r) => ({
        query: String(r.query),
        count: Number(r.count),
        pct: searchTotal > 0 ? Math.round((Number(r.count) / searchTotal) * 1000) / 10 : 0,
      })),
      searchTermsAvailable: searchRows.length > 0,
      audience: {
        available: audienceTotal > 0,
        countries: audienceCountries
          .filter((r) => r.key)
          .map((r) => ({
            key: String(r.key),
            count: Number(r.count),
            pct: audienceCountries.reduce((s, x) => s + Number(x.count), 0) > 0
              ? Math.round((Number(r.count) / audienceCountries.reduce((s, x) => s + Number(x.count), 0)) * 1000) / 10
              : 0,
          })),
        devices: audienceDevices
          .filter((r) => r.key)
          .map((r) => ({
            key: String(r.key),
            count: Number(r.count),
            pct: audienceDevices.reduce((s, x) => s + Number(x.count), 0) > 0
              ? Math.round((Number(r.count) / audienceDevices.reduce((s, x) => s + Number(x.count), 0)) * 1000) / 10
              : 0,
          })),
        note: audienceTotal > 0
          ? "Aggregated from recorded events only"
          : "Audience breakdowns appear once geo/device events are recorded",
      },
      sales: {
        productClicks: metric(clicks, true),
        addToCartEvents: metric(null, false),
        checkoutStarts: metric(null, false),
        purchases: metric(purchases, true),
        attributedRevenue: metric(attributedRevenue, true),
        conversionRate: metric(pct(purchases, clicks), clicks > 0),
        costPerPurchase: metric(
          purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : null,
          purchases > 0 && spend > 0,
        ),
        returnOnAdSpend: metric(
          spend > 0 && attributedRevenue > 0 ? Math.round((attributedRevenue / spend) * 100) / 100 : null,
          spend > 0 && attributedRevenue > 0,
        ),
        attributionWindowDays: 7,
      },
    });
  } catch (err) {
    logger.error({ err, boostId }, "GET /boost-analytics/:id failed");
    res.status(500).json({ error: "Failed to load campaign analytics" });
  }
});

/**
 * POST /api/boost-analytics/events
 * Optional-auth event intake for impressions, views, clicks, watch progress, etc.
 */
router.post("/boost-analytics/events", optionalAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.body?.listingId ?? ""), 10);
  const eventType = normalizeEventType(req.body?.type ?? req.body?.eventType);
  if (!listingId || !eventType) {
    res.status(400).json({ error: "listingId and type required" });
    return;
  }

  try {
    let boostId = parseInt(String(req.body?.boostId ?? ""), 10);
    if (!boostId) {
      const active = await findActiveBoostForListing(listingId);
      if (!active) { res.status(404).json({ error: "No active boost" }); return; }
      boostId = active.id;
    } else {
      const [owned] = await db
        .select({ id: boostsTable.id, listingId: boostsTable.listingId })
        .from(boostsTable)
        .where(and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId)))
        .limit(1);
      if (!owned) { res.status(404).json({ error: "Boost not found" }); return; }
    }

    const { inserted } = await recordBoostEvent({
      boostId,
      listingId,
      eventType,
      source: normalizeTrafficSource(req.body?.source),
      viewerKey: typeof req.body?.viewerKey === "string" ? req.body.viewerKey : null,
      viewerUserId: req.userId ?? null,
      country: typeof req.body?.country === "string" ? req.body.country : null,
      region: typeof req.body?.region === "string" ? req.body.region : null,
      device: typeof req.body?.device === "string" ? req.body.device : null,
      progressMarker: Number.isFinite(Number(req.body?.progressMarker))
        ? Number(req.body.progressMarker)
        : null,
      watchMs: Number.isFinite(Number(req.body?.watchMs)) ? Number(req.body.watchMs) : null,
      amountUsd: Number.isFinite(Number(req.body?.amountUsd)) ? Number(req.body.amountUsd) : null,
      searchQuery: typeof req.body?.searchQuery === "string" ? req.body.searchQuery : null,
      dedupeKey: typeof req.body?.dedupeKey === "string" ? req.body.dedupeKey : null,
      bumpCounters: true,
    });

    res.json({ ok: true, counted: inserted });
  } catch (err) {
    logger.warn({ err }, "POST /boost-analytics/events failed");
    res.status(500).json({ error: "Failed to record event" });
  }
});

export default router;
