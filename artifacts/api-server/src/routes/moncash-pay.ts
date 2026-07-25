/**
 * MonCash Gateway — payment initiation and return-URL callback.
 *
 * POST /api/moncash/pay
 *   Authenticated. Initiates a MonCash payment for an existing boost order.
 *   Returns { redirectUrl } to send the customer to MonCash's hosted page.
 *   If MonCash is not configured, returns { notConfigured: true } so the
 *   frontend can fall back to the manual reference-entry flow.
 *
 * GET /api/moncash/return
 *   Public. Called by MonCash after the customer completes (or cancels) payment.
 *   Verifies the transaction, marks the boost as "paid", activates the listing,
 *   then redirects the customer to the boost success page on the frontend.
 */

import { Router, type IRouter } from "express";
import { db, platformSettingsTable, boostsTable, listingsTable, transactionsTable, notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  getAccessToken,
  createPayment,
  retrieveTransactionByTransactionId,
  type MonCashConfig,
  type MonCashMode,
} from "../lib/moncash";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readMonCashConfig(): Promise<Record<string, unknown>> {
  const [row] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "payment_provider_moncash"));

  const defaults = {
    enabled: false,
    mode: "sandbox",
    clientId: "",
    clientSecret: "",
    callbackUrl: "",
    phoneNumber: "+509 3600-3636",
  };

  if (!row) return defaults;
  try {
    const parsed = JSON.parse(row.value);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

/** orderId format: boost_{boostId}_{listingId}_{unixMs} */
function makeOrderId(boostId: number, listingId: number): string {
  return `boost_${boostId}_${listingId}_${Date.now()}`;
}

function parseOrderId(orderId: string): { boostId: number; listingId: number } | null {
  const m = orderId.match(/^boost_(\d+)_(\d+)_\d+$/);
  if (!m) return null;
  return { boostId: parseInt(m[1]!, 10), listingId: parseInt(m[2]!, 10) };
}

/** Build the return-URL (where MonCash redirects back). */
function buildReturnUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  // Prefer explicit env var so it works both in dev (Replit) and in production.
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}/api/moncash/return`;

  // Fallback: derive from Host header (works for custom deployments).
  const host = String(req.headers["host"] ?? "localhost");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  return `${proto}://${host}/api/moncash/return`;
}

// ── POST /api/moncash/pay ─────────────────────────────────────────────────────

router.post("/moncash/pay", requireAuth, async (req, res): Promise<void> => {
  const boostId   = parseInt(String(req.body?.boostId   ?? ""), 10);
  const listingId = parseInt(String(req.body?.listingId ?? ""), 10);

  if (!boostId || !listingId) {
    res.status(400).json({ error: "boostId and listingId are required" });
    return;
  }

  // Load and validate MonCash config.
  const cfg = await readMonCashConfig();

  if (!cfg.enabled) {
    // Not configured — tell the frontend to fall back to manual flow.
    res.json({ notConfigured: true });
    return;
  }

  const clientId     = String(cfg.clientId ?? "").trim();
  const clientSecret = String(cfg.clientSecret ?? "").trim();
  if (!clientId || !clientSecret) {
    res.json({ notConfigured: true });
    return;
  }

  // Fetch the boost to get the amount.
  const [boost] = await db
    .select()
    .from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId)));

  if (!boost) { res.status(404).json({ error: "Boost order not found" }); return; }

  // Only the boost owner (or an admin) may initiate payment.
  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  if (boost.userId !== req.userId && !isAdmin) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  if (boost.paymentStatus !== "pending") {
    res.status(400).json({ error: "Boost is not in pending state" }); return;
  }

  const monCashCfg: MonCashConfig = {
    mode:         (cfg.mode === "live" ? "live" : "sandbox") as MonCashMode,
    clientId,
    clientSecret,
    returnUrl:    buildReturnUrl(req as any),
  };

  try {
    const token    = await getAccessToken(monCashCfg);
    const orderId  = makeOrderId(boostId, listingId);
    const { redirectUrl } = await createPayment(monCashCfg, token, orderId, boost.price);

    // Store the orderId on the boost so the return handler can look it up
    // even if the transactionId → orderId lookup fails.
    await db.update(boostsTable)
      .set({ paymentRef: orderId })
      .where(and(eq(boostsTable.id, boostId), eq(boostsTable.paymentStatus, "pending")));

    res.json({ redirectUrl });
  } catch (err: any) {
    req.log.error({ err }, "[moncash/pay] failed to create payment");
    res.status(502).json({ error: "MonCash payment creation failed", detail: err?.message });
  }
});

