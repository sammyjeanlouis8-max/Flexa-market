/**
 * Booster Pro Max — saved audiences, pause/resume, analytics, ad events.
 * Extends the core boost payment/delivery stack without replacing it.
 */
import { Router } from "express";
import {
  db,
  boostsTable,
  listingsTable,
  savedAudiencesTable,
  boostAdEventsTable,
  boostDailyImpressionsTable,
} from "@workspace/db";
import { and, desc, eq, gte, sql, inArray } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import {
  validateAudience,
  HAITI_DEPARTMENTS,
  MIN_RADIUS_KM,
  MAX_RADIUS_KM,
  PLAN_META,
  type Plan,
} from "../lib/boostTargeting";
import { coordsForCity } from "../lib/haitiGeo";
import { logger } from "../lib/logger";

const router = Router();

const eventLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many ad events. Try again shortly." },
});

const VALID_EVENT_TYPES = [
  "impression",
  "video_start",
  "video_complete",
  "ten_sec_view",
  "skip",
  "click",
  "message",
] as const;
type AdEventType = (typeof VALID_EVENT_TYPES)[number];

const COUNTER_COLUMN: Record<AdEventType, keyof typeof boostsTable.$inferSelect | null> = {
  impression: "impressions",
  video_start: "videoStarts",
  video_complete: "videoCompletions",
  ten_sec_view: "tenSecViews",
  skip: "skips",
  click: "clicks",
  message: "messages",
};

function serializeAudience(row: typeof savedAudiencesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    audienceType: row.audienceType,
    country: row.country,
    state: row.state,
    city: row.city,
    cities: row.cities ?? (row.city ? [row.city] : []),
    neighborhood: row.neighborhood,
    radiusKm: row.radiusKm,
    ageMin: row.ageMin,
    ageMax: row.ageMax,
    gender: row.gender,
    interests: row.interests ?? [],
    objective: row.objective,
    centerLatitude: row.centerLatitude,
    centerLongitude: row.centerLongitude,
    isActive: row.isActive,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

// ── Geo reference for Booster Pro UI ─────────────────────────────────────────
router.get("/booster/geo/haiti", requireAuth, async (_req, res): Promise<void> => {
  res.json({
    departments: HAITI_DEPARTMENTS,
    radius: { minKm: MIN_RADIUS_KM, maxKm: MAX_RADIUS_KM, defaultKm: 25 },
  });
});

// ── Saved audiences CRUD ─────────────────────────────────────────────────────
router.get("/booster/audiences", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const activeOnly = String(req.query.active ?? "") === "1";
  const conds = [eq(savedAudiencesTable.userId, userId)];
  if (activeOnly) conds.push(eq(savedAudiencesTable.isActive, true));

  const rows = await db
    .select()
    .from(savedAudiencesTable)
    .where(and(...conds))
    .orderBy(desc(savedAudiencesTable.updatedAt));

  res.json({ audiences: rows.map(serializeAudience) });
});

router.post("/booster/audiences", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 100) : "";
  if (!name) { res.status(400).json({ error: "Audience name required" }); return; }

  const country = typeof req.body?.country === "string"
    ? req.body.country.trim()
    : (req.user?.country ?? "");
  const check = validateAudience(
    { ...req.body, country, audienceName: name },
    req.user?.isSuperAdmin ? country : req.user?.country,
  );
  if (!check.ok) { res.status(400).json({ error: check.error }); return; }
  const a = check.audience;

  const cities = a.cities ?? (a.city ? [a.city] : []);
  const primaryCity = cities[0] ?? null;
  const center = primaryCity ? coordsForCity(primaryCity) : null;

  const [row] = await db
    .insert(savedAudiencesTable)
    .values({
      userId,
      name,
      audienceType: a.audienceType ?? "custom",
      country: a.country,
      state: a.state ?? null,
      city: primaryCity,
      cities: cities.length ? cities : null,
      neighborhood: a.neighborhood ?? null,
      radiusKm: a.radiusKm ?? null,
      ageMin: a.ageMin ?? 18,
      ageMax: a.ageMax ?? 65,
      gender: a.gender ?? "all",
      objective: a.objective ?? "auto",
      centerLatitude: center?.lat ?? null,
      centerLongitude: center?.lng ?? null,
      isActive: true,
    })
    .returning();

  res.status(201).json({ audience: serializeAudience(row) });
});

