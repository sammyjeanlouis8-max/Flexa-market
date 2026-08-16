import { Router } from "express";
import { db, listingsTable, boostsTable, transactionsTable, notificationsTable, usersTable, platformSettingsTable, promoWalletTable, walletTransactionsTable } from "@workspace/db";
import { eq, and, desc, sql, isNotNull, isNull, ne, gt, lte, or } from "drizzle-orm";
import { deductWalletHybrid } from "./wallet";
import { requireAuth, optionalAuth, requireNotRestricted, requireCardNotBlocked } from "../middlewares/auth";
import {
  VALID_PLANS, VALID_PAY_METHODS, PLAN_META, HAITI_DEPARTMENTS, VALID_RADIUS_KM,
  getAllowedMethods, validateAudience, validateBudget, estimateReach,
  type Plan, type PayMethod,
} from "../lib/boostTargeting";
import { getStripeClient } from "../lib/stripeClient";
import { handleCheckoutCompleted } from "./stripeCheckout";
import { logger } from "../lib/logger";
import { extractWasabiKey, getWasabiPresignedUrl } from "../lib/s3";

/**
 * Resolve a stored boostVideoUrl to a playable URL.
 * Wasabi proxy URLs are returned as-is so the browser hits our same-origin
 * /api/storage/wasabi-image proxy (streams directly, no 302, Range-capable).
 * Unresolvable objectPath session IDs (/objects/uploads/…) return null.
 */
async function resolveBoostVideoUrl(raw: string | null): Promise<string | null> {
    if (!raw) return null;
    if (raw.startsWith("/objects/") || raw.startsWith("/api/storage/objects/")) {
      return null;
    }
    // Wasabi proxy URL → swap for a 7-day presigned URL so the browser connects
    // directly to Wasabi and gets native Range-request support for long videos.
    // The old proxy streamed through our DO server (has stream size/timeout limits),
    // causing videos > 1 minute to go black on iPhone Safari.
    const wasabiKey = extractWasabiKey(raw);
    if (wasabiKey !== null) {
      try {
        return await getWasabiPresignedUrl(wasabiKey, 604_800); // 7-day TTL
      } catch {
        return raw; // fall back to proxy URL if presigning fails
      }
    }
    return raw;
    }

const BOOST_BASE_URL = (() => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : "https://flexamarket.com";
})();

const router = Router();

router.get("/boost/methods", requireAuth, async (req, res): Promise<void> => {
  const country = req.user?.country ?? null;
  res.json({
    country,
    allowedMethods: getAllowedMethods(country),
    haitiDepartments: country === "Haiti" ? HAITI_DEPARTMENTS : null,
    validRadiusKm: VALID_RADIUS_KM,
    plans: Object.entries(PLAN_META).map(([id, m]) => ({ id, days: m.days, basePrice: m.basePrice })),
  });
});

router.post("/boost/estimate", requireAuth, async (req, res): Promise<void> => {
  const plan = req.body.plan as Plan;
  if (!VALID_PLANS.includes(plan)) { res.status(400).json({ error: "Invalid plan" }); return; }
  // Admins may target any country; regular users are locked to their own.
  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  const effectiveCountry = isAdmin
    ? (typeof req.body.audience?.country === "string" ? req.body.audience.country : req.user?.country)
    : req.user?.country;
  const audienceBody = { ...req.body.audience, country: effectiveCountry };
  const audienceCheck = validateAudience(audienceBody, effectiveCountry);
  if (!audienceCheck.ok) { res.status(400).json({ error: audienceCheck.error }); return; }
  const budgetCheck = validateBudget(req.body.budget, plan);
  if (!budgetCheck.ok) { res.status(400).json({ error: budgetCheck.error }); return; }
  res.json({
    estimatedReach: estimateReach(budgetCheck.budget, plan, audienceCheck.audience),
    durationDays: PLAN_META[plan].days,
    budget: budgetCheck.budget,
  });
});

