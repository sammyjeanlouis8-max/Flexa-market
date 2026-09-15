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
import { db, boostsTable, listingsTable, transactionsTable, notificationsTable, walletTransactionsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  getAccessToken,
  createPayment,
  retrieveTransactionByTransactionId,
  type MonCashConfig,
  type MonCashMode,
} from "../lib/moncash";
import { getMonCashRuntimeConfig } from "../lib/haiti-money";
import { verifyHaitiMonCashTopup } from "./haiti-money";
import {
  bazikCreationDefinitelyRejected,
  bazikPaymentSucceeded,
  createBazikMonCashPayment,
  getBazikAccessToken,
  normalizeBazikPayment,
  retrieveBazikPayment,
  verifyBazikWebhookSignature,
  type BazikConfig,
} from "../lib/bazik";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readMonCashConfig(): Promise<Record<string, unknown>> {
  return getMonCashRuntimeConfig() as unknown as Promise<Record<string, unknown>>;
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

function requestOrigin(req: { headers: Record<string, string | string[] | undefined> }): string {
  const host = String(req.headers["host"] ?? "localhost");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  return `${proto}://${host}`;
}

function readBazikConfig(cfg: Record<string, unknown>): BazikConfig {
  return {
    userId: String(cfg.bazikUserId ?? "").trim(),
    secretKey: String(cfg.bazikSecretKey ?? "").trim(),
    webhookSecret: String(cfg.bazikWebhookSecret ?? "").trim(),
  };
}

async function completeVerifiedBoost(input: {
  boostId: number;
  listingId: number;
  transactionId: string;
  amountHtg: number;
}): Promise<"completed" | "already_processed" | "invalid"> {
  const [boost] = await db.select().from(boostsTable)
    .where(and(eq(boostsTable.id, input.boostId), eq(boostsTable.listingId, input.listingId)));
  if (!boost) return "invalid";
  if (boost.paymentStatus === "paid") return "already_processed";
  if (!Number.isFinite(input.amountHtg) || Math.abs(input.amountHtg - boost.price) > 1) return "invalid";

  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(boostsTable)
      .set({ paymentStatus: "paid" })
      .where(and(
        eq(boostsTable.id, input.boostId),
        eq(boostsTable.listingId, input.listingId),
        eq(boostsTable.paymentStatus, "pending"),
      ))
      .returning({ id: boostsTable.id });
    if (!claimed) return "already_processed" as const;

    await tx.update(listingsTable)
      .set({
        isBoosted: true,
        boostStartAt: new Date(),
        boostExpiresAt: boost.expiresAt,
        boostAudienceCountry: boost.audienceCountry,
        boostAudienceState: boost.audienceState,
        boostAudienceCity: boost.audienceCity,
        boostAudienceCities: boost.audienceCities,
      })
      .where(eq(listingsTable.id, input.listingId));

    await tx.insert(transactionsTable).values({
      userId: boost.userId!,
      listingId: input.listingId,
      type: "boost",
      amount: boost.price,
      currency: boost.audienceCountry === "Haiti" ? "HTG" : "USD",
      paymentMethod: boost.paymentMethod,
      paymentStatus: "completed",
      paymentRef: input.transactionId,
      description: `MonCash boost ${boost.plan} for listing #${input.listingId}`,
    });

    await tx.insert(notificationsTable).values({
      userId: boost.userId!,
      actorId: boost.userId!,
      type: "boost_approved",
      listingId: input.listingId,
    }).catch(() => {});
    return "completed" as const;
  });
}