// ── GET /api/moncash/return ───────────────────────────────────────────────────

router.get("/moncash/return", async (req, res): Promise<void> => {
  const transactionId = String(req.query["transactionId"] ?? "").trim();

  if (!transactionId) {
    // MonCash cancelled / no transactionId → redirect to home.
    res.redirect("/?moncash=cancelled");
    return;
  }

  const cfg = await readMonCashConfig();

  const clientId     = String(cfg.clientId ?? "").trim();
  const clientSecret = String(cfg.clientSecret ?? "").trim();

  if (!cfg.enabled || !clientId || !clientSecret) {
    // Config disappeared since the payment was initiated — fail gracefully.
    res.redirect("/?moncash=error");
    return;
  }

  const monCashCfg: MonCashConfig = {
    mode:         (cfg.mode === "live" ? "live" : "sandbox") as MonCashMode,
    clientId,
    clientSecret,
    returnUrl:    buildReturnUrl(req as any),
  };

  let txn: Awaited<ReturnType<typeof retrieveTransactionByTransactionId>>;
  try {
    const token = await getAccessToken(monCashCfg);
    txn = await retrieveTransactionByTransactionId(monCashCfg, token, transactionId);
  } catch (err: any) {
    logger.error({ err }, "[moncash/return] transaction retrieval failed");
    res.redirect("/?moncash=error");
    return;
  }

  // Decode our orderId from the transaction reference field.
  const parsed = parseOrderId(txn.reference);
  if (!parsed) {
    logger.error({ ref: txn.reference }, "[moncash/return] unrecognised orderId format");
    res.redirect("/?moncash=error");
    return;
  }

  const { boostId, listingId } = parsed;

  const [boost] = await db
    .select()
    .from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId)));

  if (!boost) {
    res.redirect("/?moncash=error");
    return;
  }

  // Idempotency — if the boost is already paid, just redirect to success.
  if (boost.paymentStatus === "paid") {
    res.redirect(`/boost/${listingId}?moncash_paid=1`);
    return;
  }

  // Validate amount (allow ±1 HTG / USD rounding tolerance).
  if (Math.abs(txn.cost - boost.price) > 1) {
    logger.warn({ expected: boost.price, got: txn.cost }, "[moncash/return] amount mismatch");
    res.redirect(`/boost/${listingId}?moncash=amount_mismatch`);
    return;
  }

  // All good — activate the boost and mark the listing as boosted.
  try {
    await db.transaction(async (tx) => {
      // Mark boost as paid.
      await tx.update(boostsTable)
        .set({ paymentStatus: "paid", paymentRef: txn.transactionId })
        .where(eq(boostsTable.id, boostId));

      // Activate listing.
      await tx.update(listingsTable)
        .set({
          isBoosted:            true,
          boostStartAt:         new Date(),
          boostExpiresAt:       boost.expiresAt,
          boostAudienceCountry: boost.audienceCountry,
          boostAudienceState:   boost.audienceState,
          boostAudienceCity:    boost.audienceCity,
          boostAudienceCities:  boost.audienceCities,
        })
        .where(eq(listingsTable.id, listingId));

      // Record transaction.
      await tx.insert(transactionsTable).values({
        userId:        boost.userId!,
        listingId,
        type:          "boost",
        amount:        boost.price,
        currency:      boost.audienceCountry === "Haiti" ? "HTG" : "USD",
        paymentMethod: boost.paymentMethod,
        paymentStatus: "completed",
        paymentRef:    txn.transactionId,
        description:   `MonCash boost ${boost.plan} for listing #${listingId}`,
      });

      // Notify user.
      await tx.insert(notificationsTable).values({
        userId:   boost.userId!,
        actorId:  boost.userId!,
        type:     "boost_approved",
        listingId,
      }).catch(() => {});
    });
  } catch (err: any) {
    logger.error({ err }, "[moncash/return] DB activation failed");
    res.redirect("/?moncash=error");
    return;
  }

  // ✅ Success — redirect to the boost page (Boost.tsx will detect param and show success).
  res.redirect(`/boost/${listingId}?moncash_paid=1`);
});

export default router;
