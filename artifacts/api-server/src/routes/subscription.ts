import { Router } from "express";
import { db, usersTable, vendorSubscriptionsTable, listingsTable, notificationsTable } from "@workspace/db";
import { PLAN_CONFIG, type SubscriptionPlan } from "@workspace/db";
import { eq, desc, and, sql, gte, lte, isNotNull, lt, asc, notInArray, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";
import type { Request } from "express";
import Stripe from "stripe";
import { deductWalletHybrid } from "./wallet";
import { sendPushToUser } from "../lib/push";

const GRACE_PERIOD_DAYS = 5;

const router = Router();

// ── Helper: get or create Stripe customer, auto-clearing stale test-mode IDs ──
async function getOrCreateStripeCustomer(
  stripe: Stripe,
  user: { id: number; email: string; name: string; stripeCustomerId: string | null }
): Promise<string> {
  if (user.stripeCustomerId) {
    try {
      await stripe.customers.retrieve(user.stripeCustomerId);
      return user.stripeCustomerId;
    } catch (err: any) {
      const isStale =
        err?.code === "resource_missing" ||
        (err?.message ?? "").toLowerCase().includes("no such customer") ||
        (err?.message ?? "").toLowerCase().includes("test mode");
      if (!isStale) throw err;
      // Stale test-mode ID — clear it and fall through to create a new one
      await db.update(usersTable)
        .set({ stripeCustomerId: null })
        .where(eq(usersTable.id, user.id));
      logger.warn({ userId: user.id, oldId: user.stripeCustomerId }, "Cleared stale Stripe customer ID (test/live mode mismatch)");
    }
  }
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: String(user.id) },
  });
  await db.update(usersTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(usersTable.id, user.id));
  return customer.id;
}

const BASE_URL = (() => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : "https://flexamarket.com";
})();

// Plan metadata exposed to clients
const PLANS_PUBLIC = (Object.entries(PLAN_CONFIG) as [SubscriptionPlan, typeof PLAN_CONFIG[SubscriptionPlan]][]).map(([id, p]) => ({
  id,
  name: p.name,
  priceUsd: p.priceUsd,
  tier: p.tier,
  videoEnabled: p.videoEnabled,
  maxListings: p.maxListings,
  featuredBadge: p.featuredBadge,
  features: buildFeatureList(id, p),
}));

type FeatureKey = { key: string; count?: number };

function buildFeatureList(id: SubscriptionPlan, p: typeof PLAN_CONFIG[SubscriptionPlan]): FeatureKey[] {
  const base: FeatureKey[] = p.maxListings
    ? [{ key: "subscription.feature.maxListings", count: p.maxListings }]
    : [{ key: "subscription.feature.unlimitedListings" }];
  base.push(
    { key: "subscription.feature.sellerProfile" },
    { key: "subscription.feature.messaging" },
    { key: "subscription.feature.basicStats" },
  );
  if (p.videoEnabled) base.push({ key: "subscription.feature.videoListings" });
  if (p.tier >= 2) base.push({ key: "subscription.feature.superiorVisibility" });
  if (p.tier >= 2) base.push({ key: "subscription.feature.categoryPriority" });
  if (p.featuredBadge) base.push({ key: "subscription.feature.vipBadge" });
  if (p.tier >= 3) base.push({ key: "subscription.feature.prioritySupport" });
  return base;
}

// ── GET /api/subscription/plans ──────────────────────────────────────────────
router.get("/subscription/plans", (_req, res) => {
  res.json(PLANS_PUBLIC);
});