router.post("/listings/:id/boost/initiate", requireAuth, requireNotRestricted, requireCardNotBlocked, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.params.id), 10);
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  if (listing.sellerId !== req.userId && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  // Guard against double-submit: if there is already a boost for this listing
  // in 'processing' state created within the last 2 minutes, reject immediately.
  // 'processing' is set transiently during wallet activation; it prevents two
  // concurrent requests from both deducting the wallet and activating the boost.
  const [inFlight] = await db
    .select({ id: boostsTable.id })
    .from(boostsTable)
    .where(
      and(
        eq(boostsTable.listingId, listingId),
        eq(boostsTable.userId, req.userId!),
        eq(boostsTable.paymentStatus, "processing"),
        sql`${boostsTable.createdAt} > NOW() - INTERVAL '2 minutes'`,
      )
    )
    .limit(1);
  if (inFlight) {
    res.status(429).json({ error: "Yon boost deja an tren tretman — tann yon ti moman epi eseye ankò." });
    return;
  }

  const plan = req.body.plan as Plan;
  const paymentMethod = req.body.paymentMethod as PayMethod;
  if (!VALID_PLANS.includes(plan)) { res.status(400).json({ error: "Invalid plan" }); return; }
  if (!VALID_PAY_METHODS.includes(paymentMethod)) { res.status(400).json({ error: "Invalid payment method" }); return; }

  // Admins can use any payment method regardless of their own country.
  if (!isAdmin) {
    const allowed = getAllowedMethods(req.user?.country);
    if (!allowed.includes(paymentMethod)) {
      res.status(403).json({ error: "Payment method not available in your country", country: req.user?.country ?? null, allowedMethods: allowed });
      return;
    }
  }

  // Admins can boost for any country; non-admins are locked to their own.
  const audienceCountry = isAdmin
    ? (typeof req.body.audience?.country === "string" ? req.body.audience.country : req.user?.country)
    : req.user?.country;

  // Force state + city from the seller's own profile for non-admins so that
  // every boost is automatically geo-targeted to the seller's actual region.
  const forcedState = isAdmin
    ? (typeof req.body.audience?.state === "string" ? req.body.audience.state : req.user?.state ?? null)
    : req.user?.state ?? null;
  const forcedCity = isAdmin
    ? (typeof req.body.audience?.city === "string" ? req.body.audience.city : req.user?.location ?? null)
    : req.user?.location ?? null;

  const audienceBody = {
    ...req.body.audience,
    country: audienceCountry,
    state: forcedState,
    city: forcedCity,
  };
  const audienceCheck = validateAudience(audienceBody, audienceCountry);
  if (!audienceCheck.ok) { res.status(400).json({ error: audienceCheck.error }); return; }
  const budgetCheck = validateBudget(req.body.budget, plan);
  if (!budgetCheck.ok) { res.status(400).json({ error: budgetCheck.error }); return; }

  const audience = audienceCheck.audience;
  const budget = budgetCheck.budget;
  const planMeta = PLAN_META[plan];
  const expiresAt = new Date(Date.now() + planMeta.days * 24 * 60 * 60 * 1000);
  const reach = estimateReach(budget, plan, audience);

  // Optional ≤30s promo video the seller uploaded via our object storage.
  // Stored immediately so value survives an abandoned payment.
  //
  // We deliberately accept ONLY object-storage paths (`/objects/<id>`), never
  // arbitrary external URLs: an external URL would let a seller force every
  // visitor's browser to contact an attacker-controlled host, leaking IPs and
  // enabling cross-site fingerprinting. Forcing storage-hosted media keeps
  // the victim's browser on our domain.
  //
  // We always WRITE the column (treating undefined as null) so omitting the
  // field from a re-initiate clears any stale URL — otherwise a seller could
  // boost again with no video and the previous video would silently keep
  // running.
  const rawVideo = req.body?.videoUrl;
  let videoUrl: string | null = null;
  if (typeof rawVideo === "string") {
    const v = rawVideo.trim();
    if (v.length > 0 && v.length <= 500 && (
      v.startsWith("/objects/") ||
      v.startsWith("/api/storage/objects/") ||
      v.startsWith("https://")
    )) {
      videoUrl = v;
    }
  }
  await db.update(listingsTable)
    .set({ boostVideoUrl: videoUrl })
    .where(eq(listingsTable.id, listingId));

  const [boost] = await db.insert(boostsTable).values({
    listingId,
    userId: req.userId!,
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
    paymentMethod,
    paymentStatus: "pending",
    expiresAt,
  }).returning();

  // Sync audience to listing for feed targeting
  await db.update(listingsTable).set({
    boostAudienceCountry: audience.country,
    boostAudienceCities: audience.cities ?? null,
    boostAudienceCity: audience.city ?? null,
    boostAudienceAgeMin: audience.ageMin ?? null,
    boostAudienceAgeMax: audience.ageMax ?? null,
    boostAudienceGender: audience.gender ?? "all",
    boostAudienceObjective: audience.objective ?? "auto",
    boostAudienceType: audience.audienceType ?? "advantage_plus",
  }).where(eq(listingsTable.id, listingId));

  // ── Wallet instant pay (promo-first, then real balance) ──────────────────
  if (paymentMethod === "wallet") {
    // Claim the boost slot atomically: transition pending → processing so that
    // any concurrent request hitting the in-flight guard above returns 429.
    const [claimed] = await db
      .update(boostsTable)
      .set({ paymentStatus: "processing" })
      .where(and(eq(boostsTable.id, boost.id), eq(boostsTable.paymentStatus, "pending")))
      .returning({ id: boostsTable.id });
    if (!claimed) {
      // Another request already claimed this boost record — bail out safely.
      res.status(429).json({ error: "Boost deja an tren tretman" });
      return;
    }

    const result = await deductWalletHybrid(req.userId!, budget, `Boost ${plan} pou lis #${listingId}`, "boost_debit", req.userId!);

    if (!result.ok) {
      // Deduction failed — roll back processing status so the seller can try again
      await db.update(boostsTable).set({ paymentStatus: "pending" }).where(eq(boostsTable.id, boost.id)).catch(() => {});
      const total = result.promoBalance + result.realBalance;
      res.status(402).json({
        error: "Balans pa ase (promo + reyèl)",
        code: "INSUFFICIENT_WALLET",
        promoBalance: parseFloat(result.promoBalance.toFixed(2)),
        realBalance: parseFloat(result.realBalance.toFixed(2)),
        totalBalance: parseFloat(total.toFixed(2)),
        requiredUsd: parseFloat(budget.toFixed(2)),
        shortfallUsd: parseFloat((budget - total).toFixed(2)),
      });
      return;
    }

    const paymentRef = `WBOOST-${boost.id}-${Date.now()}`;
    await db.update(boostsTable).set({ paymentStatus: "paid", paymentRef }).where(eq(boostsTable.id, boost.id));
    await db.update(listingsTable).set({
      isBoosted: true,
      boostStartAt: new Date(),
      boostExpiresAt: expiresAt,
      boostAudienceCountry: audience.country,
      boostAudienceCities: audience.cities ?? null,
      boostAudienceCity: audience.city ?? null,
      boostAudienceAgeMin: audience.ageMin ?? null,
      boostAudienceAgeMax: audience.ageMax ?? null,
      boostAudienceGender: audience.gender ?? "all",
      boostAudienceObjective: audience.objective ?? "auto",
      boostAudienceType: audience.audienceType ?? "advantage_plus",
    }).where(eq(listingsTable.id, listingId));

    await db.insert(notificationsTable).values({
      userId: req.userId!, actorId: req.userId!, type: "boost_approved", listingId,
    }).catch(() => {});

    res.json({
      boostId: boost.id,
      activated: true,
      plan: boost.plan,
      price: boost.price,
      budget,
      estimatedReach: reach,
      audience,
      paymentMethod: "wallet",
      paymentRef,
      promoUsed: result.promoUsed,
      realUsed: result.realUsed,
      expiresAt: expiresAt.toISOString(),
    });
    return;
  }

  let walletAddress: string | undefined;
  if (paymentMethod === "usdt") {
    const [walletRow] = await db.select().from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "usdt_trx_wallet_address"));
    walletAddress = walletRow?.value ?? undefined;
  }

  res.json({
    boostId: boost.id,
    plan: boost.plan,
    price: boost.price,
    budget: boost.budget,
    estimatedReach: boost.estimatedReach,
    audience,
    paymentMethod: boost.paymentMethod,
    expiresAt: boost.expiresAt.toISOString(),
    walletAddress,
  });
});