router.patch("/booster/audiences/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid audience id" }); return; }

  const [existing] = await db
    .select()
    .from(savedAudiencesTable)
    .where(and(eq(savedAudiencesTable.id, id), eq(savedAudiencesTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Audience not found" }); return; }

  const patch: Partial<typeof savedAudiencesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof req.body?.name === "string" && req.body.name.trim()) {
    patch.name = req.body.name.trim().slice(0, 100);
  }
  if (typeof req.body?.isActive === "boolean") {
    patch.isActive = req.body.isActive;
  }

  // Full audience retarget when audience fields present
  if (req.body?.country || req.body?.state || req.body?.cities || req.body?.audienceType) {
    const country = typeof req.body?.country === "string"
      ? req.body.country.trim()
      : existing.country;
    const check = validateAudience(
      { ...existing, ...req.body, country },
      req.user?.isSuperAdmin ? country : req.user?.country,
    );
    if (!check.ok) { res.status(400).json({ error: check.error }); return; }
    const a = check.audience;
    const cities = a.cities ?? (a.city ? [a.city] : []);
    const primaryCity = cities[0] ?? null;
    const center = primaryCity ? coordsForCity(primaryCity) : null;
    Object.assign(patch, {
      audienceType: a.audienceType ?? existing.audienceType,
      country: a.country,
      state: a.state ?? null,
      city: primaryCity,
      cities: cities.length ? cities : null,
      neighborhood: a.neighborhood ?? null,
      radiusKm: a.radiusKm ?? null,
      ageMin: a.ageMin ?? 18,
      ageMax: a.ageMax ?? 65,
      gender: a.gender ?? "all",
      objective: a.objective ?? "auto",
      centerLatitude: center?.lat ?? null,
      centerLongitude: center?.lng ?? null,
    });
  }

  const [row] = await db
    .update(savedAudiencesTable)
    .set(patch)
    .where(and(eq(savedAudiencesTable.id, id), eq(savedAudiencesTable.userId, userId)))
    .returning();

  res.json({ audience: serializeAudience(row) });
});

router.delete("/booster/audiences/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid audience id" }); return; }

  const deleted = await db
    .delete(savedAudiencesTable)
    .where(and(eq(savedAudiencesTable.id, id), eq(savedAudiencesTable.userId, userId)))
    .returning({ id: savedAudiencesTable.id });

  if (!deleted.length) { res.status(404).json({ error: "Audience not found" }); return; }
  res.json({ ok: true });
});

// ── Campaign pause / resume ──────────────────────────────────────────────────
router.post("/booster/campaigns/:boostId/pause", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const boostId = parseInt(String(req.params.boostId), 10);
  if (!Number.isFinite(boostId)) { res.status(400).json({ error: "Invalid boost id" }); return; }

  const [boost] = await db
    .select()
    .from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.userId, userId)));
  if (!boost) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (boost.paymentStatus !== "paid") {
    res.status(400).json({ error: "Only paid campaigns can be paused" }); return;
  }
  if (boost.lifecycleStatus === "paused") {
    res.json({ ok: true, lifecycleStatus: "paused" }); return;
  }
  if (boost.expiresAt && boost.expiresAt <= new Date()) {
    res.status(400).json({ error: "Campaign already expired" }); return;
  }

  await db.transaction(async (tx) => {
    await tx.update(boostsTable).set({
      lifecycleStatus: "paused",
      pausedAt: new Date(),
    }).where(eq(boostsTable.id, boostId));
    await tx.update(listingsTable).set({
      isBoosted: false,
    }).where(eq(listingsTable.id, boost.listingId));
  });

  logger.info({ boostId, userId }, "booster:campaign_paused");
  res.json({ ok: true, lifecycleStatus: "paused" });
});

