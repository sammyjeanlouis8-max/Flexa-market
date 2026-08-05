import { Router } from "express";
import {
  db, usersTable, transactionsTable, promoWalletTable,
  walletTransactionsTable, notificationsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";
import { sendExpoPushToUser } from "../lib/expo-push";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/email";
import { returnRequestedSellerEmail, returnStatusBuyerEmail } from "../lib/emailTemplates";
import { getStripeClient } from "../lib/stripeClient";
import { getReturnWindowDays } from "../lib/internationalShipping";

const router = Router();

const VALID_REASONS = [
  "not_as_described",
  "damaged",
  "wrong_item",
  "defective",
  "not_received",
  "changed_mind",
] as const;

// ─── POST /api/orders/:id/return — buyer opens return request ─────────────────

router.post("/orders/:id/return", requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id ?? "", 10);
  if (!orderId) { res.status(400).json({ error: "Invalid order id" }); return; }

  const { reason, description } = req.body ?? {};
  if (!VALID_REASONS.includes(reason)) {
    res.status(400).json({ error: "Rezon pa valid" }); return;
  }
  const desc = String(description ?? "").trim();
  if (desc.length < 10) {
    res.status(400).json({ error: "Deskripsyon obligatwa (omwen 10 karaktè)" }); return;
  }

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, orderId));
  if (!tx) { res.status(404).json({ error: "Kòmand pa jwenn" }); return; }
  if (tx.userId !== req.userId) { res.status(403).json({ error: "Sèlman achetè a ka mande retou" }); return; }
  if (tx.orderStatus !== "completed") {
    res.status(409).json({ error: "Retou sèlman disponib pou kòmand ki konplète" }); return;
  }

  const isLocal = tx.listingCountry === "Haiti" || tx.listingCountry === "Dominican Republic";
  if (isLocal) {
    res.status(409).json({ error: "Retou pa disponib pou livrezon lokal (Ayiti / RD)" }); return;
  }

  const countryWindow = getReturnWindowDays(tx.listingCountry ?? "");
  if (countryWindow === 0) {
    res.status(409).json({ error: `Retou pa disponib pou peyi ${tx.listingCountry ?? "sa a"} — vant final` }); return;
  }

  const releaseDate = tx.escrowReleasedAt ?? tx.deliveredAt ?? tx.buyerConfirmedAt;
  if (!releaseDate) { res.status(409).json({ error: "Kòmand pa livré toujou" }); return; }
  const daysSince = (Date.now() - new Date(releaseDate).getTime()) / 86400000;
  if (daysSince > countryWindow) {
    res.status(409).json({ error: `Delè retou ekspire (limit ${countryWindow} jou apre livrezon pou ${tx.listingCountry ?? "peyi sa"})` }); return;
  }

  const existing = await db.execute(
    sql`SELECT id FROM order_returns WHERE order_id = ${orderId} AND status NOT IN ('admin_rejected') LIMIT 1`,
  ) as any[];
  if (existing.length > 0) {
    res.status(409).json({ error: "Yon demann retou deja egziste pou kòmand sa a", returnId: existing[0].id }); return;
  }

  const inserted = await db.execute(
    sql`INSERT INTO order_returns (order_id, buyer_id, seller_id, reason, description, status, refund_amount)
        VALUES (${orderId}, ${req.userId}, ${tx.sellerUserId ?? null}, ${reason}, ${desc}, 'requested', ${tx.amount})
        RETURNING id`,
  ) as any[];
  const returnId = inserted[0]?.id;

  if (tx.sellerUserId) {
    await db.insert(notificationsTable).values({
      userId: tx.sellerUserId,
      actorId: req.userId!,
      type: "return_requested" as any,
      listingId: tx.listingId ?? undefined,
    }).catch(() => {});
    void sendPushToUser(tx.sellerUserId, {
      title: "Demann retou resevwa",
      body: `Achetè a mande retou pou kòmand #${orderId}. Reponn nan 48 èdtan.`,
      url: `/orders/${orderId}`,
      tag: `return-${returnId}`,
    });
    void sendExpoPushToUser(tx.sellerUserId, {
      title: "Demann retou resevwa 📦",
      body: `Achetè a mande retou pou kòmand #${orderId}. Reponn nan 48 èdtan.`,
      data: { url: `/orders/${orderId}` }, sound: "default",
    });
    // Fire-and-forget: notify seller by email too
    void (async () => {
      const [sellerUser] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, tx.sellerUserId!));
      if (sellerUser?.email) {
        const tpl = returnRequestedSellerEmail({ sellerName: sellerUser.name ?? "Vandè", orderId, listingTitle: `Kòmand #${orderId}`, reason, returnId: returnId as number });
        await sendEmail({ to: sellerUser.email, ...tpl });
      }
    })();
  }

  logger.info({ returnId, orderId, buyerId: req.userId, reason }, "Return request created");
  res.json({ ok: true, returnId });
});

