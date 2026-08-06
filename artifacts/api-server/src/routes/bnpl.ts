import { Router } from "express";
import { db, usersTable, transactionsTable, listingsTable, promoWalletTable, walletTransactionsTable, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";
import { eq, and, gte, count, avg, sql } from "drizzle-orm";
import { quoteForListing } from "../lib/commission";
import type { Request, Response } from "express";

const router = Router();

const BASE_URL = (() => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : "https://flexamarket.com";
})();

// ── BNPL Eligibility Scoring ───────────────────────────────────────────────────
async function computeEligibility(userId: number): Promise<{
  eligible: boolean;
  score: number;
  accountAgeDays: number;
  completedOrders: number;
  isPhoneVerified: boolean;
  avgRating: number;
  checks: { label: string; passed: boolean; weight: number }[];
}> {
  const [user] = await db.select({
    id: usersTable.id,
    createdAt: usersTable.createdAt,
    isPhoneVerified: usersTable.isPhoneVerified,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) return { eligible: false, score: 0, accountAgeDays: 0, completedOrders: 0, isPhoneVerified: false, avgRating: 0, checks: [] };

  const accountAgeDays = Math.floor((Date.now() - new Date(user.createdAt ?? 0).getTime()) / 86400000);

  // Count completed purchases as buyer
  const [orderRow] = await db.select({ cnt: count() }).from(transactionsTable)
    .where(and(eq(transactionsTable.userId, userId), eq(transactionsTable.orderStatus, "completed")));
  const completedOrders = Number(orderRow?.cnt ?? 0);

  // Average rating as a buyer/user (table may not exist yet)
  let avgRating = 0;
  try {
    const [ratingRow] = await db.execute(sql.raw(
      `SELECT AVG(rating) as avg_rating FROM ratings WHERE rated_user_id = ${userId}`
    )) as any;
    avgRating = parseFloat(ratingRow?.avg_rating ?? "0") || 0;
  } catch {
    avgRating = 0;
  }

  const checks = [
    { label: "Kont aktif 90+ jou", passed: accountAgeDays >= 90, weight: 30 },
    { label: "Telefòn verifye", passed: !!user.isPhoneVerified, weight: 25 },
    { label: "3+ kòmand konplete", passed: completedOrders >= 3, weight: 25 },
    { label: "Nòt mwayen 3.5+", passed: avgRating >= 3.5 || avgRating === 0, weight: 20 },
  ];

  const score = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const eligible = score >= 75;

  return { eligible, score, accountAgeDays, completedOrders, isPhoneVerified: !!user.isPhoneVerified, avgRating, checks };
}

// ── GET /api/bnpl/settings — public settings ─────────────────────────────────
router.get("/bnpl/settings", async (_req: Request, res: Response): Promise<void> => {
  const fallback = { klarnaEnabled: true, affirmEnabled: true, afterpayEnabled: true, minAmountUsd: 50, maxAmountUsd: 2000, platformFeePct: 3.5 };
  try {
    const rows = await db.execute(sql.raw(`SELECT * FROM bnpl_settings WHERE id = 1 LIMIT 1`)) as any[];
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!row) { res.json(fallback); return; }

    res.json({
      klarnaEnabled: row.klarna_enabled,
      affirmEnabled: row.affirm_enabled,
      afterpayEnabled: row.afterpay_enabled,
      minAmountUsd: row.min_amount_usd,
      maxAmountUsd: row.max_amount_usd,
      platformFeePct: row.platform_fee_pct,
    });
  } catch (err: any) {
    logger.warn({ err }, "bnpl settings fetch failed");
    res.json(fallback);
  }
});