router.post("/listings/:id/boost/confirm", requireAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.params.id), 10);
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  if (listing.sellerId !== req.userId && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const boostId = parseInt(req.body.boostId, 10);
  const paymentRef = String(req.body.paymentRef ?? "").trim();
  if (!boostId || !paymentRef) { res.status(400).json({ error: "boostId and paymentRef required" }); return; }
  if (paymentRef.length < 6) { res.status(400).json({ error: "Invalid payment reference" }); return; }

  const [boost] = await db.select().from(boostsTable).where(
    and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId))
  );
  if (!boost) { res.status(404).json({ error: "Boost order not found" }); return; }
  if (boost.paymentStatus === "paid") { res.status(400).json({ error: "Already paid" }); return; }
  if (boost.paymentStatus === "pending_review") { res.status(400).json({ error: "Payment already submitted — awaiting admin review" }); return; }
  if (boost.paymentStatus === "rejected") { res.status(400).json({ error: "This boost was rejected. Please start a new boost." }); return; }

  // Move boost to "pending_review" — payment reference is recorded so admin
  // can cross-check it against MonCash / Stripe dashboards, but the listing
  // is NOT marked isBoosted until an admin explicitly approves the payment.
  // This prevents fraudulent self-confirmations (e.g. a fake MonCash code).
  let updatedBoost: typeof boostsTable.$inferSelect | null = null;
  try {
    updatedBoost = await db.transaction(async (tx) => {
      const upd = await tx.update(boostsTable)
        .set({ paymentStatus: "pending_review", paymentRef })
        .where(and(eq(boostsTable.id, boost.id), eq(boostsTable.paymentStatus, "pending")))
        .returning();
      if (upd.length === 0) {
        throw Object.assign(new Error("ALREADY_SUBMITTED"), { httpStatus: 400, body: { error: "Payment reference already submitted" } });
      }

      // Record the pending transaction for audit; status stays "pending"
      // until admin approves and it becomes "completed".
      await tx.insert(transactionsTable).values({
        userId: req.userId!,
        listingId,
        type: "boost",
        amount: boost.price,
        currency: boost.audienceCountry === "Haiti" ? "HTG" : "USD",
        paymentMethod: boost.paymentMethod,
        paymentStatus: "pending",
        paymentRef,
        description: `Boost ${boost.plan} for listing #${listingId} — pending review`,
      });

      return upd[0];
    });
  } catch (e: any) {
    if (e?.httpStatus) { res.status(e.httpStatus).json(e.body); return; }
    if (e?.code === "23505" || /unique/i.test(String(e?.message))) {
      res.status(409).json({ error: "This payment reference has already been used" }); return;
    }
    req.log.error({ err: e }, "[boost/confirm] transaction failed");
    res.status(500).json({ error: "Could not confirm boost" }); return;
  }

  // Notify the seller that their boost is under review.
  await db.insert(notificationsTable).values({
    userId: req.userId!, actorId: req.userId!, type: "boost_pending_review", listingId,
  }).catch((e) => { req.log.error({ err: e }, "[boost/confirm] notification insert failed"); });

  res.json({ success: true, pendingReview: true, boost: updatedBoost, expiresAt: boost.expiresAt.toISOString() });
});