router.post("/booster/campaigns/:boostId/resume", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const boostId = parseInt(String(req.params.boostId), 10);
  if (!Number.isFinite(boostId)) { res.status(400).json({ error: "Invalid boost id" }); return; }

  const [boost] = await db
    .select()
    .from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.userId, userId)));
  if (!boost) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (boost.paymentStatus !== "paid") {
    res.status(400).json({ error: "Only paid campaigns can be resumed" }); return;
  }
  if (boost.lifecycleStatus !== "paused") {
    res.status(400).json({ error: "Campaign is not paused" }); return;
  }
  if (boost.expiresAt && boost.expiresAt <= new Date()) {
    await db.update(boostsTable)
      .set({ lifecycleStatus: "completed" })
      .where(eq(boostsTable.id, boostId));
    res.status(400).json({ error: "Campaign already expired" }); return;
  }

  await db.transaction(async (tx) => {
    await tx.update(boostsTable).set({
      lifecycleStatus: "active",
      pausedAt: null,
    }).where(eq(boostsTable.id, boostId));
    await tx.update(listingsTable).set({
      isBoosted: true,
      boostExpiresAt: boost.expiresAt,
    }).where(eq(listingsTable.id, boost.listingId));
  });

  logger.info({ boostId, userId }, "booster:campaign_resumed");
  res.json({ ok: true, lifecycleStatus: "active" });
});

// ── Campaign list (all statuses) ─────────────────────────────────────────────
router.get("/booster/campaigns", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "all";

  const rows = await db
    .select({
      boostId: boostsTable.id,
      listingId: listingsTable.id,
      title: listingsTable.title,
      price: listingsTable.price,
      images: listingsTable.images,
      boostVideoUrl: listingsTable.boostVideoUrl,
      boostStartAt: listingsTable.boostStartAt,
      boostExpiresAt: listingsTable.boostExpiresAt,
      plan: boostsTable.plan,
      budget: boostsTable.budget,
      dailyBudget: boostsTable.dailyBudget,
      durationDays: boostsTable.durationDays,
      paymentStatus: boostsTable.paymentStatus,
      lifecycleStatus: boostsTable.lifecycleStatus,
      mediaType: boostsTable.mediaType,
      impressions: boostsTable.impressions,
      clicks: boostsTable.clicks,
      videoStarts: boostsTable.videoStarts,
      videoCompletions: boostsTable.videoCompletions,
      tenSecViews: boostsTable.tenSecViews,
      skips: boostsTable.skips,
      messages: boostsTable.messages,
      audienceType: boostsTable.audienceType,
      audienceCountry: boostsTable.audienceCountry,
      audienceState: boostsTable.audienceState,
      audienceCity: boostsTable.audienceCity,
      audienceCities: boostsTable.audienceCities,
      audienceRadiusKm: boostsTable.audienceRadiusKm,
      createdAt: boostsTable.createdAt,
    })
    .from(boostsTable)
    .innerJoin(listingsTable, eq(listingsTable.id, boostsTable.listingId))
    .where(eq(boostsTable.userId, userId))
    .orderBy(desc(boostsTable.createdAt))
    .limit(200);

  const IMPRESSIONS_PER_USD = 200;
  const campaigns = rows.map((r) => {
    const budget = Number(r.budget ?? 0);
    const impressions = r.impressions ?? 0;
    const estimatedSpentUsd = Math.min(
      budget,
      Math.round((impressions / IMPRESSIONS_PER_USD) * 100) / 100,
    );
    const remainingBudgetUsd = Math.max(0, Math.round((budget - estimatedSpentUsd) * 100) / 100);
    const expired = !!(r.boostExpiresAt && r.boostExpiresAt <= now);
    let status = r.lifecycleStatus ?? "active";
    if (r.paymentStatus === "pending" || r.paymentStatus === "pending_review") status = "draft";
    else if (expired || status === "completed") status = "completed";
    else if (status === "paused") status = "paused";
    else if (r.paymentStatus === "paid") status = "active";

    return {
      boostId: r.boostId,
      listingId: r.listingId,
      title: r.title,
      price: r.price,
      thumbnail: r.images?.[0] ?? null,
      boostVideoUrl: r.boostVideoUrl,
      boostStartAt: r.boostStartAt?.toISOString() ?? null,
      boostExpiresAt: r.boostExpiresAt?.toISOString() ?? null,
      plan: r.plan,
      budget,
      dailyBudget: r.dailyBudget ?? null,
      durationDays: r.durationDays ?? (PLAN_META[r.plan as Plan]?.days ?? null),
      paymentStatus: r.paymentStatus,
      lifecycleStatus: status,
      mediaType: r.mediaType ?? (r.boostVideoUrl ? "video" : "image"),
      impressions,
      clicks: r.clicks ?? 0,
      videoStarts: r.videoStarts ?? 0,
      videoCompletions: r.videoCompletions ?? 0,
      tenSecViews: r.tenSecViews ?? 0,
      skips: r.skips ?? 0,
      messages: r.messages ?? 0,
      estimatedSpentUsd,
      remainingBudgetUsd,
      audience: {
        type: r.audienceType,
        country: r.audienceCountry,
        state: r.audienceState,
        city: r.audienceCity,
        cities: r.audienceCities ?? [],
        radiusKm: r.audienceRadiusKm,
      },
      createdAt: r.createdAt?.toISOString() ?? null,
      isExpired: expired,
    };
  });

  const filtered = statusFilter === "all"
    ? campaigns
    : campaigns.filter((c) => c.lifecycleStatus === statusFilter);

  res.json({ campaigns: filtered });
});