// ─── GET /api/orders/:id/return — get return info for an order ───────────────

router.get("/orders/:id/return", requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id ?? "", 10);
  if (!orderId) { res.status(400).json({ error: "Invalid order id" }); return; }

  const [tx] = await db
    .select({ userId: transactionsTable.userId, sellerUserId: transactionsTable.sellerUserId })
    .from(transactionsTable)
    .where(eq(transactionsTable.id, orderId));
  if (!tx) { res.status(404).json({ error: "Order not found" }); return; }

  const isParty = tx.userId === req.userId || tx.sellerUserId === req.userId;
  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;
  if (!isParty && !isAdmin) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db.execute(
    sql`SELECT * FROM order_returns WHERE order_id = ${orderId} ORDER BY created_at DESC LIMIT 1`,
  ) as any[];
  res.json(rows[0] ?? null);
});

// ─── POST /api/returns/:returnId/seller-respond — seller accepts or rejects ──

router.post("/returns/:returnId/seller-respond", requireAuth, async (req, res): Promise<void> => {
  const returnId = parseInt(req.params.returnId ?? "", 10);
  if (!returnId) { res.status(400).json({ error: "Invalid return id" }); return; }

  const { decision, note } = req.body ?? {};
  if (!["accept", "reject"].includes(decision)) {
    res.status(400).json({ error: "decision dwe 'accept' oswa 'reject'" }); return;
  }

  const rows = await db.execute(
    sql`SELECT r.*, t.seller_user_id as tx_seller_id, t.listing_id, r.order_id
        FROM order_returns r
        JOIN transactions t ON t.id = r.order_id
        WHERE r.id = ${returnId} LIMIT 1`,
  ) as any[];
  const ret = rows[0];
  if (!ret) { res.status(404).json({ error: "Return not found" }); return; }
  if (Number(ret.tx_seller_id) !== req.userId) { res.status(403).json({ error: "Sèlman vandè a ka reponn" }); return; }
  if (ret.status !== "requested") { res.status(409).json({ error: "Demann sa a deja reponn" }); return; }

  const newStatus = decision === "accept" ? "seller_accepted" : "seller_rejected";
  const noteVal = String(note ?? "").trim();
  await db.execute(
    sql`UPDATE order_returns
        SET status = ${newStatus}, seller_note = ${noteVal}, seller_responded_at = NOW()
        WHERE id = ${returnId}`,
  );

  await db.insert(notificationsTable).values({
    userId: Number(ret.buyer_id),
    actorId: req.userId!,
    type: (decision === "accept" ? "return_accepted" : "return_rejected") as any,
    listingId: ret.listing_id ?? undefined,
  }).catch(() => {});

  void sendPushToUser(Number(ret.buyer_id), {
    title: decision === "accept" ? "Retou aksepte!" : "Retou refize",
    body: decision === "accept"
      ? `Vandè a aksepte demann retou ou pou kòmand #${ret.order_id}. Voye atik la tounen.`
      : `Vandè a refize retou ou pou kòmand #${ret.order_id}. Kontakte sipò si ou pa dakò.`,
    url: `/orders/${ret.order_id}`,
    tag: `return-${returnId}`,
  });
  void sendExpoPushToUser(Number(ret.buyer_id), {
    title: decision === "accept" ? "Retou aksepte! ✅" : "Retou refize ❌",
    body: decision === "accept"
      ? `Vandè a aksepte demann retou ou pou kòmand #${ret.order_id}.`
      : `Vandè a refize retou ou pou kòmand #${ret.order_id}.`,
    data: { url: `/orders/${ret.order_id}` }, sound: "default",
  });

  // Fire-and-forget email to buyer
  void (async () => {
    const [buyerUser] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, Number(ret.buyer_id)));
    if (buyerUser?.email) {
      const tpl = returnStatusBuyerEmail({ buyerName: buyerUser.name ?? "Achetè", orderId: Number(ret.order_id), listingTitle: `Kòmand #${ret.order_id}`, status: decision === "accept" ? "seller_accepted" : "seller_rejected", note: noteVal || undefined });
      await sendEmail({ to: buyerUser.email, ...tpl });
    }
  })();

  res.json({ ok: true, status: newStatus });
});

