import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireFinanceAdmin } from "../middlewares/auth";
import { getStripeClient, getStripePublishableKey } from "../lib/stripeClient";
import { logger } from "../lib/logger";

const router = Router();

const BASE_URL = (() => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:3000";
})();

/**
 * GET /api/stripe/config
 * Returns the Stripe publishable key for frontend usage.
 */
router.get("/stripe/config", async (_req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    return res.json({ publishableKey });
  } catch (err) {
    logger.error({ err }, "stripe/config error");
    return res.status(500).json({ error: "Stripe not configured" });
  }
});

/**
 * GET /api/stripe/connect/status
 * Returns the current vendor's Stripe Connect account status.
 */
router.get("/stripe/connect/status", requireAuth, async (req: any, res) => {
  try {
    const [user] = await db
      .select({
        stripeAccountId: usersTable.stripeAccountId,
        stripeAccountStatus: usersTable.stripeAccountStatus,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId));

    if (!user) return res.status(404).json({ error: "User not found" });

    let details: Record<string, unknown> = {};

    if (user.stripeAccountId) {
      try {
        const stripe = await getStripeClient();
        const account = await stripe.accounts.retrieve(user.stripeAccountId);
        const chargesEnabled = account.charges_enabled;
        const payoutsEnabled = account.payouts_enabled;
        const detailsSubmitted = account.details_submitted;

        const status = chargesEnabled && detailsSubmitted ? "active" : "pending";
        if (status !== user.stripeAccountStatus) {
          await db
            .update(usersTable)
            .set({ stripeAccountStatus: status })
            .where(eq(usersTable.id, req.userId));
        }

        details = { chargesEnabled, payoutsEnabled, detailsSubmitted, country: account.country };
      } catch (err) {
        logger.warn({ err }, "Could not retrieve Stripe account details");
      }
    }

    return res.json({
      stripeAccountId: user.stripeAccountId,
      stripeAccountStatus: user.stripeAccountStatus,
      ...details,
    });
  } catch (err) {
    logger.error({ err }, "stripe/connect/status error");
    return res.status(500).json({ error: "Failed to retrieve Connect status" });
  }
});

/**
 * POST /api/stripe/connect/onboard
 * Creates (or retrieves) a Stripe Express account and returns an Account Link URL.
 */
router.post("/stripe/connect/onboard", requireAuth, async (req: any, res) => {
  try {
    const stripe = await getStripeClient();

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId));

    if (!user) return res.status(404).json({ error: "User not found" });

    let accountId = user.stripeAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { flexaUserId: String(user.id) },
      });
      accountId = account.id;

      await db
        .update(usersTable)
        .set({ stripeAccountId: accountId, stripeAccountStatus: "pending" })
        .where(eq(usersTable.id, req.userId));
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${BASE_URL}/settings/stripe-refresh`,
      return_url: `${BASE_URL}/settings/stripe-return`,
      type: "account_onboarding",
    });

    return res.json({ url: accountLink.url });
  } catch (err) {
    logger.error({ err }, "stripe/connect/onboard error");
    return res.status(500).json({ error: "Failed to create Stripe Connect link" });
  }
});

/**
 * POST /api/stripe/connect/refresh
 * Generates a fresh Account Link for accounts that need to complete onboarding.
 */
router.post("/stripe/connect/refresh", requireAuth, async (req: any, res) => {
  try {
    const [user] = await db
      .select({ stripeAccountId: usersTable.stripeAccountId })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId));

    if (!user?.stripeAccountId) {
      return res.status(400).json({ error: "No Stripe account found. Start onboarding first." });
    }

    const stripe = await getStripeClient();
    const accountLink = await stripe.accountLinks.create({
      account: user.stripeAccountId,
      refresh_url: `${BASE_URL}/settings/stripe-refresh`,
      return_url: `${BASE_URL}/settings/stripe-return`,
      type: "account_onboarding",
    });

    return res.json({ url: accountLink.url });
  } catch (err) {
    logger.error({ err }, "stripe/connect/refresh error");
    return res.status(500).json({ error: "Failed to refresh Connect link" });
  }
});

/**
 * POST /api/stripe/connect/dashboard
 * Returns a Stripe Express Dashboard login link for a connected vendor.
 */
router.post("/stripe/connect/dashboard", requireAuth, async (req: any, res) => {
  try {
    const [user] = await db
      .select({ stripeAccountId: usersTable.stripeAccountId, stripeAccountStatus: usersTable.stripeAccountStatus })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId));

    if (!user?.stripeAccountId) {
      return res.status(400).json({ error: "Stripe account not connected" });
    }
    if (user.stripeAccountStatus !== "active") {
      return res.status(400).json({ error: "Stripe account not yet active. Complete onboarding first." });
    }

    const stripe = await getStripeClient();
    const loginLink = await stripe.accounts.createLoginLink(user.stripeAccountId);
    return res.json({ url: loginLink.url });
  } catch (err) {
    logger.error({ err }, "stripe/connect/dashboard error");
    return res.status(500).json({ error: "Failed to create dashboard link" });
  }
});

/**
 * GET /api/admin/stripe/vendors
 * Admin: List all users with their Stripe Connect status.
 */
router.get("/admin/stripe/vendors", requireFinanceAdmin, async (_req: any, res) => {
  try {
    const vendors = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        country: usersTable.country,
        stripeAccountId: usersTable.stripeAccountId,
        stripeAccountStatus: usersTable.stripeAccountStatus,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt));

    return res.json(vendors);
  } catch (err) {
    logger.error({ err }, "admin/stripe/vendors error");
    return res.status(500).json({ error: "Failed to list vendors" });
  }
});

export default router;