// ── Analytics for one campaign ───────────────────────────────────────────────
router.get("/booster/campaigns/:boostId/analytics", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const boostId = parseInt(String(req.params.boostId), 10);
  if (!Number.isFinite(boostId)) { res.status(400).json({ error: "Invalid boost id" }); return; }

  const [boost] = await db
    .select()
    .from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.userId, userId)));
  if (!boost) { res.status(404).json({ error: "Campaign not found" }); return; }

  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? "7"), 10) || 7));
  const since = new Date(Date.now() - days * 86_400_000);

  const daily = await db
    .select({
      date: boostDailyImpressionsTable.date,
      impressionCount: boostDailyImpressionsTable.impressionCount,
    })
    .from(boostDailyImpressionsTable)
    .where(eq(boostDailyImpressionsTable.boostId, boostId))
    .orderBy(desc(boostDailyImpressionsTable.date))
    .limit(days);

  const eventRows = await db
    .select({
      eventType: boostAdEventsTable.eventType,
      day: sql<string>`to_char(${boostAdEventsTable.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(boostAdEventsTable)
    .where(and(
      eq(boostAdEventsTable.boostId, boostId),
      gte(boostAdEventsTable.createdAt, since),
    ))
    .groupBy(boostAdEventsTable.eventType, sql`to_char(${boostAdEventsTable.createdAt}, 'YYYY-MM-DD')`);

  const geoRows = await db
    .select({
      city: boostAdEventsTable.city,
      count: sql<number>`count(*)::int`,
    })
    .from(boostAdEventsTable)
    .where(and(
      eq(boostAdEventsTable.boostId, boostId),
      eq(boostAdEventsTable.eventType, "impression"),
      gte(boostAdEventsTable.createdAt, since),
    ))
    .groupBy(boostAdEventsTable.city)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const budget = Number(boost.budget ?? 0);
  const impressions = boost.impressions ?? 0;
  const estimatedSpentUsd = Math.min(budget, Math.round((impressions / 200) * 100) / 100);

  // Real unique reach from recorded viewer ids (anonymous impressions without viewer_id excluded).
  const [reachRow] = await db
    .select({
      reach: sql<number>`count(distinct ${boostAdEventsTable.viewerId})::int`,
    })
    .from(boostAdEventsTable)
    .where(and(
      eq(boostAdEventsTable.boostId, boostId),
      eq(boostAdEventsTable.eventType, "impression"),
      sql`${boostAdEventsTable.viewerId} IS NOT NULL`,
    ));
  const reach = Number(reachRow?.reach ?? 0);

  res.json({
    boostId,
    days,
    totals: {
      impressions,
      reach,
      videoStarts: boost.videoStarts ?? 0,
      videoCompletions: boost.videoCompletions ?? 0,
      tenSecViews: boost.tenSecViews ?? 0,
      skips: boost.skips ?? 0,
      clicks: boost.clicks ?? 0,
      messages: boost.messages ?? 0,
      budget,
      estimatedSpentUsd,
      remainingBudgetUsd: Math.max(0, Math.round((budget - estimatedSpentUsd) * 100) / 100),
      dailyBudget: boost.dailyBudget ?? null,
    },
    reachIsEstimate: false,
    dailyImpressions: daily.map((d) => ({
      date: d.date,
      impressions: d.impressionCount,
    })).reverse(),
    eventsByDay: eventRows,
    geoPerformance: geoRows.map((g) => ({
      city: g.city || "Unknown",
      impressions: g.count,
    })),
  });
});

// ── Idempotent ad event ingestion (authenticated or anonymous) ───────────────
router.post("/booster/events/track", eventLimiter, optionalAuth, async (req, res): Promise<void> => {
  const eventType = req.body?.eventType as AdEventType;
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    res.status(400).json({ error: "Invalid event type" }); return;
  }

  const listingId = parseInt(String(req.body?.listingId ?? ""), 10);
  const boostIdRaw = req.body?.boostId != null ? parseInt(String(req.body.boostId), 10) : null;
  const idempotencyKey = typeof req.body?.idempotencyKey === "string"
    ? req.body.idempotencyKey.trim().slice(0, 120)
    : "";
  if (!Number.isFinite(listingId) || !idempotencyKey || idempotencyKey.length < 8) {
    res.status(400).json({ error: "listingId and idempotencyKey required" }); return;
  }

  const placement = typeof req.body?.placement === "string"
    ? req.body.placement.trim().slice(0, 40)
    : "overlay";

  // Resolve active paid boost for listing (prefer explicit boostId when owned match)
  let boostId = boostIdRaw;
  if (!boostId || !Number.isFinite(boostId)) {
    const [active] = await db
      .select({ id: boostsTable.id })
      .from(boostsTable)
      .innerJoin(listingsTable, eq(listingsTable.id, boostsTable.listingId))
      .where(and(
        eq(boostsTable.listingId, listingId),
        eq(boostsTable.paymentStatus, "paid"),
        inArray(boostsTable.lifecycleStatus, ["active", "paused"]),
      ))
      .orderBy(desc(boostsTable.createdAt))
      .limit(1);
    if (!active) { res.status(404).json({ error: "No active boost for listing" }); return; }
    boostId = active.id;
  } else {
    const [owned] = await db
      .select({ id: boostsTable.id })
      .from(boostsTable)
      .where(and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId)));
    if (!owned) { res.status(404).json({ error: "Boost not found for listing" }); return; }
  }

  const viewerId = (req as any).userId ?? null;
  const country = typeof req.body?.country === "string" ? req.body.country.slice(0, 80) : null;
  const state = typeof req.body?.state === "string" ? req.body.state.slice(0, 80) : null;
  const city = typeof req.body?.city === "string" ? req.body.city.slice(0, 80) : null;

  try {
    const inserted = await db
      .insert(boostAdEventsTable)
      .values({
        boostId,
        listingId,
        viewerId,
        eventType,
        placement,
        country,
        state,
        city,
        idempotencyKey,
      })
      .onConflictDoNothing()
      .returning({ id: boostAdEventsTable.id });

    const counted = inserted.length > 0;
    if (counted) {
      const col = COUNTER_COLUMN[eventType];
      if (col === "impressions") {
        await db.update(boostsTable)
          .set({ impressions: sql`${boostsTable.impressions} + 1` })
          .where(eq(boostsTable.id, boostId));
      } else if (col === "clicks") {
        await db.update(boostsTable)
          .set({ clicks: sql`${boostsTable.clicks} + 1` })
          .where(eq(boostsTable.id, boostId));
      } else if (col === "videoStarts") {
        await db.update(boostsTable)
          .set({ videoStarts: sql`${boostsTable.videoStarts} + 1` })
          .where(eq(boostsTable.id, boostId));
      } else if (col === "videoCompletions") {
        await db.update(boostsTable)
          .set({ videoCompletions: sql`${boostsTable.videoCompletions} + 1` })
          .where(eq(boostsTable.id, boostId));
      } else if (col === "tenSecViews") {
        await db.update(boostsTable)
          .set({ tenSecViews: sql`${boostsTable.tenSecViews} + 1` })
          .where(eq(boostsTable.id, boostId));
      } else if (col === "skips") {
        await db.update(boostsTable)
          .set({ skips: sql`${boostsTable.skips} + 1` })
          .where(eq(boostsTable.id, boostId));
      } else if (col === "messages") {
        await db.update(boostsTable)
          .set({ messages: sql`${boostsTable.messages} + 1` })
          .where(eq(boostsTable.id, boostId));
      }
    }

    res.json({ ok: true, counted, boostId, eventType });
  } catch (err: any) {
    logger.warn({ err: err?.message, boostId, eventType }, "booster:event_track_failed");
    res.status(500).json({ error: "Failed to record event" });
  }
});

export default router;