async function processVerifiedBazikOrder(
  cfg: Record<string, unknown>,
  orderId: string,
): Promise<{ ok: boolean; redirect: string }> {
  const bazikConfig = readBazikConfig(cfg);
  const token = await getBazikAccessToken(bazikConfig);
  const payment = await retrieveBazikPayment(bazikConfig, token, orderId);
  if (payment.orderId !== orderId || (payment.currency && payment.currency !== "HTG")) {
    return { ok: false, redirect: "/?moncash=error" };
  }
  if (!bazikPaymentSucceeded(payment.status)) {
    return { ok: false, redirect: "/?moncash=pending" };
  }
  const transactionId = payment.transactionId || payment.orderId;
  if (payment.referenceId.startsWith("wallet_topup_")) {
    const [pending] = await db.select({
      id: walletTransactionsTable.id,
      status: walletTransactionsTable.status,
      providerOrderId: walletTransactionsTable.userTransferRef,
    }).from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.paymentRef, payment.referenceId));
    if (!pending) return { ok: false, redirect: "/?moncash=error" };
    if (!pending.providerOrderId && pending.status === "pending") {
      const [bound] = await db.update(walletTransactionsTable)
        .set({ userTransferRef: orderId })
        .where(and(
          eq(walletTransactionsTable.id, pending.id),
          eq(walletTransactionsTable.status, "pending"),
          isNull(walletTransactionsTable.userTransferRef),
        ))
        .returning({ id: walletTransactionsTable.id });
      if (!bound) return { ok: false, redirect: "/?moncash=pending" };
    } else if (pending.providerOrderId !== orderId) {
      return { ok: false, redirect: "/?moncash=error" };
    }
    const outcome = await verifyHaitiMonCashTopup(
      transactionId,
      payment.referenceId,
      payment.amountHtg,
      orderId,
    );
    return {
      ok: outcome.ok,
      redirect: outcome.ok
        ? outcome.alreadyProcessed ? "/?wallet_topup=already_processed" : "/?wallet_topup=paid"
        : "/?moncash=amount_mismatch",
    };
  }

  const parsed = parseOrderId(payment.referenceId);
  if (!parsed) return { ok: false, redirect: "/?moncash=error" };
  const [storedBoost] = await db.select({
    paymentRef: boostsTable.paymentRef,
    paymentStatus: boostsTable.paymentStatus,
  }).from(boostsTable)
    .where(and(eq(boostsTable.id, parsed.boostId), eq(boostsTable.listingId, parsed.listingId)));
  if (!storedBoost) return { ok: false, redirect: "/?moncash=error" };
  if (storedBoost.paymentRef === payment.referenceId && storedBoost.paymentStatus === "pending") {
    const [bound] = await db.update(boostsTable)
      .set({ paymentRef: orderId })
      .where(and(
        eq(boostsTable.id, parsed.boostId),
        eq(boostsTable.listingId, parsed.listingId),
        eq(boostsTable.paymentStatus, "pending"),
        eq(boostsTable.paymentRef, payment.referenceId),
      ))
      .returning({ id: boostsTable.id });
    if (!bound) return { ok: false, redirect: `/boost/${parsed.listingId}?moncash=pending` };
  } else if (storedBoost.paymentRef !== orderId) {
    return { ok: false, redirect: "/?moncash=error" };
  }
  const outcome = await completeVerifiedBoost({
    ...parsed,
    transactionId,
    amountHtg: payment.amountHtg,
  });
  return {
    ok: outcome !== "invalid",
    redirect: outcome === "invalid"
      ? `/boost/${parsed.listingId}?moncash=amount_mismatch`
      : `/boost/${parsed.listingId}?moncash_paid=1`,
  };
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

  const clientId = String(cfg.clientId ?? "").trim();
  const clientSecret = String(cfg.clientSecret ?? "").trim();
  const bazikConfig = readBazikConfig(cfg);
  const useBazik = cfg.adapter === "bazik";
  if (useBazik
    ? (!bazikConfig.userId || !bazikConfig.secretKey || !bazikConfig.webhookSecret)
    : (!clientId || !clientSecret)) {
    res.json({ notConfigured: true });
    return;
  }

  // Fetch the boost to get the amount.
  const [boost] = await db
    .select()
    .from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId)));

  if (!boost) { res.status(404).json({ error: "Boost order not found" }); return; }

  // Only the boost owner may initiate payment.
  if (boost.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  if (boost.paymentStatus !== "pending") {
    res.status(400).json({ error: "Boost is not in pending state" }); return;
  }
  if (useBazik && boost.audienceCountry !== "Haiti") {
    res.status(400).json({ error: "Bazik MonCash boosts require an HTG-priced Haiti audience" });
    return;
  }

  const monCashCfg: MonCashConfig = {
    mode:         (cfg.mode === "live" ? "live" : "sandbox") as MonCashMode,
    clientId,
    clientSecret,
    returnUrl:    String(cfg.callbackUrl ?? "") || buildReturnUrl(req as any),
  };
  let accessToken: string;
  try {
    accessToken = useBazik
      ? await getBazikAccessToken(bazikConfig)
      : await getAccessToken(monCashCfg);
  } catch {
    logger.error({ boostId, listingId }, "[moncash/pay] provider authentication failed");
    res.status(502).json({ error: "MonCash authentication failed" });
    return;
  }

  const internalReference = makeOrderId(boostId, listingId);
  if (useBazik) {
    const [initiationClaim] = await db.update(boostsTable)
      .set({ paymentRef: internalReference })
      .where(and(
        eq(boostsTable.id, boostId),
        eq(boostsTable.listingId, listingId),
        eq(boostsTable.paymentStatus, "pending"),
        isNull(boostsTable.paymentRef),
      ))
      .returning({ id: boostsTable.id });
    if (!initiationClaim) {
      res.status(409).json({ error: "A MonCash payment is already in progress for this boost" });
      return;
    }
  }

  try {
    let providerOrderId = internalReference;
    let redirectUrl: string;
    if (useBazik) {
      const origin = requestOrigin(req as any);
      const checkout = await createBazikMonCashPayment({
        config: bazikConfig,
        accessToken,
        amountHtg: boost.price,
        referenceId: internalReference,
        description: `Flexa Market boost for listing #${listingId}`,
        successUrl: `${origin}/api/bazik/return?reference=${encodeURIComponent(internalReference)}`,
        errorUrl: `${origin}/boost/${listingId}?moncash=cancelled`,
        webhookUrl: `${origin}/api/bazik/webhook`,
      });
      providerOrderId = checkout.orderId;
      redirectUrl = checkout.redirectUrl!;
    } else {
      const checkout = await createPayment(monCashCfg, accessToken, internalReference, boost.price);
      redirectUrl = checkout.redirectUrl;
    }

    if (useBazik) {
      const [bound] = await db.update(boostsTable)
        .set({ paymentRef: providerOrderId })
        .where(and(
          eq(boostsTable.id, boostId),
          eq(boostsTable.paymentStatus, "pending"),
          eq(boostsTable.paymentRef, internalReference),
        ))
        .returning({ id: boostsTable.id });
      if (!bound) throw new Error("Pending boost disappeared before provider order binding");
    } else {
      await db.update(boostsTable)
        .set({ paymentRef: providerOrderId })
        .where(and(eq(boostsTable.id, boostId), eq(boostsTable.paymentStatus, "pending")));
    }

    res.json({ redirectUrl });
  } catch (err: any) {
    if (useBazik && bazikCreationDefinitelyRejected(err)) {
      await db.update(boostsTable)
        .set({ paymentRef: null })
        .where(and(
          eq(boostsTable.id, boostId),
          eq(boostsTable.paymentStatus, "pending"),
          eq(boostsTable.paymentRef, internalReference),
        ));
    }
    logger.error("[moncash/pay] failed to create payment");
    res.status(502).json({ error: "MonCash payment creation failed", detail: err?.message });
  }
});