// ─── POST /api/returns/:returnId/buyer-ship — buyer marks return shipped ─────

router.post("/returns/:returnId/buyer-ship", requireAuth, async (req, res): Promise<void> => {
  const returnId = parseInt(req.params.returnId ?? "", 10);
  if (!returnId) { res.status(400).json({ error: "Invalid return id" }); return; }

  const { trackingNumber, carrier } = req.body ?? {};

  const rows = await db.execute(
    sql`SELECT r.*, t.seller_user_id as tx_seller_id, r.order_id
        FROM order_returns r
        JOIN transactions t ON t.id = r.order_id
        WHERE r.id = ${returnId} LIMIT 1`,
  ) as any[];
  const ret = rows[0];
  if (!ret) { res.status(404).json({ error: "Return not found" }); return; }
  if (Number(ret.buyer_id) !== req.userId) { res.status(403).json({ error: "Sèlman achetè a ka fè sa" }); return; }
  if (ret.status !== "seller_accepted") {
    res.status(409).json({ error: "Vandè dwe aksepte retou a an premye" }); return;
  }

  await db.execute(
    sql`UPDATE order_returns
        SET status = 'buyer_shipped',
            return_tracking_number = ${String(trackingNumber ?? "").trim() || null},
            return_carrier = ${String(carrier ?? "").trim() || null},
            buyer_shipped_at = NOW()
        WHERE id = ${returnId}`,
  );

  if (ret.tx_seller_id) {
    void sendPushToUser(Number(ret.tx_seller_id), {
      title: "Atik retou voye",
      body: `Achetè a voye atik la tounen${trackingNumber ? ` (${carrier} ${trackingNumber})` : ""}. Konfime resepsyon.`,
      url: `/orders/${ret.order_id}`,
      tag: `return-${returnId}`,
    });
    void sendExpoPushToUser(Number(ret.tx_seller_id), {
      title: "Atik retou voye 📬",
      body: `Achetè a voye atik la tounen. Konfime resepsyon.`,
      data: { url: `/orders/${ret.order_id}` }, sound: "default",
    });
  }

  res.json({ ok: true, status: "buyer_shipped" });
});

// ─── POST /api/admin/returns/:returnId/decide — admin approves or rejects ────

