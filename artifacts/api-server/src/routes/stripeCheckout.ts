import { Router } from "express";
import { db, usersTable, transactionsTable, listingsTable, promoWalletTable, walletTransactionsTable, boostsTable, notificationsTable, sellerPayoutAccountsTable, offersTable } from "@workspace/db";
import { sendPushToUser } from "../lib/push";
import { sendExpoPushToUser } from "../lib/expo-push";
import { sendEmail } from "../lib/email";
import { orderPlacedBuyerEmail, orderSoldSellerEmail } from "../lib/emailTemplates";
import { handleSubscriptionCheckoutCompleted, handleSubscriptionInvoicePaid, handleSubscriptionDeleted, handleSubscriptionPaymentFailed, handleSubscriptionUpdated } from "./subscription";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { payReferralBonusIfEligible, applyRechargeCredits } from "./wallet";
import { quoteForListing } from "../lib/commission";
import { requireAuth } from "../middlewares/auth";
import { getStripeClient, getStripeWebhookSecret } from "../lib/stripeClient";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";
import Stripe from "stripe";

const router = Router();

const BASE_URL = (() => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : "https://flexamarket.com";
})();

function decrementStock(listing: typeof listingsTable.$inferSelect): Partial<typeof listingsTable.$inferInsert> {
  if (listing.stockQuantity === null || listing.stockQuantity === undefined) {
    return { status: "sold" };
  }
  const next = listing.stockQuantity - 1;
  return next > 0 ? { stockQuantity: next } : { stockQuantity: 0, status: "sold" };
}

const DEFAULT_COMMISSION = 0.07; // 7%

async function getPlatformCommission(): Promise<number> {
  try {
    const rows = await db.execute(
      sql`SELECT value FROM platform_settings WHERE key = 'stripe_commission_rate' LIMIT 1`
    );
    if (rows.rows[0]) {
      const v = parseFloat(String(rows.rows[0].value));
      if (!isNaN(v) && v >= 0 && v <= 1) return v;
    }
  } catch { /* fall through */ }
  return DEFAULT_COMMISSION;
}

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for a listing purchase.
 * Automatically routes commission to platform and remainder to vendor.
 */