router.post("/bazik/webhook", async (req, res): Promise<void> => {
  const cfg = await readMonCashConfig();
  const bazikConfig = readBazikConfig(cfg);
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
  const signatureValid = verifyBazikWebhookSignature({
    config: bazikConfig,
    rawBody,
    timestamp: String(req.header("X-Bazik-Timestamp") ?? ""),
    eventId: String(req.header("X-Bazik-Event-Id") ?? ""),
    signature: String(req.header("X-Bazik-Signature") ?? ""),
  });
  if (!signatureValid) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const event = normalizeBazikPayment(req.body);
  if (!event.orderId) {
    res.status(400).json({ error: "Missing Bazik orderId" });
    return;
  }
  try {
    const outcome = await processVerifiedBazikOrder(cfg, event.orderId);
    if (!outcome.ok) {
      res.status(outcome.redirect.includes("pending") ? 409 : 422).json({
        error: outcome.redirect.includes("pending") ? "Payment verification is pending" : "Payment validation failed",
      });
      return;
    }
    res.json({ received: true });
  } catch (err) {
    logger.error({ orderId: event.orderId }, "[bazik/webhook] payment verification failed");
    res.status(502).json({ error: "Payment verification failed" });
  }
});

router.get("/bazik/return", async (req, res): Promise<void> => {
  const reference = String(req.query["reference"] ?? "").trim();
  if (!reference) {
    res.redirect("/?moncash=error");
    return;
  }
  const cfg = await readMonCashConfig();
  let orderId = "";
  if (reference.startsWith("wallet_topup_")) {
    const [pending] = await db.select({ orderId: walletTransactionsTable.userTransferRef })
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.paymentRef, reference));
    orderId = pending?.orderId ?? "";
  } else {
    const parsed = parseOrderId(reference);
    if (parsed) {
      const [boost] = await db.select({ orderId: boostsTable.paymentRef })
        .from(boostsTable)
        .where(and(eq(boostsTable.id, parsed.boostId), eq(boostsTable.listingId, parsed.listingId)));
      orderId = boost?.orderId ?? "";
    }
  }
  if (!orderId) {
    res.redirect("/?moncash=error");
    return;
  }
  try {
    const outcome = await processVerifiedBazikOrder(cfg, orderId);
    res.redirect(outcome.redirect);
  } catch (err) {
    logger.error({ orderId }, "[bazik/return] payment verification failed");
    res.redirect("/?moncash=error");
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
    returnUrl:    String(cfg.callbackUrl ?? "") || buildReturnUrl(req as any),
  };

  let txn: Awaited<ReturnType<typeof retrieveTransactionByTransactionId>>;
  try {
    const token = await getAccessToken(monCashCfg);
    txn = await retrieveTransactionByTransactionId(monCashCfg, token, transactionId);
  } catch (err: any) {
    logger.error("[moncash/return] transaction retrieval failed");
    res.redirect("/?moncash=error");
    return;
  }

  // Wallet topups use the same verified MonCash return callback as boosts.
  // The reference is generated server-side, so arbitrary references cannot
  // cause a wallet credit.
  if (txn.reference.startsWith("wallet_topup_")) {
    const outcome = await verifyHaitiMonCashTopup(txn.transactionId, txn.reference, txn.cost);
    if (!outcome.ok) {
      res.redirect("/?moncash=amount_mismatch");
      return;
    }
    res.redirect(outcome.alreadyProcessed ? "/?wallet_topup=already_processed" : "/?wallet_topup=paid");
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

  try {
    const outcome = await completeVerifiedBoost({
      boostId,
      listingId,
      transactionId: txn.transactionId,
      amountHtg: txn.cost,
    });
    if (outcome === "invalid") {
      res.redirect(`/boost/${listingId}?moncash=amount_mismatch`);
      return;
    }
  } catch (err: any) {
    logger.error("[moncash/return] DB activation failed");
    res.redirect("/?moncash=error");
    return;
  }

  // ✅ Success — redirect to the boost page (Boost.tsx will detect param and show success).
  res.redirect(`/boost/${listingId}?moncash_paid=1`);
});

export default router;