// ── GET /api/subscription/my ─────────────────────────────────────────────────
router.get("/subscription/my", requireAuth, async (req: any, res: any) => {
  try {
    const [user] = await db.select({
      id: usersTable.id,
      subscriptionPlan: usersTable.subscriptionPlan,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    }).from(usersTable).where(eq(usersTable.id, req.userId));

    if (!user) return res.status(404).json({ error: "User not found" });

    const [latest] = await db.select()
      .from(vendorSubscriptionsTable)
      .where(and(
        eq(vendorSubscriptionsTable.userId, req.userId),
        sql`${vendorSubscriptionsTable.status} IN ('active', 'grace_period', 'cancelled')`
      ))
      .orderBy(desc(vendorSubscriptionsTable.createdAt))
      .limit(1);

    const plan = user.subscriptionPlan as SubscriptionPlan;
    const config = PLAN_CONFIG[plan] ?? PLAN_CONFIG.basic;
    const gracePeriodActive = latest?.status === "grace_period";
    const isExpired = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) < new Date() : false;

    // Sync nextBillingDate from Stripe if we have a live subscription ID
    let nextBillingDate = latest?.nextBillingDate?.toISOString() ?? null;
    if (latest?.stripeSubscriptionId && latest.status === "active" && !nextBillingDate) {
      try {
        const stripe = await getStripeClient();
        const sub = await stripe.subscriptions.retrieve(latest.stripeSubscriptionId);
        const subAny = sub as any;
        nextBillingDate = new Date(subAny.current_period_end * 1000).toISOString();
        await db.update(vendorSubscriptionsTable)
          .set({ nextBillingDate: new Date(subAny.current_period_end * 1000), cancelAtPeriodEnd: sub.cancel_at_period_end, updatedAt: new Date() })
          .where(eq(vendorSubscriptionsTable.id, latest.id));
      } catch { /* non-fatal */ }
    }

    res.json({
      plan,
      planName: config.name,
      tier: config.tier,
      videoEnabled: config.videoEnabled,
      maxListings: config.maxListings,
      featuredBadge: config.featuredBadge,
      priceUsd: config.priceUsd,
      expiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      isExpired,
      gracePeriodActive,
      graceUntil: latest?.graceUntil?.toISOString() ?? null,
      nextBillingDate,
      cancelAtPeriodEnd: latest?.cancelAtPeriodEnd ?? false,
      status: latest?.status ?? "none",
      stripeSubscriptionId: latest?.stripeSubscriptionId ?? null,
      latestSubscription: latest ?? null,
    });
  } catch (err) {
    logger.error({ err }, "GET /subscription/my error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/subscription/checkout ──────────────────────────────────────────
router.post("/subscription/checkout", requireAuth, async (req: any, res: any) => {
  try {
    const { plan } = req.body as { plan: SubscriptionPlan };
    if (!plan || !PLAN_CONFIG[plan]) return res.status(400).json({ error: "Invalid plan" });
    if (plan === "basic") return res.status(400).json({ error: "Basic plan is free" });

    const config = PLAN_CONFIG[plan];

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const stripe = await getStripeClient();

    // Get or create Stripe customer (auto-clears stale test-mode IDs)
    const customerId = await getOrCreateStripeCustomer(stripe, user);

    // Insert pending subscription record
    const [pending] = await db.insert(vendorSubscriptionsTable).values({
      userId: user.id,
      plan,
      status: "pending",
      amountUsd: config.priceUsd,
      stripeCustomerId: customerId,
    }).returning();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(config.priceUsd * 100),
          recurring: { interval: "month" },
          product_data: {
            name: `FLEXA MARKET ${config.name} Plan`,
            description: `$${config.priceUsd}/month · ${config.maxListings ? `Up to ${config.maxListings} listings` : "Unlimited listings"}${config.videoEnabled ? " · Video" : ""}`,
          },
        },
      }],
      metadata: {
        type: "vendor_subscription",
        userId: String(user.id),
        plan,
        subscriptionRecordId: String(pending.id),
      },
      success_url: `${BASE_URL}/subscription?success=1&plan=${plan}&return_app=1`,
      cancel_url: `${BASE_URL}/subscription?cancelled=1&return_app=1`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    const stripeCode = err?.code ?? err?.type ?? "unknown";
    const stripeMsg = err?.message ?? "unknown";
    logger.error({ err, stripeCode, stripeMsg }, "POST /subscription/checkout error");
    if (stripeCode === "authentication_required" || stripeCode === "api_key_expired" || err?.message?.includes("No API key")) {
      return res.status(503).json({ error: "Payment service not configured. Contact support." });
    }
    res.status(500).json({ error: `Checkout failed: ${stripeMsg}` });
  }
});