router.post("/stripe/checkout", requireAuth, async (req: any, res) => {
  try {
    const { listingId, shippingName, shippingPhone, shippingEmail, shippingStreet, shippingCity, shippingRegion, shippingZip, deliveryFeeUsd, deliveryMethod, deliveryPickupCity } = req.body;

    if (!listingId) return res.status(400).json({ error: "listingId is required" });

    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, Number(listingId)));

    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (listing.status !== "available") return res.status(400).json({ error: "Listing is not available" });
    if (listing.sellerId === req.userId) return res.status(400).json({ error: "Cannot buy your own listing" });

    // Offer price override — buyer may have negotiated a custom price.
    const offerIdRaw = typeof req.body?.offerId === "number" ? req.body.offerId : null;
    let listingPriceUsd = listing.price;
    if (offerIdRaw !== null) {
      const [offerRow] = await db.select()
        .from(offersTable)
        .where(and(
          eq(offersTable.id, offerIdRaw),
          eq(offersTable.listingId, Number(listingId)),
          eq(offersTable.buyerId, req.userId),
          eq(offersTable.status, "accepted"),
        ));
      if (!offerRow) return res.status(400).json({ error: "Offer not found or not accepted for this listing" });
      listingPriceUsd = offerRow.counterAmount ?? offerRow.amount;
    }

    const [seller] = await db
      .select({ id: usersTable.id, stripeAccountId: usersTable.stripeAccountId, stripeAccountStatus: usersTable.stripeAccountStatus })
      .from(usersTable)
      .where(eq(usersTable.id, listing.sellerId));

    // Check seller's card payout preference
    const [sellerPayoutAcct] = await db
      .select({ cardPayoutMethod: sellerPayoutAccountsTable.cardPayoutMethod })
      .from(sellerPayoutAccountsTable)
      .where(eq(sellerPayoutAccountsTable.userId, listing.sellerId));
    const sellerCardPayoutMethod = sellerPayoutAcct?.cardPayoutMethod ?? "fm_wallet";

    const stripe = await getStripeClient();

    // Sanitise the optional delivery fee passed from the frontend
    const safeDeliveryFee = typeof deliveryFeeUsd === "number" && deliveryFeeUsd > 0 ? deliveryFeeUsd : 0;
    const safeDeliveryMethod = typeof deliveryMethod === "string" ? deliveryMethod : null;
    const safePickupCity = typeof deliveryPickupCity === "string" ? deliveryPickupCity : null;

    // Commission + buyer fee breakdown (unified system — delivery fee added on top of product price)
    const quote = await quoteForListing({ ...listing, price: listingPriceUsd }, "stripe", safeDeliveryFee);

    // Buyer pays: listing price + 2.5% buyer fee + delivery fee
    // All amounts in USD (Stripe always charges in USD for this platform)
    // listingPriceUsd is already set above (possibly overridden by accepted offer price)
    const buyerTotalUsd = quote.buyerTotal;
    const buyerTotalCents = Math.round(buyerTotalUsd * 100);
    const platformFeeCents = Math.round(quote.commissionAmount * 100);

    const descParts: string[] = [];
    if (listing.description?.slice(0, 120)) descParts.push(listing.description.slice(0, 120));
    if (quote.buyerFeeAmount > 0) descParts.push(`Frè sèvis $${quote.buyerFeeAmount.toFixed(2)} (${(quote.buyerFeeRate * 100).toFixed(1)}%)`);
    if (safeDeliveryFee > 0) descParts.push(`Livrezon $${safeDeliveryFee.toFixed(2)}`);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            // Buyer is charged listing price + buyer service fee + delivery fee
            unit_amount: buyerTotalCents,
            product_data: {
              name: listing.title,
              description: descParts.join(" — ") || undefined,
              // images intentionally omitted — presigned object-storage URLs
              // are rejected by Stripe's CDN; skip to avoid checkout failure.
              metadata: {
                listingId: String(listing.id),
                sellerId: String(listing.sellerId),
              },
            },
          },
        },
      ],
      success_url: `${BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/listings/${listing.id}`,
      metadata: {
        listingId: String(listing.id),
        buyerUserId: String(req.userId),
        sellerUserId: String(listing.sellerId),
        sellerCardPayoutMethod,
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
      },
    };

    // If seller has an active Connect account, route funds
    if (seller?.stripeAccountId && seller.stripeAccountStatus === "active") {
      sessionParams.payment_intent_data = {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: seller.stripeAccountId },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Create a pending transaction record — amount = listing price (seller side)
    await db.insert(transactionsTable).values({
      userId: req.userId,
      listingId: listing.id,
      sellerUserId: listing.sellerId,
      type: "purchase",
      amount: listingPriceUsd,
      currency: "USD",
      paymentMethod: "stripe",
      paymentStatus: "pending",
      orderStatus: "pending",
      commissionRate: quote.rate,
      commissionAmount: quote.commissionAmount,
      sellerEarnings: quote.sellerEarnings,
      buyerFeeRate: quote.buyerFeeRate,
      buyerFeeAmount: quote.buyerFeeAmount,
      deliveryFeeUsd: safeDeliveryFee > 0 ? safeDeliveryFee : null,
      deliveryMethod: safeDeliveryMethod,
      deliveryPickupCity: safePickupCity,
      deliveryDestCity: shippingCity ?? null,
      buyerTotal: buyerTotalUsd,
      listingCurrency: listing.currency ?? "USD",
      listingPriceOriginal: listing.price,
      stripeCheckoutSessionId: session.id,
      listingCountry: listing.country ?? null,
      shippingName: shippingName ?? null,
      shippingPhone: shippingPhone ?? null,
      shippingEmail: shippingEmail ?? null,
      shippingStreet: shippingStreet ?? null,
      shippingCity: shippingCity ?? null,
      shippingRegion: shippingRegion ?? null,
      shippingZip: shippingZip ?? null,
    });

    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logger.error({ err }, "stripe/checkout error");
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
});

/**
 * GET /api/stripe/checkout/session
 * Returns the status/details of a completed checkout session.
 */
router.get("/stripe/checkout/session", requireAuth, async (req: any, res) => {
  try {
    const { session_id } = req.query as Record<string, string>;
    if (!session_id) return res.status(400).json({ error: "session_id required" });

    const stripe = await getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    // Fallback activation: if payment is confirmed but not yet processed
    // (webhook may not have fired), trigger handleCheckoutCompleted now.
    // This covers wallet_recharge and standard purchases.
    // Boost has its own dedicated verify endpoint — skip it here.
    if (
      session.payment_status === "paid" &&
      session.metadata?.type !== "boost" &&
      session.metadata?.type !== "vendor_subscription"
    ) {
      try {
        await handleCheckoutCompleted(session);
      } catch (activationErr) {
        logger.warn({ activationErr, session_id }, "stripe/checkout/session fallback activation failed (non-fatal)");
      }
    }

    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.stripeCheckoutSessionId, session_id));

    return res.json({
      status: session.payment_status,
      amount: (session.amount_total ?? 0) / 100,
      currency: session.currency,
      transaction: tx ?? null,
    });
  } catch (err) {
    logger.error({ err }, "stripe/checkout/session error");
    return res.status(500).json({ error: "Failed to retrieve session" });
  }
});