/**
 * Random boost-ad video. Returned to a marketplace visitor after they have
 * been browsing for ~10s; the client renders it as a brief autoplay overlay.
 *
 * Selection rules:
 *  - Listing is currently boosted, status = available, and has a video URL.
 *  - boostExpiresAt is in the future.
 *  - Audience country, when set on the boost, must match the viewer's
 *    country; if the boost has no country target, anyone is eligible.
 *  - The signed-in viewer never sees their own listings.
 *
 * Picks one row at random with `ORDER BY random() LIMIT 1`.
 */
router.get("/boost/random-video", optionalAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = !!req.user?.isSuperAdmin;
  const isAdmin      = !!req.user?.isAdmin && !isSuperAdmin;
  // Super-admins see all videos; regular admins see only their scope country.
  const skipCountryFilter = isSuperAdmin;
  const adminScopeCountry = (req.user as any)?.adminScopeCountry as string | null | undefined;
  const viewerCountry = isAdmin
    ? (adminScopeCountry ?? req.user?.country ?? null)
    : (req.user?.country ?? null);
  const viewerState   = req.user?.state    ?? null;
  const viewerCity    = req.user?.location ?? null;
  const viewerId = req.userId ?? -1;

  const now = new Date();
  const conds = [
    eq(listingsTable.isBoosted, true),
    or(eq(listingsTable.status, "available"), eq(listingsTable.status, "hidden")),
    isNotNull(listingsTable.boostVideoUrl),
    gt(listingsTable.boostExpiresAt, now),
    // NULL boostStartAt is treated as "already started" for backward-compat with
    // boosts that were activated before the boostStartAt column was added.
    sql`(${listingsTable.boostStartAt} IS NULL OR ${listingsTable.boostStartAt} <= ${now.toISOString()})`,
    ne(listingsTable.sellerId, viewerId),
    // Admins and super-admins bypass the country filter for full-market visibility.
    // Regular users must match their country; unauthenticated → sql`false` (no match).
    ...(skipCountryFilter ? [] : [
      viewerCountry
        ? sql`(lower(COALESCE(NULLIF(${listingsTable.boostAudienceCountry}, ''), ${listingsTable.country})) = ${viewerCountry.toLowerCase()} OR ${listingsTable.boostAudienceCountry} = 'ALL')`
        : sql`false`,
    ]),
    // State isolation: only exclude when viewer has a known state AND boost targets
    // a different state. If viewer has no state, we cannot confirm mismatch → show all.
    ...(!skipCountryFilter && viewerState
      ? [or(
          isNull(listingsTable.boostAudienceState),
          sql`lower(${listingsTable.boostAudienceState}) = ${viewerState.toLowerCase()}`,
        )]
      : []),
    // City isolation: same inclusive logic.
    ...(!skipCountryFilter && viewerCity
      ? [or(
          isNull(listingsTable.boostAudienceCity),
          sql`lower(${listingsTable.boostAudienceCity}) = ${viewerCity.toLowerCase()}`,
        )]
      : []),
  ];

  const [row] = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      price: listingsTable.price,
      images: listingsTable.images,
      boostVideoUrl: listingsTable.boostVideoUrl,
      sellerId: listingsTable.sellerId,
      sellerName: usersTable.name,
      boostCtaType: listingsTable.boostCtaType,
      boostExternalLink: listingsTable.boostExternalLink,
      boostWhatsappNumber: listingsTable.boostWhatsappNumber,
      boostCtaText: listingsTable.boostCtaText,
      status: listingsTable.status,
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .where(and(...conds))
    .orderBy(sql`random()`)
    .limit(1);

  if (!row) {
    res.set("Cache-Control", "no-store");
    res.json({ listing: null });
    return;
  }

  res.set("Cache-Control", "no-store");
  res.json({
    listing: {
      id: row.id,
      title: row.title,
      price: row.price,
      thumbnail: row.images?.[0] ?? null,
      boostVideoUrl: await resolveBoostVideoUrl(row.boostVideoUrl),
      sellerName: row.sellerName,
      boostCtaType: row.boostCtaType ?? null,
      boostExternalLink: row.boostExternalLink ?? null,
      boostWhatsappNumber: row.boostWhatsappNumber ?? null,
      boostCtaText: row.boostCtaText ?? null,
      // Video-only boosts use a ghost listing (status=hidden) so the overlay
      // knows not to show a "View Product" CTA that leads to a dead page.
      status: row.status,
      isVideoOnly: row.status === "hidden",
    },
  });
});

/**
 * POST /api/boost/video-only
 * Creates a ghost listing (status=hidden, price=0) with a promo video and
 * optional CTA, then boosts it instantly from the wallet.
 * Returns 402 with INSUFFICIENT_WALLET code + listingId if funds are low.
 */