router.post("/admin/returns/:returnId/decide", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const returnId = parseInt(req.params.returnId ?? "", 10);
  if (!returnId) { res.status(400).json({ error: "Invalid return id" }); return; }

  const { decision, note } = req.body ?? {};
  if (!["approve", "reject"].includes(decision)) {
    res.status(400).json({ error: "decision dwe 'approve' oswa 'reject'" }); return;
  }

  // ── Step 1: read full record + tx data ──────────────────────────────────────
  const rows = await db.execute(
    sql`SELECT r.*,
          t.seller_user_id           AS tx_seller_id,
          t.amount                   AS tx_amount,
          t.listing_id,
          t.payment_method           AS tx_payment_method,
          t.stripe_payment_intent_id AS tx_stripe_pi
        FROM order_returns r
        JOIN transactions t ON t.id = r.order_id
        WHERE r.id = ${returnId} LIMIT 1`,
  ) as any[];
  const ret = rows[0];
  if (!ret) { res.status(404).json({ error: "Return not found" }); return; }

  const ACTIONABLE = ["requested", "seller_accepted", "seller_rejected", "buyer_shipped"];
  if (!ACTIONABLE.includes(ret.status)) {
    res.status(409).json({ error: "Retou deja finalise" }); return;
  }

  // ── Step 2: atomic compare-and-swap lock ─────────────────────────────────
  // Only one concurrent admin request can win this UPDATE. The loser gets 0 rows.
  const lockRows = await db.execute(
    sql`UPDATE order_returns
        SET status = 'processing'
        WHERE id = ${returnId}
          AND status = ${ret.status}
        RETURNING id`,
  ) as any[];
  if ((lockRows as any[]).length === 0) {
    res.status(409).json({ error: "Demann sa a ap trete pa yon lòt admin. Eseye ankò nan yon moman." }); return;
  }

  const noteVal = String(note ?? "").trim();

  // ── All post-lock side effects wrapped in try/catch ───────────────────────
  // Guarantees: if ANY operation fails after acquiring the lock, the record is
  // rolled back to its prior status (best-effort) so admin can retry. This
  // prevents records from getting permanently stuck in `processing`.
  try {
    if (decision === "approve") {
      const refundAmount  = parseFloat(String(ret.refund_amount ?? ret.tx_amount ?? 0));
      const sellerId: number | null = ret.tx_seller_id ? Number(ret.tx_seller_id) : null;
      const buyerId       = Number(ret.buyer_id);
      const isStripeOrder = ret.tx_payment_method === "stripe" && !!ret.tx_stripe_pi;

      let stripeRefundId: string | null = null;

      if (isStripeOrder) {
        // ── Stripe card payment: real refund with idempotency key ─────────────
        // Duplicate calls (same session) return the same refund object — no double charge.
        try {
          const stripe = await getStripeClient();
          const stripeRefund = await stripe.refunds.create(
            {
              payment_intent: String(ret.tx_stripe_pi),
              amount: Math.round(refundAmount * 100),
              reason: "requested_by_customer",
              metadata: { returnId: String(returnId), orderId: String(ret.order_id) },
            },
            { idempotencyKey: `return-approve-${returnId}` },
          );
          stripeRefundId = stripeRefund.id;
          logger.info({ returnId, stripeRefundId, refundAmount }, "Stripe refund created");
        } catch (stripeErr: any) {
          const code: string = stripeErr?.code ?? stripeErr?.raw?.code ?? "";
          if (code === "charge_already_refunded") {
            // Card was already fully refunded in a previous session — treat as success.
            // Do NOT credit wallet. stripeRefundId stays null (no new refund created).
            logger.info({ returnId, code }, "Stripe: charge already refunded — treating as success");
          } else {
            // Surface to outer catch → rolls back lock, returns 502 to admin for retry.
            throw Object.assign(new Error(stripeErr?.message ?? "Stripe API error"), { isStripe: true, code });
          }
        }
      }

      const refundMethod = isStripeOrder ? "stripe_card" : "wallet";

      // ── Atomic idempotent seller debit ────────────────────────────────────
      // Single CTE: ledger INSERT is the guard. The balance UPDATE runs only
      // when the ledger row was newly inserted (EXISTS check on CTE output).
      // On retry the INSERT conflicts → RETURNING produces no rows → balance
      // UPDATE WHERE EXISTS(...) matches nothing → no double-debit, ever.
      // Conflict target includes "WHERE payment_ref IS NOT NULL" to match the
      // partial unique index wallet_transactions_payment_ref_unique_idx exactly.
      if (sellerId) {
        await db.execute(
          sql`WITH ins AS (
                INSERT INTO wallet_transactions (user_id, type, amount_usd, payment_ref, status, note)
                VALUES (${sellerId}, 'return_debit', ${-refundAmount},
                        ${"return-" + returnId}, 'completed',
                        ${"Ranbousman retou kòmand #" + ret.order_id})
                ON CONFLICT (payment_ref) WHERE payment_ref IS NOT NULL DO NOTHING
                RETURNING id
              )
              UPDATE promo_wallets
              SET balance_usd = GREATEST(balance_usd - ${refundAmount}, 0),
                  updated_at  = NOW()
              WHERE user_id = ${sellerId}
                AND EXISTS (SELECT 1 FROM ins)`,
        );
      }

      if (!isStripeOrder) {
        // ── Atomic idempotent buyer credit (non-Stripe orders only) ──────────
        // Same CTE pattern: ledger INSERT guards the wallet upsert.
        // The INSERT…SELECT…FROM ins means the wallet row is only created/
        // incremented when the ledger row was newly written this call.
        await db.execute(
          sql`WITH ins AS (
                INSERT INTO wallet_transactions (user_id, type, amount_usd, payment_ref, status, note)
                VALUES (${buyerId}, 'return_refund', ${refundAmount},
                        ${"return-refund-" + returnId}, 'completed',
                        ${"Ranbousman retou kòmand #" + ret.order_id})
                ON CONFLICT (payment_ref) WHERE payment_ref IS NOT NULL DO NOTHING
                RETURNING id
              )
              INSERT INTO promo_wallets (user_id, balance_usd)
              SELECT ${buyerId}, ${refundAmount} FROM ins
              ON CONFLICT (user_id) DO UPDATE
                SET balance_usd = promo_wallets.balance_usd + EXCLUDED.balance_usd,
                    updated_at  = NOW()`,
        );
      }

      // ── Finalize: mark order + return as refunded ──────────────────────────
      await db.update(transactionsTable)
        .set({ orderStatus: "return_refunded" })
        .where(eq(transactionsTable.id, Number(ret.order_id)));

      await db.execute(
        sql`UPDATE order_returns
            SET status           = 'refunded',
                admin_note       = ${noteVal},
                admin_decided_at = NOW(),
                refunded_at      = NOW(),
                refund_method    = ${refundMethod},
                stripe_refund_id = ${stripeRefundId ?? null}
            WHERE id = ${returnId}`,
      );

      const pushBody = refundMethod === "stripe_card"
        ? `Ranbousman $${refundAmount.toFixed(2)} ap vini sou kat ou nan 5 jou ouvrab. Kòmand #${ret.order_id}.`
        : `$${refundAmount.toFixed(2)} ajoute nan pòtfèy FM ou pou retou kòmand #${ret.order_id}.`;

      void sendPushToUser(buyerId, {
        title: refundMethod === "stripe_card" ? "Ranbousman kat akòde! 💳" : "Ranbousman akòde! ✅",
        body: pushBody,
        url: `/orders/${ret.order_id}`,
        tag: `return-${returnId}`,
      });
      void sendExpoPushToUser(buyerId, {
        title: refundMethod === "stripe_card" ? "Ranbousman kat akòde! 💳" : "Ranbousman akòde! ✅",
        body: pushBody,
        data: { url: `/orders/${ret.order_id}` }, sound: "default",
      });

      // Fire-and-forget refund email to buyer
      void (async () => {
        const [buyerUser] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, buyerId));
        if (buyerUser?.email) {
          const tpl = returnStatusBuyerEmail({ buyerName: buyerUser.name ?? "Achetè", orderId: Number(ret.order_id), listingTitle: `Kòmand #${ret.order_id}`, status: "refunded", refundAmount, refundMethod: refundMethod as "stripe_card" | "wallet" });
          await sendEmail({ to: buyerUser.email, ...tpl });
        }
      })();

      logger.info({ returnId, orderId: ret.order_id, refundAmount, buyerId, refundMethod, stripeRefundId }, "Return approved and refunded");
      res.json({ ok: true, status: "refunded", refundAmount, refundMethod, stripeRefundId });

    } else {
      // ── Reject ─────────────────────────────────────────────────────────────
      await db.execute(
        sql`UPDATE order_returns
            SET status = 'admin_rejected', admin_note = ${noteVal}, admin_decided_at = NOW()
            WHERE id = ${returnId}`,
      );

      void sendPushToUser(Number(ret.buyer_id), {
        title: "Demann retou refize",
        body: `Admin refize demann retou ou pou kòmand #${ret.order_id}.${noteVal ? ` ${noteVal}` : ""}`,
        url: `/orders/${ret.order_id}`,
        tag: `return-${returnId}`,
      });
      void sendExpoPushToUser(Number(ret.buyer_id), {
        title: "Demann retou refize ❌",
        body: `Admin refize demann retou ou pou kòmand #${ret.order_id}.`,
        data: { url: `/orders/${ret.order_id}` }, sound: "default",
      });

      // Fire-and-forget admin-reject email to buyer
      void (async () => {
        const [buyerUser] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, Number(ret.buyer_id)));
        if (buyerUser?.email) {
          const tpl = returnStatusBuyerEmail({ buyerName: buyerUser.name ?? "Achetè", orderId: Number(ret.order_id), listingTitle: `Kòmand #${ret.order_id}`, status: "admin_rejected", note: noteVal || undefined });
          await sendEmail({ to: buyerUser.email, ...tpl });
        }
      })();

      logger.info({ returnId, orderId: ret.order_id }, "Return rejected by admin");
      res.json({ ok: true, status: "admin_rejected" });
    }

  } catch (err: any) {
    // ── Best-effort rollback: restore prior status so admin can retry ─────────
    await db.execute(
      sql`UPDATE order_returns SET status = ${ret.status} WHERE id = ${returnId} AND status = 'processing'`,
    ).catch(rbErr => logger.error({ returnId, rbErr: rbErr?.message }, "Rollback also failed — manual intervention needed"));

    const isStripe = !!(err as any).isStripe;
    logger.error({ returnId, err: err?.message, isStripe }, "Return decision failed — lock rolled back to prior status");
    res.status(isStripe ? 502 : 500).json({
      error: isStripe
        ? `Ranbousman Stripe echwe: ${err.message}. Eseye ankò.`
        : "Erè sistèm — eseye ankò nan yon moman.",
    });
  }
});