// ── GET /api/bnpl/eligibility — check user eligibility ───────────────────────
router.get("/bnpl/eligibility", requireAuth, async (req: any, res: Response): Promise<void> => {
  try {
    const result = await computeEligibility(req.userId!);
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "bnpl eligibility check failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/bnpl/checkout — create Stripe session with BNPL methods ─────────
router.post("/bnpl/checkout", requireAuth, async (req: any, res: Response): Promise<void> => {
  try {
    const { listingId, shippingName, shippingEmail, shippingPhone, shippingStreet, shippingCity, shippingRegion, shippingZip, shippingCountry, deliveryFeeUsd, deliveryMethod, deliveryPickupCity, bnplMethod } = req.body;

    if (!listingId) { res.status(400).json({ error: "listingId requi" }); return; }

    // Verify eligibility
    const eligibility = await computeEligibility(req.userId!);
    if (!eligibility.eligible) {
      res.status(403).json({ error: "Ou pa kalifye pou BNPL. Bezwen 90 jou, telefòn verifye, ak 3 kòmand konplete.", eligibility });
      return;
    }

    const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, Number(listingId)));
    if (!listing) { res.status(404).json({ error: "Lis pa jwenn" }); return; }
    if (listing.status !== "available") { res.status(400).json({ error: "Lis pa disponib" }); return; }
    if (listing.sellerId === req.userId) { res.status(400).json({ error: "Ou pa ka achte pwòp bagay ou" }); return; }

    const safeDeliveryFee = typeof deliveryFeeUsd === "number" && deliveryFeeUsd > 0 ? deliveryFeeUsd : 0;
    const safeDeliveryMethod = typeof deliveryMethod === "string" ? deliveryMethod : null;
    const safePickupCity = typeof deliveryPickupCity === "string" ? deliveryPickupCity : null;

    const quote = await quoteForListing(listing, "stripe", safeDeliveryFee);
    const buyerTotalCents = Math.round(quote.buyerTotal * 100);

    // Build BNPL payment method types based on what's requested
    const bnplMethods: string[] = ["card"];
    const validBnpl = ["klarna", "affirm", "afterpay_clearpay"];
    if (bnplMethod && validBnpl.includes(bnplMethod)) {
      bnplMethods.push(bnplMethod);
    } else {
      // All enabled BNPL methods
      bnplMethods.push("klarna", "afterpay_clearpay");
    }

    const stripe = await getStripeClient();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: bnplMethods as any,
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: buyerTotalCents,
          product_data: {
            name: listing.title,
            description: `Achte via Flexa BNPL${safeDeliveryFee > 0 ? ` + Livrezon $${safeDeliveryFee.toFixed(2)}` : ""}`,
          },
        },
      }],
      shipping_address_collection: {
        allowed_countries: ["US", "HT", "DO", "CA", "GB", "FR", "AU"],
      },
      billing_address_collection: "required",
      customer_email: shippingEmail ?? undefined,
      success_url: `${BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&bnpl=1`,
      cancel_url: `${BASE_URL}/listings/${listing.id}`,
      metadata: {
        listingId: String(listing.id),
        buyerUserId: String(req.userId),
        sellerUserId: String(listing.sellerId),
        sellerCardPayoutMethod: "fm_wallet",
        commissionRate: String(quote.rate),
        buyerFeeRate: String(quote.buyerFeeRate),
        deliveryFeeUsd: String(safeDeliveryFee),
        deliveryMethod: safeDeliveryMethod ?? "",
        deliveryPickupCity: safePickupCity ?? "",
        deliveryDestCity: shippingCity ?? "",
        shippingName: shippingName ?? "",
        shippingPhone: shippingPhone ?? "",
        shippingEmail: shippingEmail ?? "",
        shippingStreet: shippingStreet ?? "",
        shippingCity: shippingCity ?? "",
        shippingRegion: shippingRegion ?? "",
        shippingZip: shippingZip ?? "",
        type: "bnpl",
        bnplMethod: bnplMethod ?? "any",
      },
    });

    // Create pending transaction
    await db.insert(transactionsTable).values({
      userId: req.userId,
      listingId: listing.id,
      sellerUserId: listing.sellerId,
      type: "purchase",
      amount: listing.price,
      currency: "USD",
      paymentMethod: `bnpl_${bnplMethod ?? "stripe"}`,
      paymentStatus: "pending",
      orderStatus: "pending",
      commissionRate: quote.rate,
      commissionAmount: quote.commissionAmount,
      sellerEarnings: quote.sellerEarnings,
      buyerFeeRate: quote.buyerFeeRate,
      buyerFeeAmount: quote.buyerFeeAmount,
      stripeSessionId: session.id,
      // Must mirror stripeCheckoutSessionId so the shared Stripe completion
      // handler (handleCheckoutCompleted / /stripe/checkout/activate) can
      // locate this transaction by session_id on webhook or return.
      stripeCheckoutSessionId: session.id,
    } as any);

    res.json({ sessionUrl: session.url, sessionId: session.id });
  } catch (err: any) {
    logger.error({ err }, "bnpl checkout failed");
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

// ── PATCH /api/admin/bnpl/settings — admin update ─────────────────────────────
router.patch("/admin/bnpl/settings", requireAuth, async (req: any, res: Response): Promise<void> => {
  try {
    const { klarnaEnabled, affirmEnabled, afterpayEnabled, minAmountUsd, maxAmountUsd, platformFeePct } = req.body;

    await db.execute(sql.raw(`
      INSERT INTO bnpl_settings (id, klarna_enabled, affirm_enabled, afterpay_enabled, min_amount_usd, max_amount_usd, platform_fee_pct, updated_at)
      VALUES (1, ${klarnaEnabled ? "true" : "false"}, ${affirmEnabled ? "true" : "false"}, ${afterpayEnabled ? "true" : "false"}, ${Number(minAmountUsd) || 50}, ${Number(maxAmountUsd) || 2000}, ${Number(platformFeePct) || 3.5}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        klarna_enabled = EXCLUDED.klarna_enabled,
        affirm_enabled = EXCLUDED.affirm_enabled,
        afterpay_enabled = EXCLUDED.afterpay_enabled,
        min_amount_usd = EXCLUDED.min_amount_usd,
        max_amount_usd = EXCLUDED.max_amount_usd,
        platform_fee_pct = EXCLUDED.platform_fee_pct,
        updated_at = NOW()
    `));

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "admin bnpl settings update failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/bnpl/analytics — BNPL transaction overview ─────────────────
router.get("/admin/bnpl/analytics", requireAuth, async (req: any, res: Response): Promise<void> => {
  try {
    const [stats] = await db.execute(sql.raw(`
      SELECT
        COUNT(*) FILTER (WHERE payment_method LIKE 'bnpl%') AS total_count,
        SUM(amount) FILTER (WHERE payment_method LIKE 'bnpl%' AND payment_status = 'paid') AS total_volume,
        COUNT(*) FILTER (WHERE payment_method LIKE 'bnpl%' AND payment_status = 'paid') AS paid_count,
        COUNT(*) FILTER (WHERE payment_method LIKE 'bnpl%' AND payment_status = 'pending') AS pending_count
      FROM transactions
    `)) as any;

    const recent = await db.execute(sql.raw(`
      SELECT t.id, t.amount, t.payment_method, t.payment_status, t.order_status, t.created_at,
             u.name AS buyer_name, l.title AS listing_title
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN listings l ON t.listing_id = l.id
      WHERE t.payment_method LIKE 'bnpl%'
      ORDER BY t.created_at DESC
      LIMIT 50
    `)) as any[];

    res.json({ stats: stats ?? {}, transactions: recent ?? [] });
  } catch (err: any) {
    req.log.error({ err }, "admin bnpl analytics failed");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