router.post("/boost/video-only", requireAuth, requireNotRestricted, requireCardNotBlocked, async (req, res): Promise<void> => {
  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);

  // Regular users must have a country on their profile.
  // Admins/super-admins may omit it; audienceCountry or "Haiti" is used instead.
  if (!isAdmin && !req.user?.country) {
    res.status(400).json({ error: "Complete your profile country before boosting" });
    return;
  }

  const rawVideo = req.body?.videoUrl;
  const videoPath = typeof rawVideo === "string" ? rawVideo.trim() : "";
  const isValidVideoPath = videoPath.length > 0 && videoPath.length <= 500 && (
    videoPath.startsWith("/objects/") ||
    videoPath.startsWith("/api/storage/objects/") ||
    videoPath.startsWith("https://")
  );
  if (!isValidVideoPath) {
    res.status(400).json({ error: "Invalid or missing videoUrl (must be a storage path or https:// URL)" });
    return;
  }
  const videoUrl = videoPath;

  const VALID_CTA = ["link", "whatsapp", "none"] as const;
  type CtaType = typeof VALID_CTA[number];
  const rawCta = req.body.ctaType as string | undefined;
  const ctaType: CtaType = VALID_CTA.includes(rawCta as CtaType) ? (rawCta as CtaType) : "none";

  const externalLink = typeof req.body.externalLink === "string" ? req.body.externalLink.trim().slice(0, 500) || null : null;
  const whatsappNumber = typeof req.body.whatsappNumber === "string" ? req.body.whatsappNumber.trim().slice(0, 50) || null : null;
  const ctaText = typeof req.body.ctaText === "string" ? req.body.ctaText.trim().slice(0, 100) || null : null;

  const rawCountry = isAdmin
    ? ((typeof req.body.audienceCountry === "string" && req.body.audienceCountry.trim()) ? req.body.audienceCountry.trim() : (req.user?.country ?? "Haiti"))
    : req.user!.country!;
  // Super-admins may target ALL countries globally.
  const isAllCountries = !!(req.user?.isSuperAdmin) && rawCountry === "ALL";
  const country = rawCountry;
  const state = (!isAllCountries && country === "Haiti") ? (req.user.state ?? "Ouest") : null;
  const city  = (!isAllCountries && typeof req.body.audienceCity === "string" && req.body.audienceCity.trim())
    ? req.body.audienceCity.trim()
    : (!isAllCountries ? (req.user.location ?? null) : null);
  const gender = ["all", "male", "female"].includes(req.body.audienceGender) ? req.body.audienceGender : "all";
  const ageMin = Number.isFinite(Number(req.body.audienceAgeMin)) ? Math.max(13, Math.min(79, Number(req.body.audienceAgeMin))) : 18;
  const ageMax = Number.isFinite(Number(req.body.audienceAgeMax)) ? Math.max(ageMin + 1, Math.min(80, Number(req.body.audienceAgeMax))) : 65;
  const plan: Plan = "7day";
  const planMeta = PLAN_META[plan];
  const rawBudget = req.body.budget;
  const budgetCheck = validateBudget(rawBudget ?? planMeta.basePrice, plan);
  const budget = budgetCheck.ok ? budgetCheck.budget : planMeta.basePrice;
  const expiresAt = new Date(Date.now() + planMeta.days * 24 * 60 * 60 * 1000);
  const reach = estimateReach(budget, plan, {
    country, state, city, audienceType: "advantage_plus", ageMin, ageMax, gender, objective: "auto",
  });

  // Create ghost listing (status=hidden so it won't appear in browse).
  // Ghost listing must have a real country (not "ALL") for DB constraints.
  const listingCountry = isAllCountries ? (req.user?.country ?? "Haiti") : country;
  const [listing] = await db.insert(listingsTable).values({
    title: ctaText?.slice(0, 80) || "Video Promo",
    description: "Video promotion boost",
    price: 0,
    categoryId: 1,
    condition: "new",
    location: listingCountry,
    country: listingCountry,
    images: [],
    status: "hidden",
    sellerId: req.userId!,
    boostVideoUrl: videoUrl,
    boostCtaType: ctaType === "none" ? null : ctaType,
    boostExternalLink: externalLink,
    boostWhatsappNumber: whatsappNumber,
    boostCtaText: ctaText,
  }).returning();

  // Create boost record
  const [boost] = await db.insert(boostsTable).values({
    listingId: listing.id,
    userId: req.userId!,
    plan,
    price: budget,
    budget,
    estimatedReach: reach,
    audienceType: "advantage_plus",
    audienceName: null,
    audienceCountry: country,
    audienceState: state,
    audienceCity: city,
    audienceCities: city ? [city] : null,
    audienceNeighborhood: null,
    audienceRadiusKm: null,
    audienceAgeMin: ageMin,
    audienceAgeMax: ageMax,
    audienceGender: gender,
    objective: "auto",
    paymentMethod: "wallet",
    paymentStatus: "pending",
    expiresAt,
  }).returning();

  // Attempt wallet deduction (promo-first, then real balance)
  const result = await deductWalletHybrid(req.userId!, budget, `Video-only boost #${listing.id}`, "boost_debit", req.userId!);

  if (!result.ok) {
    const total = result.promoBalance + result.realBalance;
    res.status(402).json({
      error: "Balans pa ase (promo + reyèl)",
      code: "INSUFFICIENT_WALLET",
      listingId: listing.id,
      promoBalance: parseFloat(result.promoBalance.toFixed(2)),
      realBalance: parseFloat(result.realBalance.toFixed(2)),
      totalBalance: parseFloat(total.toFixed(2)),
      requiredUsd: parseFloat(budget.toFixed(2)),
      shortfallUsd: parseFloat((budget - total).toFixed(2)),
    });
    return;
  }

  // Activate boost
  const paymentRef = `WBOOST-${boost.id}-${Date.now()}`;
  await db.update(boostsTable).set({ paymentStatus: "paid", paymentRef }).where(eq(boostsTable.id, boost.id));
  await db.update(listingsTable).set({
    isBoosted: true,
    boostStartAt: new Date(),
    boostExpiresAt: expiresAt,
    boostAudienceCountry: country,
    boostAudienceState: state,
    boostAudienceCities: city ? [city] : null,
    boostAudienceCity: city,
    boostAudienceAgeMin: ageMin,
    boostAudienceAgeMax: ageMax,
    boostAudienceGender: gender,
    boostAudienceObjective: "auto",
    boostAudienceType: "advantage_plus",
  }).where(eq(listingsTable.id, listing.id));

  await db.insert(notificationsTable).values({
    userId: req.userId!, actorId: req.userId!, type: "boost_approved", listingId: listing.id,
  }).catch(() => {});

  res.json({
    listingId: listing.id,
    boostId: boost.id,
    activated: true,
    plan,
    price: budget,
    expiresAt: expiresAt.toISOString(),
    promoUsed: result.promoUsed,
    realUsed: result.realUsed,
  });
});