// ─── GET /api/admin/returns — list all returns ───────────────────────────────

router.get("/admin/returns", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const statusFilter = req.query.status ? String(req.query.status) : "all";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const baseQuery = sql`
    SELECT r.*,
      u_buyer.name  AS buyer_name,  u_buyer.email  AS buyer_email,
      u_seller.name AS seller_name,
      t.amount      AS order_amount, t.payment_method,
      l.title       AS listing_title
    FROM order_returns r
    JOIN  transactions t  ON t.id  = r.order_id
    LEFT JOIN users u_buyer  ON u_buyer.id  = r.buyer_id
    LEFT JOIN users u_seller ON u_seller.id = r.seller_id
    LEFT JOIN listings l     ON l.id        = t.listing_id
  `;

  const orderPage = sql`ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  let rows: any[];
  let countRows: any[];

  if (statusFilter !== "all") {
    rows = await db.execute(sql`${baseQuery} WHERE r.status = ${statusFilter} ${orderPage}`) as any[];
    countRows = await db.execute(
      sql`SELECT COUNT(*)::int AS total FROM order_returns r WHERE r.status = ${statusFilter}`,
    ) as any[];
  } else {
    rows = await db.execute(sql`${baseQuery} ${orderPage}`) as any[];
    countRows = await db.execute(sql`SELECT COUNT(*)::int AS total FROM order_returns`) as any[];
  }

  res.json({ returns: rows, total: countRows[0]?.total ?? 0, page, limit });
});

export default router;
