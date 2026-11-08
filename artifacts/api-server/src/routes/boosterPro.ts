/**
 * Booster Pro — saved audiences, analytics, drafts, image/video launch, events.
 */
import { Router } from "express";
import {
  db,
  listingsTable,
  boostsTable,
  boostSavedAudiencesTable,
  categoriesTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, optionalAuth, requireNotRestricted, requireCardNotBlocked } from "../middlewares/auth";
import {
  validateAudience,
  validateBudget,
  estimateReach,
  dailyBudgetFromTotal,
  PLAN_META,
  type Plan,
} from "../lib/boostTargeting";
import { HAITI_COMMUNES_BY_DEPARTMENT, HAITI_DEPARTMENT_NAMES } from "../lib/haitiGeography";
import { deductWalletHybrid } from "./wallet";
import { verifyAndCanonicalizeBoostVideoUrl } from "../lib/boostVideoAsset";
import { logger } from "../lib/logger";

const router = Router();

const MAX_VIDEO_SECONDS = 120; // Booster Pro: 2 minutes
const BUDGET_PRESETS = [2, 5, 10, 20];

function planFromDays(days: number): Plan {
  if (days <= 1) return "1day";
  if (days <= 3) return "3day";
  return "7day";
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

/** Geography + presets for the create wizard. */
router.get("/booster/meta", requireAuth, async (req, res): Promise<void> => {
  res.json({
    maxVideoSeconds: MAX_VIDEO_SECONDS,
    budgetPresets: BUDGET_PRESETS,
    haitiDepartments: HAITI_DEPARTMENT_NAMES,
    communesByDepartment: HAITI_COMMUNES_BY_DEPARTMENT,
    radiusKm: [5, 10, 20, 25, 50, 100],
  });
});

/** Saved audiences CRUD */
router.get("/booster/audiences", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(boostSavedAudiencesTable)
    .where(eq(boostSavedAudiencesTable.userId, req.userId!))
    .orderBy(desc(boostSavedAudiencesTable.updatedAt));
  res.json({
    audiences: rows.map((r) => ({
      id: r.id,
      name: r.name,
      audienceType: r.audienceType,
      country: r.country,
      state: r.state,
      cities: r.cities ?? [],
      neighborhood: r.neighborhood,
      radiusKm: r.radiusKm,
      ageMin: r.ageMin,
      ageMax: r.ageMax,
      gender: r.gender,
      objective: r.objective,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
});

router.post("/booster/audiences", requireAuth, async (req, res): Promise<void> => {
  const name = String(req.body?.name ?? "").trim().slice(0, 100);
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  const country = String(req.body?.country ?? req.user?.country ?? "").trim();
  if (!country) { res.status(400).json({ error: "Country required" }); return; }

  const audienceCheck = validateAudience(
    {
      country,
      state: req.body?.state ?? null,
      cities: req.body?.cities ?? null,
      city: req.body?.city ?? null,
      neighborhood: req.body?.neighborhood ?? null,
      radiusKm: req.body?.radiusKm ?? null,
      audienceType: req.body?.audienceType ?? "custom",
      ageMin: req.body?.ageMin,
      ageMax: req.body?.ageMax,
      gender: req.body?.gender,
      objective: req.body?.objective,
      audienceName: name,
    },
    req.user?.country,
  );
  if (!audienceCheck.ok) { res.status(400).json({ error: audienceCheck.error }); return; }
  const a = audienceCheck.audience;

  const [row] = await db
    .insert(boostSavedAudiencesTable)
    .values({
      userId: req.userId!,
      name,
      audienceType: a.audienceType ?? "custom",
      country: a.country,
      state: a.state ?? null,
      cities: a.cities ?? null,
      neighborhood: a.neighborhood ?? null,
      radiusKm: a.radiusKm ?? null,
      ageMin: a.ageMin ?? 18,
      ageMax: a.ageMax ?? 65,
      gender: a.gender ?? "all",
      objective: a.objective ?? "auto",
    })
    .returning();

  res.status(201).json({ audience: row });
});

router.delete("/booster/audiences/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(boostSavedAudiencesTable)
    .where(and(eq(boostSavedAudiencesTable.id, id), eq(boostSavedAudiencesTable.userId, req.userId!)));
  res.json({ ok: true });
});

/** Campaign list: active / completed / draft */
router.get("/booster/campaigns", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();
  const rows = await db
    .select({
      boostId: boostsTable.id,
      listingId: listingsTable.id,
      title: sql<string>`COALESCE(${boostsTable.adTitle}, ${listingsTable.title})`,
      description: boostsTable.adDescription,
      price: listingsTable.price,
      images: listingsTable.images,
      boostVideoUrl: listingsTable.boostVideoUrl,
      boostImageUrl: listingsTable.boostImageUrl,
      adFormat: sql<string>`COALESCE(${boostsTable.adFormat}, ${listingsTable.boostAdFormat}, 'video')`,
      paymentStatus: boostsTable.paymentStatus,
      campaignStatus: boostsTable.campaignStatus,
      impressions: boostsTable.impressions,
      clicks: boostsTable.clicks,
      skips: boostsTable.skips,
      videoViews: boostsTable.videoViews,
      budget: boostsTable.budget,
      plan: boostsTable.plan,
      startsAt: boostsTable.startsAt,
      expiresAt: boostsTable.expiresAt,
      boostStartAt: listingsTable.boostStartAt,
      boostExpiresAt: listingsTable.boostExpiresAt,
      createdAt: boostsTable.createdAt,
    })
    .from(boostsTable)
    .innerJoin(listingsTable, eq(listingsTable.id, boostsTable.listingId))
    .where(eq(boostsTable.userId, userId))
    .orderBy(desc(boostsTable.createdAt))
    .limit(100);

  const campaigns = rows.map((r) => {
    const expired = r.expiresAt <= now || (!!r.boostExpiresAt && r.boostExpiresAt <= now);
    let status = r.campaignStatus || "pending";
    if (r.paymentStatus === "draft" || status === "draft") status = "draft";
    else if (status === "paused" && r.paymentStatus === "paid" && !expired) status = "paused";
    else if (r.paymentStatus === "paid" && !expired) status = "active";
    else if (r.paymentStatus === "paid" && expired) status = "completed";
    return {
      boostId: r.boostId,
      listingId: r.listingId,
      title: r.title,
      description: r.description,
      thumbnail: r.boostImageUrl || r.images?.[0] || null,
      boostVideoUrl: r.boostVideoUrl,
      boostImageUrl: r.boostImageUrl,
      adFormat: r.adFormat,
      status,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      skips: r.skips ?? 0,
      videoViews: r.videoViews ?? 0,
      reach: Math.round((r.impressions ?? 0) * 0.62),
      budget: Number(r.budget ?? 0),
      plan: r.plan,
      startsAt: (r.startsAt ?? r.boostStartAt)?.toISOString() ?? null,
      endsAt: (r.boostExpiresAt ?? r.expiresAt)?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  res.json({ campaigns });
});

/** Analytics aggregate + real daily series (no fabricated charts). */
router.get("/booster/analytics", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const boostId = req.query.boostId ? parseInt(String(req.query.boostId), 10) : null;

  const conds = [eq(boostsTable.userId, userId), eq(boostsTable.paymentStatus, "paid")];
  if (boostId && Number.isFinite(boostId)) conds.push(eq(boostsTable.id, boostId));

  const boostRows = await db
    .select({
      id: boostsTable.id,
      impressions: boostsTable.impressions,
      clicks: boostsTable.clicks,
      skips: boostsTable.skips,
      videoViews: boostsTable.videoViews,
      budget: boostsTable.budget,
      price: boostsTable.price,
    })
    .from(boostsTable)
    .where(and(...conds));

  const impressions = boostRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const clicks = boostRows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const skips = boostRows.reduce((s, r) => s + (r.skips ?? 0), 0);
  const videoViews = boostRows.reduce((s, r) => s + (r.videoViews ?? 0), 0);
  const { estimatedSpendUsd } = await import("../lib/boostAnalytics");
  const spend = Math.round(
    boostRows.reduce((s, r) => s + estimatedSpendUsd(r.impressions ?? 0, Number(r.budget ?? r.price ?? 0)), 0) * 100,
  ) / 100;

  const ids = boostRows.map((r) => r.id);
  let series: Array<{ date: string; impressions: number; clicks: number; videoViews: number }> = [];
  if (ids.length > 0) {
    const { boostDailyImpressionsTable } = await import("@workspace/db");
    const { inArray } = await import("drizzle-orm");
    const daily = await db
      .select({
        date: boostDailyImpressionsTable.date,
        impressions: sql<number>`COALESCE(SUM(${boostDailyImpressionsTable.impressionCount}), 0)::int`,
      })
      .from(boostDailyImpressionsTable)
      .where(inArray(boostDailyImpressionsTable.boostId, ids))
      .groupBy(boostDailyImpressionsTable.date)
      .orderBy(boostDailyImpressionsTable.date);
    series = daily.map((d) => ({
      date: d.date,
      impressions: Number(d.impressions),
      clicks: 0,
      videoViews: 0,
    }));
  }

  res.json({
    totals: {
      impressions,
      reach: null,
      reachAvailable: false,
      videoViews,
      clicks,
      skips,
      spend,
      campaigns: boostRows.length,
    },
    series,
    note: "Series uses recorded daily impressions only. Reach is not estimated.",
  });
});

/**
 * Save or launch a Booster Pro campaign (image or video).
 * body.mode = "draft" | "launch"
 * Payment on launch uses wallet (same as video-only); card flows can follow existing initiate.
 */
router.post("/booster/campaigns", requireAuth, requireNotRestricted, requireCardNotBlocked, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const mode = req.body?.mode === "draft" ? "draft" : "launch";
  const adFormat = req.body?.adFormat === "image" ? "image" : "video";
  const adTitle = String(req.body?.adTitle ?? "").trim().slice(0, 120);
  const adDescription = String(req.body?.adDescription ?? "").trim().slice(0, 2000);
  const videoUrlRaw = typeof req.body?.videoUrl === "string" ? req.body.videoUrl.trim() : "";
  const imageUrlRaw = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";
  const listingIdIn = req.body?.listingId ? parseInt(String(req.body.listingId), 10) : null;
  const startDate = String(req.body?.startDate ?? "").trim();
  const endDate = String(req.body?.endDate ?? "").trim();
  const rawCta = String(req.body?.ctaType ?? "none").trim().toLowerCase();
  const ctaType = (["buy_now", "message", "whatsapp", "none", "link"] as const).includes(rawCta as any)
    ? rawCta
    : "none";
  const whatsappNumber = String(req.body?.whatsappNumber ?? "").replace(/\D/g, "").slice(0, 20) || null;
  const externalLink = String(req.body?.externalLink ?? "").trim().slice(0, 500) || null;
  const ctaText = String(req.body?.ctaText ?? "").trim().slice(0, 80) || null;

  if (ctaType === "whatsapp" && mode === "launch" && !whatsappNumber) {
    res.status(400).json({ error: "WhatsApp number required for WhatsApp CTA" }); return;
  }
  if (ctaType === "buy_now" && mode === "launch" && !listingIdIn) {
    res.status(400).json({ error: "Buy Now requires an attached product" }); return;
  }

  if (!adTitle) { res.status(400).json({ error: "Ad title required" }); return; }
  if (adFormat === "video" && !videoUrlRaw && mode === "launch") {
    res.status(400).json({ error: "Video required for video ads" }); return;
  }
  if (adFormat === "image" && !imageUrlRaw && mode === "launch") {
    res.status(400).json({ error: "Image required for image ads" }); return;
  }

  let videoUrl: string | null = null;
  if (videoUrlRaw) {
    videoUrl = verifyAndCanonicalizeBoostVideoUrl(videoUrlRaw, userId);
    if (!videoUrl) {
      res.status(400).json({ error: "Video must be a completed normalized Boost upload." });
      return;
    }
  }
  const imageUrl = imageUrlRaw || null;

  const days = startDate && endDate ? daysBetween(startDate, endDate) : 7;
  if (days < 1 || days > 30) {
    res.status(400).json({ error: "Duration must be between 1 and 30 days" }); return;
  }
  const plan = planFromDays(days);
  const budgetCheck = validateBudget(req.body?.budget ?? PLAN_META[plan].basePrice, plan);
  if (!budgetCheck.ok) { res.status(400).json({ error: budgetCheck.error }); return; }
  const budget = budgetCheck.budget;

  const audienceCheck = validateAudience(
    { ...req.body?.audience, country: req.body?.audience?.country ?? req.user?.country },
    req.user?.country,
  );
  if (!audienceCheck.ok) { res.status(400).json({ error: audienceCheck.error }); return; }
  const audience = audienceCheck.audience;

  const startsAt = startDate ? new Date(startDate) : new Date();
  const expiresAt = endDate
    ? new Date(endDate)
    : new Date(startsAt.getTime() + days * 86_400_000);
  if (!(expiresAt > startsAt)) {
    res.status(400).json({ error: "End date must be after start date" }); return;
  }

  // Resolve or create listing (ghost for video/image-only)
  let listingId = listingIdIn && Number.isFinite(listingIdIn) ? listingIdIn : null;
  if (listingId) {
    const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
    if (!listing || listing.sellerId !== userId) {
      res.status(403).json({ error: "Listing not found" }); return;
    }
  } else {
    const [cat] = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1);
    if (!cat) { res.status(500).json({ error: "No category available" }); return; }
    const [created] = await db
      .insert(listingsTable)
      .values({
        title: adTitle,
        description: adDescription || adTitle,
        price: 0,
        currency: "USD",
        categoryId: cat.id,
        condition: "good",
        location: audience.city || audience.state || audience.country,
        city: audience.city ?? null,
        state: audience.state ?? null,
        country: audience.country,
        images: imageUrl ? [imageUrl] : [],
        status: "hidden",
        moderationStatus: "approved",
        lifecycleStatus: "published",
        sellerId: userId,
        boostVideoUrl: videoUrl,
        boostImageUrl: imageUrl,
        boostAdFormat: adFormat,
        boostCtaType: ctaType,
        boostWhatsappNumber: whatsappNumber,
        boostExternalLink: externalLink,
        boostCtaText: ctaText,
      })
      .returning({ id: listingsTable.id });
    listingId = created.id;
  }

  const reach = estimateReach(budget, plan, audience);
  const dailyBudget = dailyBudgetFromTotal(budget, plan);

  if (mode === "draft") {
    const [boost] = await db
      .insert(boostsTable)
      .values({
        listingId: listingId!,
        userId,
        plan,
        price: budget,
        budget,
        estimatedReach: reach,
        audienceType: audience.audienceType ?? "advantage_plus",
        audienceName: audience.audienceName ?? null,
        audienceCountry: audience.country,
        audienceState: audience.state ?? null,
        audienceCity: audience.city ?? null,
        audienceCities: audience.cities ?? null,
        audienceNeighborhood: audience.neighborhood ?? null,
        audienceRadiusKm: audience.radiusKm ?? null,
        audienceAgeMin: audience.ageMin ?? 18,
        audienceAgeMax: audience.ageMax ?? 65,
        audienceGender: audience.gender ?? "all",
        objective: audience.objective ?? "auto",
        dailyBudget,
        durationDays: days,
        paymentMethod: "wallet",
        paymentStatus: "draft",
        campaignStatus: "draft",
        adFormat,
        adTitle,
        adDescription: adDescription || null,
        startsAt,
        expiresAt,
      })
      .returning();

    await db
      .update(listingsTable)
      .set({
        ...(listingIdIn ? {} : { title: adTitle, description: adDescription || adTitle }),
        boostVideoUrl: videoUrl,
        boostImageUrl: imageUrl,
        boostAdFormat: adFormat,
        boostCtaType: ctaType,
        boostWhatsappNumber: whatsappNumber,
        boostExternalLink: externalLink,
        boostCtaText: ctaText,
      })
      .where(eq(listingsTable.id, listingId!));

    res.status(201).json({ boostId: boost.id, listingId, status: "draft" });
    return;
  }

  // Launch — wallet deduct
  const paymentRef = `booster-pro-${userId}-${Date.now()}`;
  try {
    const result = await deductWalletHybrid(userId, budget, `Booster Pro: ${adTitle}`, "boost_debit", userId);
    if (!result.ok) {
      res.status(402).json({
        error: "Insufficient wallet balance",
        code: "INSUFFICIENT_WALLET",
        listingId,
        amountNeeded: budget,
        promoBalance: result.promoBalance,
        realBalance: result.realBalance,
      });
      return;
    }

    const [boost] = await db
      .insert(boostsTable)
      .values({
        listingId: listingId!,
        userId,
        plan,
        price: budget,
        budget,
        estimatedReach: reach,
        audienceType: audience.audienceType ?? "advantage_plus",
        audienceName: audience.audienceName ?? null,
        audienceCountry: audience.country,
        audienceState: audience.state ?? null,
        audienceCity: audience.city ?? null,
        audienceCities: audience.cities ?? null,
        audienceNeighborhood: audience.neighborhood ?? null,
        audienceRadiusKm: audience.radiusKm ?? null,
        audienceAgeMin: audience.ageMin ?? 18,
        audienceAgeMax: audience.ageMax ?? 65,
        audienceGender: audience.gender ?? "all",
        objective: audience.objective ?? "auto",
        dailyBudget,
        durationDays: days,
        paymentMethod: "wallet",
        paymentStatus: "paid",
        paymentRef,
        campaignStatus: "active",
        adFormat,
        adTitle,
        adDescription: adDescription || null,
        startsAt,
        expiresAt,
      })
      .returning();

    await db
      .update(listingsTable)
      .set({
        ...(listingIdIn ? {} : { title: adTitle, description: adDescription || adTitle }),
        isBoosted: true,
        boostStartAt: startsAt,
        boostExpiresAt: expiresAt,
        boostVideoUrl: videoUrl,
        boostImageUrl: imageUrl,
        boostAdFormat: adFormat,
        boostCtaType: ctaType,
        boostWhatsappNumber: whatsappNumber,
        boostExternalLink: externalLink,
        boostCtaText: ctaText,
        boostAudienceCountry: audience.country,
        boostAudienceState: audience.state ?? null,
        boostAudienceCity: audience.city ?? null,
        boostAudienceCities: audience.cities ?? null,
        boostAudienceNeighborhood: audience.neighborhood ?? null,
        boostAudienceRadiusKm: audience.radiusKm ?? null,
        boostAudienceAgeMin: audience.ageMin ?? 18,
        boostAudienceAgeMax: audience.ageMax ?? 65,
        boostAudienceGender: audience.gender ?? "all",
        boostAudienceObjective: audience.objective ?? "auto",
        boostAudienceType: audience.audienceType ?? "advantage_plus",
        boostDailyBudget: dailyBudget,
        boostDurationDays: days,
      })
      .where(eq(listingsTable.id, listingId!));

    res.status(201).json({
      boostId: boost.id,
      listingId,
      status: "active",
      expiresAt: expiresAt.toISOString(),
      estimatedReach: reach,
      promoUsed: result.promoUsed,
      realUsed: result.realUsed,
    });
  } catch (err) {
    logger.error({ err }, "booster/campaigns launch failed");
    res.status(500).json({ error: "Failed to launch campaign" });
  }
});

/** Pause / resume an owned active campaign (no refund). */
router.post("/booster/campaigns/:id/pause", requireAuth, async (req, res): Promise<void> => {
  const boostId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  if (!boostId) { res.status(400).json({ error: "Invalid id" }); return; }
  const [boost] = await db.select().from(boostsTable).where(and(eq(boostsTable.id, boostId), eq(boostsTable.userId, userId)));
  if (!boost) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (boost.paymentStatus !== "paid") { res.status(400).json({ error: "Only paid campaigns can be paused" }); return; }
  await db.update(boostsTable).set({ campaignStatus: "paused" }).where(eq(boostsTable.id, boostId));
  await db.update(listingsTable).set({ isBoosted: false }).where(eq(listingsTable.id, boost.listingId));
  res.json({ ok: true, status: "paused" });
});

router.post("/booster/campaigns/:id/resume", requireAuth, async (req, res): Promise<void> => {
  const boostId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  if (!boostId) { res.status(400).json({ error: "Invalid id" }); return; }
  const [boost] = await db.select().from(boostsTable).where(and(eq(boostsTable.id, boostId), eq(boostsTable.userId, userId)));
  if (!boost) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (boost.campaignStatus !== "paused" || boost.paymentStatus !== "paid") {
    res.status(400).json({ error: "Only paused paid campaigns can be resumed" }); return;
  }
  if (boost.expiresAt <= new Date()) {
    res.status(400).json({ error: "Campaign already expired" }); return;
  }
  await db.update(boostsTable).set({ campaignStatus: "active" }).where(eq(boostsTable.id, boostId));
  await db.update(listingsTable).set({
    isBoosted: true,
    boostExpiresAt: boost.expiresAt,
    boostStartAt: boost.startsAt ?? new Date(),
  }).where(eq(listingsTable.id, boost.listingId));
  res.json({ ok: true, status: "active" });
});

/** Track view / click / skip events */
router.post("/booster/events", optionalAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.body?.listingId ?? ""), 10);
  const type = String(req.body?.type ?? "");
  if (!listingId || !["view", "click", "skip", "video_view"].includes(type)) {
    res.status(400).json({ error: "listingId and type required" }); return;
  }

  try {
    if (type === "click") {
      await db.execute(sql`UPDATE boosts SET clicks = clicks + 1 WHERE listing_id = ${listingId} AND payment_status = 'paid' AND expires_at > now()`);
    } else if (type === "skip") {
      await db.execute(sql`UPDATE boosts SET skips = skips + 1 WHERE listing_id = ${listingId} AND payment_status = 'paid' AND expires_at > now()`);
    } else if (type === "video_view") {
      await db.execute(sql`UPDATE boosts SET video_views = video_views + 1 WHERE listing_id = ${listingId} AND payment_status = 'paid' AND expires_at > now()`);
    } else {
      await db.execute(sql`UPDATE boosts SET impressions = impressions + 1 WHERE listing_id = ${listingId} AND payment_status = 'paid' AND expires_at > now()`);
    }
    if (type === "view" || type === "video_view") {
      await db.execute(sql`UPDATE listings SET view_count = view_count + 1 WHERE id = ${listingId}`);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.warn({ err }, "booster event failed");
    res.status(500).json({ error: "Failed to record event" });
  }
});

export default router;