// ── POST /api/subscription/wallet-pay ────────────────────────────────────────
// Pay for a vendor subscription using FM Wallet balance (promo-first hybrid).
router.post("/subscription/wallet-pay", requireAuth, async (req: any, res: any) => {
  try {
    const { plan } = req.body as { plan: SubscriptionPlan };
    if (!plan || !PLAN_CONFIG[plan]) return res.status(400).json({ error: "Plan envalid" });
    if (plan === "basic") return res.status(400).json({ error: "Plan Basic gratis" });

    const config = PLAN_CONFIG[plan];
    const userId: number = req.userId;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) return res.status(404).json({ error: "Itilizatè pa jwenn" });

    // Deduct from wallet (promo first, then real balance)
    const deduction = await deductWalletHybrid(
      userId,
      config.priceUsd,
      `Abònman ${config.name} — 1 mwa`,
      "vendor_subscription",
      userId,
    );
    if (!deduction.ok) {
      return res.status(402).json({
        error: "Balans pa ase",
        needed: config.priceUsd,
        promoBalance: deduction.promoBalance,
        realBalance: deduction.realBalance,
      });
    }

    // Calculate expiry (1 month from now)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    // Insert active subscription record
    await db.insert(vendorSubscriptionsTable).values({
      userId,
      plan,
      status: "active",
      expiresAt,
      amountUsd: config.priceUsd,
      interval: "month",
    });

    // Update user record
    await db.update(usersTable)
      .set({ subscriptionPlan: plan, subscriptionExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    // Unhide any listings hidden by expired subscription
    await db.update(listingsTable)
      .set({ status: "available" })
      .where(and(eq(listingsTable.sellerId, userId), eq(listingsTable.status, "subscription_hidden")));

    logger.info({ userId, plan, expiresAt, promoUsed: deduction.promoUsed, realUsed: deduction.realUsed }, "Subscription activated via FM Wallet");

    // Welcome notification
    try {
      await db.insert(notificationsTable).values({
        userId,
        actorId: userId,
        type: "subscription_welcome",
      });
      void sendPushToUser(userId, {
        title: "🎉 Byenveni nan fanmi FlexaMarket!",
        body: `Plan ${config.name} ou a aktif. Ou ka pibliye jiska ${config.maxListings ?? "ilimite"} pwodwi kounye a!`,
      });
    } catch { /* non-fatal */ }

    res.json({ ok: true, plan, expiresAt });
  } catch (err) {
    logger.error({ err }, "POST /subscription/wallet-pay error");
    res.status(500).json({ error: "Erè entèn" });
  }
});

// ── POST /api/subscription/portal ────────────────────────────────────────────
router.post("/subscription/portal", requireAuth, async (req: any, res: any) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
    const stripe = await getStripeClient();
    const customerId = await getOrCreateStripeCustomer(stripe, user);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${BASE_URL}/subscription`,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "POST /subscription/portal error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/subscription/cancel ────────────────────────────────────────────
// Sets cancel_at_period_end on Stripe. Access continues until expiresAt.
router.post("/subscription/cancel", requireAuth, async (req: any, res: any) => {
  try {
    const [latest] = await db.select()
      .from(vendorSubscriptionsTable)
      .where(and(eq(vendorSubscriptionsTable.userId, req.userId), eq(vendorSubscriptionsTable.status, "active")))
      .orderBy(desc(vendorSubscriptionsTable.createdAt))
      .limit(1);

    if (!latest) return res.status(404).json({ error: "No active subscription" });

    if (latest.stripeSubscriptionId) {
      try {
        const stripe = await getStripeClient();
        await stripe.subscriptions.update(latest.stripeSubscriptionId, { cancel_at_period_end: true });
      } catch (stripeErr) {
        logger.warn({ stripeErr }, "Could not set cancel_at_period_end on Stripe");
      }
    }

    // Keep status=active — user keeps access until period end. Just flag it locally.
    await db.update(vendorSubscriptionsTable)
      .set({ cancelAtPeriodEnd: true, cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(vendorSubscriptionsTable.id, latest.id));

    res.json({ ok: true, accessUntil: latest.expiresAt?.toISOString() ?? null });
  } catch (err) {
    logger.error({ err }, "POST /subscription/cancel error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/subscription/uncancel ──────────────────────────────────────────
// Reactivates a subscription that was set to cancel at period end.
router.post("/subscription/uncancel", requireAuth, async (req: any, res: any) => {
  try {
    const [latest] = await db.select()
      .from(vendorSubscriptionsTable)
      .where(and(eq(vendorSubscriptionsTable.userId, req.userId), eq(vendorSubscriptionsTable.status, "active")))
      .orderBy(desc(vendorSubscriptionsTable.createdAt))
      .limit(1);

    if (!latest) return res.status(404).json({ error: "No active subscription" });
    if (!latest.cancelAtPeriodEnd) return res.status(400).json({ error: "Subscription is not scheduled for cancellation" });

    if (latest.stripeSubscriptionId) {
      try {
        const stripe = await getStripeClient();
        await stripe.subscriptions.update(latest.stripeSubscriptionId, { cancel_at_period_end: false });
      } catch (stripeErr) {
        logger.warn({ stripeErr }, "Could not reactivate Stripe subscription");
        return res.status(502).json({ error: "Could not reactivate with billing provider" });
      }
    }

    await db.update(vendorSubscriptionsTable)
      .set({ cancelAtPeriodEnd: false, cancelledAt: null, updatedAt: new Date() })
      .where(eq(vendorSubscriptionsTable.id, latest.id));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /subscription/uncancel error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/subscription/hidden-listings ────────────────────────────────────
// Returns the count and IDs of listings hidden due to expired subscription.
router.get("/subscription/hidden-listings", requireAuth, async (req: any, res: any) => {
  try {
    const hidden = await db.select({ id: listingsTable.id, title: listingsTable.title, createdAt: listingsTable.createdAt })
      .from(listingsTable)
      .where(and(eq(listingsTable.sellerId, req.userId), eq(listingsTable.status, "subscription_hidden")))
      .orderBy(asc(listingsTable.createdAt));
    res.json({ count: hidden.length, listings: hidden });
  } catch (err) {
    logger.error({ err }, "GET /subscription/hidden-listings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/subscription/wallet-retry ──────────────────────────────────────
// Manual retry: user pays their lapsed wallet subscription immediately.
router.post("/subscription/wallet-retry", requireAuth, async (req: any, res: any) => {
  try {
    const userId: number = req.userId;

    // Find the most recent active wallet subscription (no Stripe ID)
    const [sub] = await db.select()
      .from(vendorSubscriptionsTable)
      .where(and(
        eq(vendorSubscriptionsTable.userId, userId),
        eq(vendorSubscriptionsTable.status, "active"),
        sql`${vendorSubscriptionsTable.stripeSubscriptionId} IS NULL`,
      ))
      .orderBy(desc(vendorSubscriptionsTable.createdAt))
      .limit(1);

    if (!sub) return res.status(404).json({ error: "Okenn abònman aktif FM Wallet jwenn" });

    const config = PLAN_CONFIG[sub.plan as SubscriptionPlan];
    if (!config || config.priceUsd <= 0) return res.status(400).json({ error: "Plan envalid" });

    const deduction = await deductWalletHybrid(
      userId,
      config.priceUsd,
      `Renouvèlman manyèl abònman ${config.name}`,
      "vendor_subscription",
      userId,
    );

    if (!deduction.ok) {
      return res.status(402).json({
        error: "Balans pa ase",
        needed: config.priceUsd,
        promoBalance: deduction.promoBalance,
        realBalance: deduction.realBalance,
      });
    }

    // Extend from now (if already expired) or from current expiresAt (if still active)
    const base = sub.expiresAt && sub.expiresAt > new Date() ? sub.expiresAt : new Date();
    const newExpiry = new Date(base);
    newExpiry.setMonth(newExpiry.getMonth() + 1);

    await db.update(vendorSubscriptionsTable)
      .set({
        expiresAt: newExpiry,
        nextBillingDate: newExpiry,
        walletPaymentAttempts: 0,
        nextWalletRetryAt: null,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(vendorSubscriptionsTable.id, sub.id));

    await db.update(usersTable)
      .set({ subscriptionPlan: sub.plan as SubscriptionPlan, subscriptionExpiresAt: newExpiry, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    // Unhide any hidden listings
    await db.update(listingsTable)
      .set({ status: "available" })
      .where(and(eq(listingsTable.sellerId, userId), eq(listingsTable.status, "subscription_hidden")));

    logger.info({ userId, plan: sub.plan, newExpiry }, "Wallet subscription manually retried");
    res.json({ ok: true, plan: sub.plan, expiresAt: newExpiry.toISOString() });
  } catch (err) {
    logger.error({ err }, "POST /subscription/wallet-retry error");
    res.status(500).json({ error: "Erè entèn" });
  }
});

// ── Admin: GET /api/admin/subscriptions ──────────────────────────────────────
router.get("/admin/subscriptions", requireAuth, async (req: any, res: any) => {
  try {
    if (!req.user?.isAdmin && !req.user?.isSuperAdmin) return res.status(403).json({ error: "Forbidden" });
    const rows = await db.select({
      sub: vendorSubscriptionsTable,
      user: { id: usersTable.id, name: usersTable.name, email: usersTable.email, avatar: usersTable.avatar },
    })
      .from(vendorSubscriptionsTable)
      .leftJoin(usersTable, eq(vendorSubscriptionsTable.userId, usersTable.id))
      .orderBy(desc(vendorSubscriptionsTable.createdAt))
      .limit(200);

    res.json(rows);
  } catch (err) {
    logger.error({ err }, "GET /admin/subscriptions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: POST /api/admin/subscriptions/grant ───────────────────────────────
router.post("/admin/subscriptions/grant", requireAuth, async (req: any, res: any) => {
  try {
    if (!req.user?.isAdmin && !req.user?.isSuperAdmin) return res.status(403).json({ error: "Forbidden" });
    const { userId, plan, months = 1 } = req.body as { userId: number; plan: SubscriptionPlan; months?: number };
    if (!userId || !plan || !PLAN_CONFIG[plan]) return res.status(400).json({ error: "userId and plan required" });

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + Number(months));

    await db.insert(vendorSubscriptionsTable).values({
      userId: Number(userId),
      plan,
      status: "active",
      expiresAt,
      amountUsd: 0,
      interval: "month",
    });

    await db.update(usersTable)
      .set({ subscriptionPlan: plan, subscriptionExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(usersTable.id, Number(userId)));

    // Unhide any listings that were hidden due to expired subscription
    await db.update(listingsTable)
      .set({ status: "available" })
      .where(and(eq(listingsTable.sellerId, Number(userId)), eq(listingsTable.status, "subscription_hidden")));

    res.json({ ok: true, expiresAt });
  } catch (err) {
    logger.error({ err }, "POST /admin/subscriptions/grant error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: POST /api/admin/subscriptions/revoke ──────────────────────────────
router.post("/admin/subscriptions/revoke", requireAuth, async (req: any, res: any) => {
  try {
    if (!req.user?.isAdmin && !req.user?.isSuperAdmin) return res.status(403).json({ error: "Forbidden" });
    const { userId } = req.body as { userId: number };
    if (!userId) return res.status(400).json({ error: "userId required" });

    await db.update(usersTable)
      .set({ subscriptionPlan: "basic", subscriptionExpiresAt: null, updatedAt: new Date() })
      .where(eq(usersTable.id, Number(userId)));

    await db.update(vendorSubscriptionsTable)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(vendorSubscriptionsTable.userId, Number(userId)), eq(vendorSubscriptionsTable.status, "active")));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /admin/subscriptions/revoke error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Webhook helper (called from stripeCheckout.ts) ───────────────────────────

export async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {};
  const userId = meta.userId ? Number(meta.userId) : null;
  const plan = meta.plan as SubscriptionPlan | undefined;
  const recordId = meta.subscriptionRecordId ? Number(meta.subscriptionRecordId) : null;

  if (!userId || !plan || !PLAN_CONFIG[plan]) {
    logger.warn({ meta }, "Subscription checkout missing metadata");
    return;
  }

  const stripeSubscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : (session.subscription as any)?.id ?? null;

  let expiresAt: Date | null = null;
  if (stripeSubscriptionId) {
    try {
      const stripe = await getStripeClient();
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      expiresAt = new Date((sub as any).current_period_end * 1000);
    } catch {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  } else {
    expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  if (recordId) {
    await db.update(vendorSubscriptionsTable)
      .set({ status: "active", expiresAt, stripeSubscriptionId, startedAt: new Date(), updatedAt: new Date() })
      .where(eq(vendorSubscriptionsTable.id, recordId));
  }

  await db.update(usersTable)
    .set({ subscriptionPlan: plan, subscriptionExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  // Unhide any previously hidden listings
  await db.update(listingsTable)
    .set({ status: "available" })
    .where(and(eq(listingsTable.sellerId, userId), eq(listingsTable.status, "subscription_hidden")));

  logger.info({ userId, plan, expiresAt, stripeSubscriptionId }, "Vendor subscription activated");

  // Welcome notification
  const config = PLAN_CONFIG[plan];
  try {
    await db.insert(notificationsTable).values({
      userId,
      actorId: userId,
      type: "subscription_welcome",
    });
    void sendPushToUser(userId, {
      title: "🎉 Byenveni nan fanmi FlexaMarket!",
      body: `Plan ${config.name} ou a aktif. Ou ka pibliye jiska ${config.maxListings ?? "ilimite"} pwodwi kounye a!`,
    });
  } catch { /* non-fatal */ }
}

export async function handleSubscriptionInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subId = typeof (invoice as any).subscription === "string" ? (invoice as any).subscription as string : null;
  if (!subId) return;

  const [existing] = await db.select()
    .from(vendorSubscriptionsTable)
    .where(eq(vendorSubscriptionsTable.stripeSubscriptionId, subId))
    .limit(1);

  if (!existing) return;

  try {
    const stripe = await getStripeClient();
    const sub = await stripe.subscriptions.retrieve(subId);
    const newExpiry = new Date((sub as any).current_period_end * 1000);
    // Next billing = 1 month after current period end
    const nextBilling = new Date((sub as any).current_period_end * 1000);

    await db.update(vendorSubscriptionsTable)
      .set({
        expiresAt: newExpiry,
        nextBillingDate: nextBilling,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        graceUntil: null,           // Clear any grace period on successful payment
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(vendorSubscriptionsTable.id, existing.id));

    await db.update(usersTable)
      .set({ subscriptionExpiresAt: newExpiry, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.userId));

    logger.info({ userId: existing.userId, newExpiry }, "Subscription renewed");
  } catch (err) {
    logger.error({ err, subId }, "handleSubscriptionInvoicePaid error");
  }
}

// ── Called when a subscription invoice payment fails ─────────────────────────
export async function handleSubscriptionPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subId = typeof (invoice as any).subscription === "string" ? (invoice as any).subscription as string : null;
  if (!subId) return;

  const [existing] = await db.select()
    .from(vendorSubscriptionsTable)
    .where(eq(vendorSubscriptionsTable.stripeSubscriptionId, subId))
    .limit(1);

  if (!existing) return;

  const graceUntil = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  await db.update(vendorSubscriptionsTable)
    .set({ status: "grace_period", graceUntil, updatedAt: new Date() })
    .where(eq(vendorSubscriptionsTable.id, existing.id));

  // Insert in-app notification — use user's own ID as actorId (system notification)
  try {
    await db.insert(notificationsTable).values({
      userId: existing.userId,
      actorId: existing.userId,
      type: "subscription_payment_failed",
    });
  } catch { /* non-fatal */ }

  logger.warn({ userId: existing.userId, graceUntil }, "Subscription payment failed — grace period started");
}

// ── Called when Stripe subscription metadata updates (cancel_at_period_end etc) ─
export async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const subId = subscription.id;

  const [existing] = await db.select()
    .from(vendorSubscriptionsTable)
    .where(eq(vendorSubscriptionsTable.stripeSubscriptionId, subId))
    .limit(1);

  if (!existing) return;

  const nextBillingDate = new Date((subscription as any).current_period_end * 1000);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;

  await db.update(vendorSubscriptionsTable)
    .set({ nextBillingDate, cancelAtPeriodEnd, updatedAt: new Date() })
    .where(eq(vendorSubscriptionsTable.id, existing.id));

  logger.info({ userId: existing.userId, nextBillingDate, cancelAtPeriodEnd }, "Subscription updated via webhook");
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const subId = subscription.id;

  const [existing] = await db.select()
    .from(vendorSubscriptionsTable)
    .where(eq(vendorSubscriptionsTable.stripeSubscriptionId, subId))
    .limit(1);

  if (!existing) return;

  await db.update(vendorSubscriptionsTable)
    .set({ status: "expired", updatedAt: new Date() })
    .where(eq(vendorSubscriptionsTable.id, existing.id));

  await expireUserSubscription(existing.userId);
  logger.info({ userId: existing.userId }, "Subscription expired via Stripe deletion");
}

export async function expireUserSubscription(userId: number): Promise<void> {
  // Downgrade user to basic
  await db.update(usersTable)
    .set({ subscriptionPlan: "basic", subscriptionExpiresAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  // Keep the 4 oldest active listings visible — hide everything above that.
  // This matches the FREE_LISTING_LIMIT (4) for basic accounts.
  const keep4 = await db.select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(eq(listingsTable.sellerId, userId), eq(listingsTable.status, "available")))
    .orderBy(asc(listingsTable.createdAt))
    .limit(4);

  const keepIds = keep4.map(r => r.id);

  if (keepIds.length > 0) {
    await db.update(listingsTable)
      .set({ status: "subscription_hidden" })
      .where(and(
        eq(listingsTable.sellerId, userId),
        eq(listingsTable.status, "available"),
        notInArray(listingsTable.id, keepIds),
      ));
  } else {
    // No active listings at all — nothing to hide
  }

  logger.info({ userId, keptVisible: keepIds.length }, "User subscription expired: listings above 4 hidden");
}

/** Retry interval between wallet payment attempts: 2 days */
const WALLET_RETRY_DAYS = 2;
/** Max wallet payment attempts before subscription is killed */
const WALLET_MAX_ATTEMPTS = 3;

// ── Background job: expire stale subscriptions + grace periods + reminders ───
export async function runSubscriptionExpiryJob(): Promise<void> {
  try {
    // 0. FM-wallet auto-renewal: try to charge wallet for subscriptions that
    //    have no Stripe ID (wallet-paid) and have reached their billing date.
    //    Up to WALLET_MAX_ATTEMPTS retries spaced WALLET_RETRY_DAYS apart.
    const walletDue = await db.select()
      .from(vendorSubscriptionsTable)
      .where(and(
        eq(vendorSubscriptionsTable.status, "active"),
        sql`${vendorSubscriptionsTable.stripeSubscriptionId} IS NULL`,
        isNotNull(vendorSubscriptionsTable.expiresAt),
        // Due if: expiresAt < now AND (no retryAt OR retryAt < now)
        lt(vendorSubscriptionsTable.expiresAt, new Date()),
        or(
          sql`${vendorSubscriptionsTable.nextWalletRetryAt} IS NULL`,
          lt(vendorSubscriptionsTable.nextWalletRetryAt, new Date()),
        ),
        lt(vendorSubscriptionsTable.walletPaymentAttempts, WALLET_MAX_ATTEMPTS),
      ));

    for (const sub of walletDue) {
      const config = PLAN_CONFIG[sub.plan as SubscriptionPlan];
      if (!config || config.priceUsd <= 0) continue;

      const attempt = (sub.walletPaymentAttempts ?? 0) + 1;
      let renewed = false;

      try {
        const result = await deductWalletHybrid(
          sub.userId,
          config.priceUsd,
          `Renouvèlman abònman ${config.name} — mwa`,
          "vendor_subscription",
          sub.userId,
        );
        renewed = result.ok;
      } catch { /* non-fatal */ }

      if (renewed) {
        // Extend subscription by 1 month
        const newExpiry = new Date(sub.expiresAt ?? new Date());
        newExpiry.setMonth(newExpiry.getMonth() + 1);
        await db.update(vendorSubscriptionsTable)
          .set({
            expiresAt: newExpiry,
            nextBillingDate: newExpiry,
            walletPaymentAttempts: 0,
            nextWalletRetryAt: null,
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(vendorSubscriptionsTable.id, sub.id));
        await db.update(usersTable)
          .set({ subscriptionExpiresAt: newExpiry, updatedAt: new Date() })
          .where(eq(usersTable.id, sub.userId));
        // Unhide any previously hidden listings
        await db.update(listingsTable)
          .set({ status: "available" })
          .where(and(eq(listingsTable.sellerId, sub.userId), eq(listingsTable.status, "subscription_hidden")));
        // Remind user of renewal
        try {
          await db.insert(notificationsTable).values({
            userId: sub.userId, actorId: sub.userId, type: "subscription_billing_reminder",
          });
        } catch { /* non-fatal */ }
        logger.info({ userId: sub.userId, plan: sub.plan, newExpiry }, "Wallet subscription auto-renewed");
      } else {
        // Payment failed — schedule retry or expire
        if (attempt >= WALLET_MAX_ATTEMPTS) {
          // Final attempt failed → expire now
          await db.update(vendorSubscriptionsTable)
            .set({ status: "expired", walletPaymentAttempts: attempt, updatedAt: new Date() })
            .where(eq(vendorSubscriptionsTable.id, sub.id));
          await expireUserSubscription(sub.userId);
          try {
            await db.insert(notificationsTable).values({
              userId: sub.userId, actorId: sub.userId, type: "subscription_grace_expired",
            });
          } catch { /* non-fatal */ }
          logger.warn({ userId: sub.userId, attempt }, "Wallet subscription expired after max attempts");
        } else {
          // Schedule next retry
          const retryAt = new Date(Date.now() + WALLET_RETRY_DAYS * 24 * 60 * 60 * 1000);
          await db.update(vendorSubscriptionsTable)
            .set({ walletPaymentAttempts: attempt, nextWalletRetryAt: retryAt, updatedAt: new Date() })
            .where(eq(vendorSubscriptionsTable.id, sub.id));
          try {
            await db.insert(notificationsTable).values({
              userId: sub.userId, actorId: sub.userId, type: "subscription_payment_failed",
            });
          } catch { /* non-fatal */ }
          logger.warn({ userId: sub.userId, attempt, retryAt }, "Wallet subscription payment failed — retry scheduled");
        }
      }
    }
    if (walletDue.length > 0) logger.info({ count: walletDue.length }, "Subscription expiry job: wallet renewals processed");

    // 1. Expire active subscriptions that have passed their expiresAt date
    //    (Stripe-billed or wallet subs that exhausted retries above)
    const expired = await db.select({ userId: vendorSubscriptionsTable.userId, id: vendorSubscriptionsTable.id })
      .from(vendorSubscriptionsTable)
      .where(and(
        eq(vendorSubscriptionsTable.status, "active"),
        isNotNull(vendorSubscriptionsTable.expiresAt),
        lt(vendorSubscriptionsTable.expiresAt, new Date()),
        // Skip wallet subs that still have retry attempts left
        or(
          isNotNull(vendorSubscriptionsTable.stripeSubscriptionId),
          sql`(${vendorSubscriptionsTable.walletPaymentAttempts} >= ${WALLET_MAX_ATTEMPTS})`,
        ),
      ));

    for (const row of expired) {
      await db.update(vendorSubscriptionsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(vendorSubscriptionsTable.id, row.id));
      await expireUserSubscription(row.userId);
    }
    if (expired.length > 0) logger.info({ count: expired.length }, "Subscription expiry job: expired active");

    // 2. Expire grace periods that have run out → downgrade & notify
    const graceExpired = await db.select({
      userId: vendorSubscriptionsTable.userId,
      id: vendorSubscriptionsTable.id,
    })
      .from(vendorSubscriptionsTable)
      .where(and(
        eq(vendorSubscriptionsTable.status, "grace_period"),
        isNotNull(vendorSubscriptionsTable.graceUntil),
        lt(vendorSubscriptionsTable.graceUntil, new Date())
      ));

    for (const row of graceExpired) {
      await db.update(vendorSubscriptionsTable)
        .set({ status: "expired", graceUntil: null, updatedAt: new Date() })
        .where(eq(vendorSubscriptionsTable.id, row.id));
      await expireUserSubscription(row.userId);
      try {
        await db.insert(notificationsTable).values({
          userId: row.userId,
          actorId: row.userId,
          type: "subscription_grace_expired",
        });
      } catch { /* non-fatal */ }
    }
    if (graceExpired.length > 0) logger.info({ count: graceExpired.length }, "Subscription expiry job: grace periods expired");

    // 3. Pre-billing reminders: notify users 3 days before next billing
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const in4Days = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const upcomingBilling = await db.select({
      userId: vendorSubscriptionsTable.userId,
      id: vendorSubscriptionsTable.id,
      nextBillingDate: vendorSubscriptionsTable.nextBillingDate,
    })
      .from(vendorSubscriptionsTable)
      .where(and(
        eq(vendorSubscriptionsTable.status, "active"),
        eq(vendorSubscriptionsTable.cancelAtPeriodEnd, false),
        isNotNull(vendorSubscriptionsTable.nextBillingDate),
        gte(vendorSubscriptionsTable.nextBillingDate, in3Days),
        lte(vendorSubscriptionsTable.nextBillingDate, in4Days)
      ));

    for (const row of upcomingBilling) {
      try {
        await db.insert(notificationsTable).values({
          userId: row.userId,
          actorId: row.userId,
          type: "subscription_billing_reminder",
        });
      } catch { /* non-fatal */ }
    }
    if (upcomingBilling.length > 0) logger.info({ count: upcomingBilling.length }, "Subscription expiry job: billing reminders sent");

  } catch (err) {
    logger.error({ err }, "Subscription expiry job failed");
  }
}

export default router;