/**
 * POST /api/listings/:id/boost/stripe-checkout
 * Creates a Stripe Checkout Session for a pending card-payment boost.
 * The user is redirected to Stripe's hosted page; on success Stripe fires
 * the checkout.session.completed webhook which auto-activates the boost.
 */
router.post("/listings/:id/boost/stripe-checkout", requireAuth, requireCardNotBlocked, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.params.id), 10);
  const boostId   = parseInt(String(req.body.boostId ?? "0"), 10);
  if (!boostId) { res.status(400).json({ error: "boostId required" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }

  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  if (listing.sellerId !== req.userId && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const [boost] = await db.select().from(boostsTable).where(
    and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId))
  );
  if (!boost) { res.status(404).json({ error: "Boost not found" }); return; }
  if (boost.paymentStatus !== "pending") {
    res.status(400).json({ error: `Boost is already ${boost.paymentStatus}` }); return;
  }

  try {
    const stripe = await getStripeClient();
    const amountCents = Math.round((boost.price ?? 0) * 100);
    if (amountCents < 50) { res.status(400).json({ error: "Amount too small for card payment (min $0.50)" }); return; }

    const planDays = boost.plan.includes("7") ? 7 : boost.plan.includes("3") ? 3 : 1;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `Boost: ${(listing.title ?? "Listing").slice(0, 100)}`,
            description: `${planDays}-day promoted listing boost on FLEXA MARKET`,
          },
        },
      }],
      success_url: `${BOOST_BASE_URL}/boost/${listingId}?boost_success=1&session_id={CHECKOUT_SESSION_ID}&return_app=1`,
      cancel_url:  `${BOOST_BASE_URL}/boost/${listingId}?return_app=1`,
      metadata: {
        type:        "boost",
        boostId:     String(boost.id),
        listingId:   String(listingId),
        buyerUserId: String(req.userId),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logger.error({ err }, "boost/stripe-checkout error");
    res.status(500).json({ error: "Failed to create Stripe checkout session" });
  }
});

router.get("/listings/:id/boosts", requireAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.params.id), 10);
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  if (listing.sellerId !== req.userId && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const boosts = await db.select().from(boostsTable)
    .where(eq(boostsTable.listingId, listingId))
    .orderBy(desc(boostsTable.createdAt));

  res.json(boosts.map(b => ({
    ...b,
    expiresAt: b.expiresAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  })));
});

/**
 * GET /api/boost/my-active
 * Returns the authenticated seller's currently active boosts (with promo video).
 */
router.get("/boost/my-active", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();

  const rows = await db
    .select({
      listingId: listingsTable.id,
      title: listingsTable.title,
      price: listingsTable.price,
      images: listingsTable.images,
      boostVideoUrl: listingsTable.boostVideoUrl,
      boostStartAt: listingsTable.boostStartAt,
      boostExpiresAt: listingsTable.boostExpiresAt,
      viewCount: listingsTable.viewCount,
      impressions: boostsTable.impressions,
      clicks: boostsTable.clicks,
      boostId: boostsTable.id,
      plan: boostsTable.plan,
      budget: boostsTable.budget,
    })
    .from(boostsTable)
    .innerJoin(
      listingsTable,
      eq(listingsTable.id, boostsTable.listingId),
    )
    .where(
      and(
        eq(boostsTable.userId, userId),
        eq(boostsTable.paymentStatus, "paid"),
        eq(listingsTable.isBoosted, true),
        gt(listingsTable.boostExpiresAt, now),
        sql`(${listingsTable.boostStartAt} IS NULL OR ${listingsTable.boostStartAt} <= ${now.toISOString()})`,
      ),
    )
    .orderBy(desc(listingsTable.boostExpiresAt));

  res.json({
    boosts: rows.map(r => ({
      listingId: r.listingId,
      title: r.title,
      price: r.price,
      thumbnail: r.images?.[0] ?? null,
      boostVideoUrl: await resolveBoostVideoUrl(r.boostVideoUrl),
      boostStartAt: r.boostStartAt?.toISOString() ?? null,
      boostExpiresAt: r.boostExpiresAt?.toISOString() ?? null,
      viewCount: r.viewCount,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      boostId: r.boostId,
      plan: r.plan,
      budget: r.budget,
    })),
  });
});