/**
 * GET /api/stripe/checkout/complete-redirect
 * Stripe success_url target. Browser lands here after payment.
 * Server immediately credits the wallet (idempotent), THEN redirects
 * the user to the wallet page — so they always see the updated balance.
 */
router.get("/stripe/checkout/complete-redirect", async (req, res) => {
  const { session_id } = req.query as Record<string, string>;

  const baseUrl = process.env.FRONTEND_URL
    || "https://flexamarket.com";

  if (!session_id || !/^cs_/.test(session_id)) {
    return res.redirect(`${baseUrl}/wallet?card_cancel=1&return_app=1`);
  }

  try {
    const stripe = await getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === "paid") {
      // Credit wallet server-side before the browser lands on wallet page
      await handleCheckoutCompleted(session); // fully idempotent
      const grossUsd = session.amount_total ? session.amount_total / 100 : 0;
      const netUsd   = Math.round(grossUsd * 0.98 * 100) / 100; // 2% fee
      return res.redirect(
        `${baseUrl}/wallet?recharged=1&amount=${netUsd.toFixed(2)}&return_app=1`
      );
    }

    // Not paid yet — fall back to old card_success flow which will poll
    return res.redirect(
      `${baseUrl}/wallet?card_success=1&session_id=${encodeURIComponent(session_id)}&return_app=1`
    );
  } catch (err) {
    logger.error({ err, session_id }, "complete-redirect error");
    // Safe fallback: send user to wallet with session_id so client-side activate can run
    return res.redirect(
      `${baseUrl}/wallet?card_success=1&session_id=${encodeURIComponent(session_id)}&return_app=1`
    );
  }
});

/**
 * GET /api/stripe/checkout/activate
 * Public (no auth) fallback activation used by the mobile app after a Stripe
 * redirect. The session_id is unguessable and handleCheckoutCompleted is
 * idempotent, so this cannot double-credit or credit unpaid sessions —
 * everything is verified against Stripe's own session state.
 */
router.get("/stripe/checkout/activate", async (req, res) => {
  try {
    const { session_id } = req.query as Record<string, string>;
    if (!session_id || !/^cs_/.test(session_id)) {
      return res.status(400).json({ error: "session_id required" });
    }

    const stripe = await getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (
      session.payment_status === "paid" &&
      session.metadata?.type !== "boost" &&
      session.metadata?.type !== "vendor_subscription"
    ) {
      await handleCheckoutCompleted(session);
      return res.json({ status: "paid", activated: true });
    }

    return res.json({ status: session.payment_status, activated: false });
  } catch (err) {
    logger.error({ err }, "stripe/checkout/activate error");
    return res.status(500).json({ error: "Failed to activate session" });
  }
});

/**
 * GET /api/admin/stripe/transactions
 * Admin: All Stripe transactions with pagination.
 */
router.get("/admin/stripe/transactions", requireAuth, async (req: any, res) => {
  try {
    if (!req.user?.isAdmin) return res.status(403).json({ error: "Admin only" });

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        tx: transactionsTable,
        buyer: { id: usersTable.id, name: usersTable.name, email: usersTable.email },
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(eq(transactionsTable.paymentMethod, "stripe"))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json({
      transactions: rows.map(r => ({ ...r.tx, buyer: r.buyer })),
      page,
      limit,
    });
  } catch (err) {
    logger.error({ err }, "admin/stripe/transactions error");
    return res.status(500).json({ error: "Failed to list transactions" });
  }
});

/**
 * GET /api/admin/stripe/commission
 * GET the platform Stripe commission rate.
 */
router.get("/admin/stripe/commission", requireAuth, async (req: any, res) => {
  try {
    if (!req.user?.isAdmin) return res.status(403).json({ error: "Admin only" });
    const rate = await getPlatformCommission();
    return res.json({ commissionRate: rate, commissionPercent: rate * 100 });
  } catch (err) {
    return res.status(500).json({ error: "Failed to retrieve commission" });
  }
});

/**
 * POST /api/admin/stripe/commission
 * Set the platform Stripe commission rate (0–50%).
 */