/**
 * PATCH /api/boost/:boostId/video
 * Updates (or removes) the promo video URL on an existing active boost.
 * No new payment is required — the listing's boostVideoUrl column is patched
 * directly so the video appears (or disappears) in the live feed immediately.
 */
router.patch("/boost/:boostId/video", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const boostId = parseInt(String(req.params.boostId), 10);
  if (isNaN(boostId)) { res.status(400).json({ error: "Invalid boost id" }); return; }

  const [boost] = await db.select().from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.userId, userId)));
  if (!boost) { res.status(404).json({ error: "Boost not found" }); return; }
  if (boost.paymentStatus !== "paid") {
    res.status(400).json({ error: "Can only update video on a paid active boost" });
    return;
  }

  const rawVideo = req.body?.videoUrl;
  let videoUrl: string | null = null;
  if (typeof rawVideo === "string") {
    const v = rawVideo.trim();
    if (v.length > 0 && v.length <= 500 && (
      v.startsWith("/objects/") ||
      v.startsWith("/api/storage/objects/") ||
      v.startsWith("https://")
    )) {
      videoUrl = v;
    } else if (v.length > 0) {
      res.status(400).json({ error: "Invalid video URL format" });
      return;
    }
  }

  await db.update(listingsTable)
    .set({ boostVideoUrl: videoUrl })
    .where(eq(listingsTable.id, boost.listingId));

  res.json({ ok: true, boostVideoUrl: videoUrl });
});

/**
 * POST /api/boost/:boostId/cancel
 * Cancels an active paid boost and issues a prorated refund to the user's FM Wallet.
 */
router.post("/boost/:boostId/cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const boostId = parseInt(String(req.params.boostId), 10);
  if (isNaN(boostId)) { res.status(400).json({ error: "Invalid boost id" }); return; }

  const [boost] = await db.select().from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.userId, userId)));
  if (!boost) { res.status(404).json({ error: "Boost not found" }); return; }
  if (boost.paymentStatus !== "paid") {
    res.status(400).json({ error: "Only active paid boosts can be cancelled" });
    return;
  }

  const [listing] = await db.select().from(listingsTable)
    .where(eq(listingsTable.id, boost.listingId));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }

  // Prorated refund: remaining time / total duration × budget
  const now = new Date();
  const startAt = listing.boostStartAt ?? boost.createdAt;
  const expiresAt = boost.expiresAt;
  const totalMs = expiresAt.getTime() - startAt.getTime();
  const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
  const refundRatio = totalMs > 0 ? remainingMs / totalMs : 0;
  const budget = boost.budget ?? boost.price ?? 0;
  const refundUsd = parseFloat((budget * refundRatio).toFixed(2));

  let cancelled = false;
  await db.transaction(async (tx) => {
    // Atomic guard: only cancel if still 'paid' — prevents double-refund from
    // two concurrent cancel requests that both passed the outer status check.
    const [claimed] = await tx.update(boostsTable)
      .set({ paymentStatus: "cancelled" })
      .where(and(eq(boostsTable.id, boostId), eq(boostsTable.paymentStatus, "paid")))
      .returning({ id: boostsTable.id });

    if (!claimed) return; // already cancelled by a concurrent request — skip refund
    cancelled = true;

    // Clear ALL boost-related fields on the listing so no stale targeting remains
    await tx.update(listingsTable)
      .set({
        isBoosted: false,
        boostExpiresAt: null,
        boostStartAt: null,
        boostVideoUrl: null,
        boostAudienceCountry: null,
        boostAudienceCity: null,
        boostAudienceCities: null,
        boostAudienceState: null,
        boostAudienceNeighborhood: null,
        boostAudienceRadiusKm: null,
        boostAudienceAgeMin: null,
        boostAudienceAgeMax: null,
        boostAudienceGender: null,
        boostAudienceObjective: null,
        boostAudienceType: null,
        boostAudienceInterests: null,
        boostDailyBudget: null,
        boostDurationDays: null,
        boostCtaType: null,
        boostExternalLink: null,
        boostWhatsappNumber: null,
        boostCtaText: null,
      })
      .where(eq(listingsTable.id, boost.listingId));

    // Credit refund to wallet if there is anything to refund
    if (refundUsd > 0) {
      await tx.update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${refundUsd}`, updatedAt: new Date() })
        .where(eq(promoWalletTable.userId, userId));

      await tx.insert(walletTransactionsTable).values({
        userId,
        type: "boost_refund",
        amountUsd: refundUsd,
        status: "completed",
        note: `Rembourseman boost anile — ${listing.title} (${boost.plan})`,
      });
    }

    // Notification
    await tx.insert(notificationsTable).values({
      userId,
      actorId: userId,
      type: "boost_cancelled",
      title: "Boost anile",
      message: refundUsd > 0
        ? `Boost ou a pou "${listing.title}" anile. $${refundUsd.toFixed(2)} retounen sou FM Wallet ou.`
        : `Boost ou a pou "${listing.title}" anile.`,
      data: JSON.stringify({ listingId: boost.listingId, refundUsd }),
      isRead: false,
    } as any);
  });

  if (!cancelled) {
    res.status(409).json({ error: "Boost deja anile" });
    return;
  }

  logger.info({ userId, boostId, refundUsd }, "Boost cancelled with prorated refund");
  res.json({ ok: true, refundUsd });
});

/**
 * Runs every 30 minutes. Finds all listings whose boost has expired
 * (boostExpiresAt < NOW()) and resets every boost-related column so the
 * listing no longer appears in the video feed, boosted-feed, or anywhere
 * isBoosted is checked.
 */
export async function runBoostExpiryJob(): Promise<void> {
  try {
    // Step 1: find which listings are about to be expired (capture before clearing)
    const expiring = await db
      .select({ id: listingsTable.id, sellerId: listingsTable.sellerId, title: listingsTable.title })
      .from(listingsTable)
      .where(and(eq(listingsTable.isBoosted, true), sql`${listingsTable.boostExpiresAt} < NOW()`));

    if (expiring.length === 0) return;

    // Step 2: clear ALL boost-related columns so no stale targeting data remains
    const result = await db
      .update(listingsTable)
      .set({
        isBoosted: false,
        boostExpiresAt: null,
        boostStartAt: null,
        boostVideoUrl: null,
        boostAudienceCountry: null,
        boostAudienceCity: null,
        boostAudienceCities: null,
        boostAudienceState: null,
        boostAudienceNeighborhood: null,
        boostAudienceRadiusKm: null,
        boostAudienceAgeMin: null,
        boostAudienceAgeMax: null,
        boostAudienceGender: null,
        boostAudienceObjective: null,
        boostAudienceType: null,
        boostAudienceInterests: null,
        boostDailyBudget: null,
        boostDurationDays: null,
        boostCtaType: null,
        boostExternalLink: null,
        boostWhatsappNumber: null,
        boostCtaText: null,
      })
      .where(and(eq(listingsTable.isBoosted, true), sql`${listingsTable.boostExpiresAt} < NOW()`));

    // Step 3: notify each seller that their boost expired
    if (expiring.length > 0) {
      await db.insert(notificationsTable).values(
        expiring.map(l => ({
          userId: l.sellerId,
          actorId: l.sellerId,
          type: "boost_expired" as const,
          title: "Boost ekspire",
          message: `Boost ou a pou "${l.title}" ekspire. Ranfòse lis ou a ankò pou plis vizibilite.`,
          data: JSON.stringify({ listingId: l.id }),
          isRead: false,
        }))
      ).catch(err => logger.error({ err }, "Boost expiry: failed to insert notifications"));
    }

    logger.info({ count: expiring.length, rows: (result as any).rowCount ?? "?" }, "Boost expiry job: expired boosts cleared");
  } catch (err) {
    logger.error({ err }, "Boost expiry job failed");
  }
}

/**
 * POST /api/boost/verify-stripe-payment
 *
 * Fallback activation for Stripe boost payments.
 * Called by the frontend when it returns to the success URL with ?session_id=...
 * This handles the case where the Stripe webhook has not fired yet or was missed.
 * Idempotent — safe to call multiple times for the same session.
 *
 * Body: { sessionId: string }
 * Response: { activated: boolean, message: string }
 */
router.post("/boost/verify-stripe-payment", requireAuth, async (req, res): Promise<void> => {
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "sessionId is required" }); return;
  }

  try {
    const stripe = await getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (session.payment_status !== "paid") {
      res.json({ activated: false, message: "Payment not completed yet" }); return;
    }

    if (session.metadata?.type !== "boost") {
      res.status(400).json({ error: "Session is not a boost payment" }); return;
    }

    const boostId = session.metadata?.boostId ? Number(session.metadata.boostId) : null;
    if (!boostId) {
      res.status(400).json({ error: "Session missing boostId metadata" }); return;
    }

    // Security check: verify this boost belongs to the requesting user
    const [boost] = await db.select().from(boostsTable).where(eq(boostsTable.id, boostId));
    if (!boost) { res.status(404).json({ error: "Boost not found" }); return; }
    if (boost.userId !== req.userId && !req.user?.isAdmin) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    if (boost.paymentStatus === "paid") {
      res.json({ activated: true, message: "Boost already active (idempotent)" }); return;
    }

    // Reuse the same activation logic as the webhook handler
    await handleCheckoutCompleted(session);

    logger.info({ boostId, sessionId, userId: req.userId }, "Boost activated via verify-stripe-payment fallback");
    res.json({ activated: true, message: "Boost activated successfully" });
  } catch (err: any) {
    logger.error({ err, sessionId }, "boost/verify-stripe-payment error");
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

export default router;