router.post("/admin/stripe/commission", requireAuth, async (req: any, res) => {
  try {
    if (!req.user?.isAdmin) return res.status(403).json({ error: "Admin only" });

    const { commissionPercent } = req.body;
    const pct = parseFloat(commissionPercent);
    if (isNaN(pct) || pct < 0 || pct > 50) {
      return res.status(400).json({ error: "commissionPercent must be 0–50" });
    }
    const rate = pct / 100;

    await db.execute(
      sql`INSERT INTO platform_settings (key, value, updated_at)
          VALUES ('stripe_commission_rate', ${String(rate)}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${String(rate)}, updated_at = NOW()`
    );

    return res.json({ commissionRate: rate, commissionPercent: pct });
  } catch (err) {
    logger.error({ err }, "admin/stripe/commission error");
    return res.status(500).json({ error: "Failed to update commission" });
  }
});

/**
 * POST /api/stripe/webhook  (raw body — registered in app.ts BEFORE express.json())
 * Validates signature and processes Stripe events.
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: Stripe.Event;

  try {
    const stripe = await getStripeClient();
    const webhookSecret = await getStripeWebhookSecret();

    if (!webhookSecret) {
      logger.warn("No Stripe webhook secret configured — skipping signature validation");
      event = JSON.parse((req.body as Buffer).toString()) as Stripe.Event;
    } else {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        Array.isArray(sig) ? sig[0] : sig,
        webhookSecret
      );
    }
  } catch (err: any) {
    logger.error({ err }, "Stripe webhook signature validation failed");
    res.status(400).json({ error: `Webhook error: ${err.message}` });
    return;
  }

  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (err) {
    logger.error({ err, eventType: event.type }, "Stripe webhook handler error");
    res.status(500).json({ error: "Webhook handler failed" });
  }
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  logger.info({ type: event.type }, "Processing Stripe event");

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutExpired(session);
      break;
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentSucceeded(pi);
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentFailed(pi);
      break;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await handleAccountUpdated(account);
      break;
    }
    case "payout.paid": {
      const payout = event.data.object as Stripe.Payout;
      logger.info({ payoutId: payout.id, amount: payout.amount }, "Payout paid");
      break;
    }
    case "payout.failed": {
      const payout = event.data.object as Stripe.Payout;
      logger.warn({ payoutId: payout.id, failureMessage: payout.failure_message }, "Payout failed");
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      if (invoice.subscription) await handleSubscriptionInvoicePaid(invoice as Stripe.Invoice);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      if (invoice.subscription) await handleSubscriptionPaymentFailed(invoice as Stripe.Invoice);
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdated(sub);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(sub);
      break;
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleDisputeCreated(dispute);
      break;
    }
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleDisputeClosed(dispute);
      break;
    }
    default:
      logger.info({ type: event.type }, "Unhandled Stripe event type");
  }
}

async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntentId = typeof dispute.payment_intent === "string"
    ? dispute.payment_intent : (dispute.payment_intent as any)?.id ?? null;
  const chargeId = typeof dispute.charge === "string"
    ? dispute.charge : (dispute.charge as any)?.id ?? null;
  const amountUsd = dispute.amount / 100;

  // Idempotency: skip if already recorded
  const existing = await db.execute(sql`SELECT id FROM chargebacks WHERE stripe_dispute_id = ${dispute.id} LIMIT 1`);
  if ((existing.rows as any[]).length > 0) {
    logger.info({ disputeId: dispute.id }, "Dispute already recorded — skipping (idempotent)");
    return;
  }

  // Find user via wallet transaction first, then fall back to regular transaction
  let userId: number | null = null;
  if (paymentIntentId) {
    const [walletTx] = await db.select().from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.paymentRef, paymentIntentId));
    if (walletTx) userId = walletTx.userId;

    if (!userId) {
      const [tx] = await db.select({ userId: transactionsTable.userId })
        .from(transactionsTable)
        .where(eq(transactionsTable.stripePaymentIntentId, paymentIntentId));
      if (tx?.userId) userId = tx.userId;
    }
  }

  // Insert chargeback record
  await db.execute(sql`
    INSERT INTO chargebacks (user_id, stripe_dispute_id, stripe_charge_id, stripe_payment_intent_id, amount_usd, status, wallet_deducted, user_restricted)
    VALUES (${userId}, ${dispute.id}, ${chargeId}, ${paymentIntentId}, ${amountUsd}, 'open', false, false)
    ON CONFLICT (stripe_dispute_id) DO NOTHING
  `);

  if (userId) {
    // Deduct disputed amount from wallet (may go negative — debt flagged)
    await db.execute(sql`
      UPDATE promo_wallets SET balance_usd = balance_usd - ${amountUsd}, updated_at = NOW()
      WHERE user_id = ${userId}
    `);
    await db.insert(walletTransactionsTable).values({
      userId,
      type: "chargeback_debit",
      amountUsd: -amountUsd,
      paymentRef: dispute.id,
      status: "completed",
      note: `Chargeback dispute ${dispute.id} — $${amountUsd.toFixed(2)} dedwi otomatikman`,
    });

    // Restrict user account automatically
    await db.execute(sql`
      UPDATE users SET is_restricted = true,
        restriction_reason = ${"Chargeback dispute ouvè: " + dispute.id}
      WHERE id = ${userId}
    `);

    // Mark deductions in chargeback record
    await db.execute(sql`
      UPDATE chargebacks SET wallet_deducted = true, user_restricted = true
      WHERE stripe_dispute_id = ${dispute.id}
    `);

    // Notify user
    await db.insert(notificationsTable).values({
      userId, actorId: userId, type: "system_alert",
      message: `⚠️ Yon dispute chajbak ouvè sou kont ou pou $${amountUsd.toFixed(2)}. Kont ou sispann tanporèman. Kontakte sipò.`,
    }).catch(() => {});
  }

  logger.warn({ disputeId: dispute.id, userId, amountUsd, chargeId }, "Stripe chargeback dispute created — wallet deducted, user restricted");
}

async function handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  const amountUsd = dispute.amount / 100;
  const rows = await db.execute(sql`SELECT * FROM chargebacks WHERE stripe_dispute_id = ${dispute.id} LIMIT 1`);
  const cb = (rows.rows as any[])[0];
  if (!cb) {
    logger.warn({ disputeId: dispute.id }, "Dispute closed but no chargeback record found");
    return;
  }

  const won = dispute.status === "won";

  if (won && cb.user_id && cb.wallet_deducted) {
    // Restore wallet — we won the dispute, money is back
    await db.execute(sql`
      UPDATE promo_wallets SET balance_usd = balance_usd + ${amountUsd}, updated_at = NOW()
      WHERE user_id = ${cb.user_id}
    `);
    await db.insert(walletTransactionsTable).values({
      userId: cb.user_id,
      type: "chargeback_reversal",
      amountUsd,
      paymentRef: dispute.id,
      status: "completed",
      note: `Dispute ${dispute.id} genyen — $${amountUsd.toFixed(2)} retounen`,
    });
    // Unrestrict user
    await db.execute(sql`UPDATE users SET is_restricted = false WHERE id = ${cb.user_id}`);

    await db.insert(notificationsTable).values({
      userId: cb.user_id, actorId: cb.user_id, type: "system_alert",
      message: `✅ Dispute chajbak ${dispute.id} rezoud nan favè ou. $${amountUsd.toFixed(2)} retounen sou wallet ou.`,
    }).catch(() => {});
  }

  await db.execute(sql`
    UPDATE chargebacks SET status = ${won ? "won" : "lost"}, resolved_at = NOW()
    WHERE stripe_dispute_id = ${dispute.id}
  `);

  logger.info({ disputeId: dispute.id, status: won ? "won" : "lost", amountUsd }, "Stripe dispute closed");
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Vendor subscription flow
  if (session.mode === "subscription" || session.metadata?.type === "vendor_subscription") {
    await handleSubscriptionCheckoutCompleted(session);
    return;
  }

  if (session.payment_status !== "paid") return;

  const sessionId = session.id;
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  const meta = session.metadata ?? {};

  // ── Music track purchase ──────────────────────────────────────────────────
  if (meta.type === "music_purchase") {
    const trackId  = Number(meta.trackId);
    const buyerId  = Number(meta.buyerId);
    const artistId = meta.artistId ? Number(meta.artistId) : null;
    const priceUsd = Number(meta.priceUsd ?? 0);
    if (!trackId || !buyerId || priceUsd <= 0) {
      logger.warn({ meta, sessionId }, "music_purchase checkout missing required metadata");
      return;
    }

    const platformFee  = parseFloat((priceUsd * 0.20).toFixed(2));
    const artistAmount = parseFloat((priceUsd - platformFee).toFixed(2));

    try {
      // Idempotent: INSERT … ON CONFLICT DO NOTHING
      await db.execute(sql`
        INSERT INTO music_purchases (user_id, track_id, amount_usd, artist_amount_usd, platform_fee_usd, stripe_session_id)
        VALUES (${buyerId}, ${trackId}, ${priceUsd}, ${artistAmount}, ${platformFee}, ${sessionId})
        ON CONFLICT (user_id, track_id) DO NOTHING
      `);

      // Credit 80% to artist's music_earnings
      if (artistId) {
        await db.execute(sql`
          INSERT INTO music_earnings (artist_id, track_id, amount_usd, impressions_credited, milestone, description)
          VALUES (${artistId}, ${trackId}, ${artistAmount}, 0, 'purchase', 'Vann chante — 80% komisyon')
        `);
        // Notify artist
        await db.insert(notificationsTable).values({
          userId: artistId, actorId: buyerId, type: "system_alert",
          message: `🎵 Yon moun achte chante ou! Ou touche $${artistAmount.toFixed(2)} (80%).`,
        }).catch(() => {});
      }

      logger.info({ trackId, buyerId, artistId, priceUsd, artistAmount, platformFee }, "[music] track purchased via Stripe");
    } catch (purchaseErr: any) {
      logger.error({ err: purchaseErr?.message, trackId, buyerId }, "[music] purchase insert failed");
    }
    return;
  }

  // ── Artist Plan activation ────────────────────────────────────────────────
  if (meta.type === "artist_plan") {
    const userId = Number(meta.userId);
    if (!userId) { logger.warn({ meta, sessionId }, "artist_plan checkout missing userId"); return; }

    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await db.update(usersTable)
      .set({ subscriptionPlan: "artist" as any, subscriptionExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    await db.insert(notificationsTable).values({
      userId, actorId: userId, type: "system_alert",
      message: `🎵 Plan Artis ou aktive! Ou ka telechaje chante san limit pou 1 an. Kolekte 500 abone pou kòmanse touche revni chak mwa.`,
    }).catch(() => {});

    logger.info({ userId, sessionId, expiresAt }, "[music] Artist Plan activated via Stripe");
    return;
  }

  // ── Boost card payment ────────────────────────────────────────────────────
  if (meta.type === "boost") {
    const boostId   = meta.boostId   ? Number(meta.boostId)   : null;
    const listingId = meta.listingId ? Number(meta.listingId) : null;
    if (!boostId || !listingId) {
      logger.warn({ meta, sessionId }, "Boost checkout session missing metadata");
      return;
    }

    const [boost] = await db.select().from(boostsTable).where(eq(boostsTable.id, boostId));
    if (!boost) { logger.warn({ boostId }, "Boost not found for Stripe checkout"); return; }
    if (boost.paymentStatus === "paid") { logger.info({ boostId }, "Boost already paid (idempotent webhook)"); return; }

    const paymentRef = paymentIntentId ?? sessionId;

    await db.transaction(async (tx) => {
      await tx.update(boostsTable)
        .set({ paymentStatus: "paid", paymentRef })
        .where(eq(boostsTable.id, boostId));

      await tx.update(listingsTable)
        .set({
          isBoosted:                 true,
          boostStartAt:              new Date(),
          boostExpiresAt:            boost.expiresAt,
          boostAudienceCountry:      boost.audienceCountry,
          boostAudienceState:        boost.audienceState,
          boostAudienceCity:         boost.audienceCity,
          boostAudienceCities:       boost.audienceCities,
          boostAudienceNeighborhood: boost.audienceNeighborhood,
          boostAudienceRadiusKm:     boost.audienceRadiusKm,
        })
        .where(eq(listingsTable.id, listingId));

      // Audit transaction for the boost payment
      await tx.insert(transactionsTable).values({
        userId:                 boost.userId ?? 0,
        listingId,
        type:                   "boost",
        amount:                 boost.price,
        currency:               "USD",
        paymentMethod:          "card",
        paymentStatus:          "completed",
        paymentRef,
        stripeCheckoutSessionId: sessionId,
        description:            `Boost ${boost.plan} for listing #${listingId} via Stripe`,
      }).onConflictDoNothing();
    });

    if (boost.userId) {
      await db.insert(notificationsTable).values({
        userId: boost.userId, actorId: boost.userId, type: "boost_approved", listingId,
      }).catch(() => {});
    }

    logger.info({ boostId, listingId, sessionId }, "Boost activated via Stripe card payment");
    return;
  }

  // ── Wallet recharge via card ─────────────────────────────────────────────
  if (meta.type === "wallet_recharge") {
    const paymentRef = meta.paymentRef;
    const userId = meta.userId ? Number(meta.userId) : null;
    const amountUsd = session.amount_total ? session.amount_total / 100 : null;

    if (!paymentRef || !userId || !amountUsd) {
      logger.warn({ meta, sessionId }, "Wallet recharge session missing metadata");
      return;
    }

    // Update wallet_transaction to completed — ONLY if still "pending".
    // The AND status='pending' clause is the idempotency gate: if Stripe retries
    // the webhook the row is already "completed" so .returning() yields nothing
    // and we return early — preventing a second wallet credit.
    const [updated] = await db.update(walletTransactionsTable)
      .set({ status: "completed", note: `Card Stripe: ${sessionId}` })
      .where(and(
        eq(walletTransactionsTable.paymentRef, paymentRef),
        eq(walletTransactionsTable.status, "pending"),
      ))
      .returning();

    if (!updated) {
      logger.warn({ paymentRef, sessionId }, "Wallet recharge already processed or not found — skipping (idempotent)");
      return;
    }

    // Credit wallet — net after 2.5% fee; locks $2 security balance on first recharge
    await applyRechargeCredits(userId, amountUsd, paymentRef);

    // Pay $1 referral bonus to referrer (+ $1 to new user, handled inside)
    await payReferralBonusIfEligible(userId, amountUsd);

    // Notify user that their wallet was credited
    await db.insert(notificationsTable).values({
      userId, actorId: userId, type: "wallet_recharged",
    }).catch(() => {});

    logger.info({ userId, amountUsd, paymentRef, sessionId }, "Wallet card recharge completed");
    return;
  }

  // ── Standard listing purchase ────────────────────────────────────────────
  const listingId = meta.listingId ? Number(meta.listingId) : null;

  // Update pending transaction → completed
  const [updatedTx] = await db
    .update(transactionsTable)
    .set({
      paymentStatus: "completed",
      orderStatus: "ready_to_ship",
      stripePaymentIntentId: paymentIntentId,
      paymentRef: sessionId,
    })
    .where(eq(transactionsTable.stripeCheckoutSessionId, sessionId))
    .returning();

  // Decrement stock (or mark sold if single-item / stock exhausted)
  if (listingId) {
    const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
    if (existing) {
      const update = decrementStock(existing);
      await db.update(listingsTable).set(update).where(eq(listingsTable.id, listingId));
    }
  }

  // Notify buyer: order confirmed
  const buyerUserId = meta.buyerUserId ? Number(meta.buyerUserId) : null;
  const sellerUserId = meta.sellerUserId ? Number(meta.sellerUserId) : null;
  if (buyerUserId && updatedTx) {
    await db.insert(notificationsTable).values({
      userId: buyerUserId,
      actorId: sellerUserId ?? buyerUserId,
      type: "order_confirmed",
      listingId: listingId ?? undefined,
    }).catch(() => {});

    void sendPushToUser(buyerUserId, {
      title: "Kòmand ou konfime! ✅",
      body: "Peman ou resevwa. Vandè ap prepare pake a pou ou.",
      url: updatedTx ? `/orders/${updatedTx.id}` : "/orders",
      tag: `order-confirmed-${sessionId}`,
    });
    void sendExpoPushToUser(buyerUserId, {
      title: "Kòmand ou konfime! ✅",
      body: "Peman ou resevwa. Vandè ap prepare pake a pou ou.",
      data: { url: updatedTx ? `/orders/${updatedTx.id}` : "/orders" }, sound: "default",
    });
  }

  // ── If seller chose "Kat FM" payout → auto-credit their FM wallet ──────────
  const sellerCardPayoutMethod = meta.sellerCardPayoutMethod ?? "fm_wallet";
  if (sellerUserId && updatedTx && sellerCardPayoutMethod === "fm_wallet") {
    const sellerEarnings = updatedTx.sellerEarnings ?? 0;
    if (sellerEarnings > 0) {
      const [existingWallet] = await db
        .select()
        .from(promoWalletTable)
        .where(eq(promoWalletTable.userId, sellerUserId));

      if (existingWallet) {
        await db
          .update(promoWalletTable)
          .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${sellerEarnings}`, updatedAt: new Date() })
          .where(eq(promoWalletTable.userId, sellerUserId));
      } else {
        await db.insert(promoWalletTable).values({ userId: sellerUserId, balanceUsd: sellerEarnings });
      }

      logger.info({ sellerUserId, sellerEarnings, sessionId }, "Seller FM wallet credited after Stripe purchase (Kat FM payout)");
    }
  }

  // Notify seller: new order received
  if (sellerUserId && updatedTx) {
    await db.insert(notificationsTable).values({
      userId: sellerUserId,
      actorId: buyerUserId ?? sellerUserId,
      type: "new_order",
      listingId: listingId ?? undefined,
    }).catch(() => {});

    void sendPushToUser(sellerUserId, {
      title: "Nouvo kòmand resevwa! 🛍️",
      body: `Ou resevwa yon nouvo kòmand pou "${ listingId ? `anons #${listingId}` : "pwodwi ou" }". Prepare pake a!${sellerCardPayoutMethod === "fm_wallet" ? " Kòb ou ajoute nan pòtfèy FM ou." : ""}`,
      url: updatedTx ? `/orders/${updatedTx.id}` : "/sales",
      tag: `new-order-${sessionId}`,
    });
    void sendExpoPushToUser(sellerUserId, {
      title: "Nouvo kòmand resevwa! 🛍️",
      body: `Ou resevwa yon nouvo kòmand. Prepare pake a!`,
      data: { url: updatedTx ? `/orders/${updatedTx.id}` : "/sales" }, sound: "default",
    });
  }

  // Congratulatory push notification to buyer (best-effort).
  if (buyerUserId && updatedTx) {
    void sendPushToUser(buyerUserId, {
      title: "Felisitasyon pou achte ou! 🎉",
      body: "Mèsi pou konfyans ou. Kòmand ou an konfime epi vandè ap prepare li pou ou.",
      url: `/orders/${updatedTx.id}`,
      tag: `purchase-congrats-${updatedTx.id}`,
    });
    void sendExpoPushToUser(buyerUserId, {
      title: "Felisitasyon pou achte ou! 🎉",
      body: "Mèsi pou konfyans ou. Kòmand ou an konfime!",
      data: { url: `/orders/${updatedTx.id}` }, sound: "default",
    });
  }

  // Fire-and-forget transactional emails for buyer + seller
  if (updatedTx && (buyerUserId || sellerUserId)) {
    void (async () => {
      try {
        const userIds = [buyerUserId, sellerUserId].filter((id): id is number => id !== null);
        const users = await db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds));
        const buyerUser  = users.find(u => u.id === buyerUserId);
        const sellerUser = users.find(u => u.id === sellerUserId);

        let listingTitle = `Anons #${listingId ?? updatedTx.listingId ?? "?"}`;
        if (listingId) {
          const [lst] = await db
            .select({ title: listingsTable.title })
            .from(listingsTable)
            .where(eq(listingsTable.id, listingId));
          if (lst?.title) listingTitle = lst.title;
        }

        if (buyerUser?.email) {
          const tpl = orderPlacedBuyerEmail({
            buyerName: buyerUser.name ?? "Achetè",
            orderId:   updatedTx.id,
            listingTitle,
            amount:    Number(updatedTx.amount ?? 0),
            sellerName: sellerUser?.name ?? "Vandè",
          });
          await sendEmail({ to: buyerUser.email, ...tpl });
        }

        if (sellerUser?.email) {
          const tpl = orderSoldSellerEmail({
            sellerName:  sellerUser.name ?? "Vandè",
            orderId:     updatedTx.id,
            listingTitle,
            amount:      Number(updatedTx.sellerEarnings ?? updatedTx.amount ?? 0),
            buyerName:   buyerUser?.name ?? "Achetè",
          });
          await sendEmail({ to: sellerUser.email, ...tpl });
        }
      } catch (emailErr) {
        logger.warn({ emailErr }, "Order email send failed (non-fatal)");
      }
    })();
  }

  logger.info({ sessionId, listingId, orderId: updatedTx?.id, sellerCardPayoutMethod }, "Checkout completed — order created");
}

/**
 * Fires when a Stripe Checkout session expires or an async payment fails.
 * Marks any pending boost or wallet_recharge records as "failed" so they
 * don't remain stuck in a "pending" state forever.
 */
async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {};
  const sessionId = session.id;

  if (meta.type === "boost") {
    const boostId = meta.boostId ? Number(meta.boostId) : null;
    if (!boostId) return;

    await db
      .update(boostsTable)
      .set({ paymentStatus: "failed" })
      .where(and(eq(boostsTable.id, boostId), eq(boostsTable.paymentStatus, "pending")));

    logger.info({ boostId, sessionId }, "Boost marked failed — checkout session expired or async payment failed");
  }

  if (meta.type === "wallet_recharge") {
    const paymentRef = meta.paymentRef;
    if (!paymentRef) return;

    await db
      .update(walletTransactionsTable)
      .set({ status: "failed", note: "Peman echwe — sesyon Stripe ekspire" })
      .where(and(eq(walletTransactionsTable.paymentRef, paymentRef), eq(walletTransactionsTable.status, "pending")));

    logger.info({ paymentRef, sessionId }, "Wallet recharge marked failed — checkout session expired or async payment failed");
  }
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  await db
    .update(transactionsTable)
    .set({ paymentStatus: "completed", stripePaymentIntentId: pi.id })
    .where(eq(transactionsTable.stripePaymentIntentId, pi.id));
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  await db
    .update(transactionsTable)
    .set({ paymentStatus: "failed" })
    .where(eq(transactionsTable.stripePaymentIntentId, pi.id));
}

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const status = account.charges_enabled && account.details_submitted ? "active" : "pending";

  // Find user by stripeAccountId
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.stripeAccountId, account.id));

  for (const user of users) {
    await db
      .update(usersTable)
      .set({ stripeAccountStatus: status })
      .where(eq(usersTable.id, user.id));
  }

  logger.info({ accountId: account.id, status }, "Account status updated");
}

export default router;
