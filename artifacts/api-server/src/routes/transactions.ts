import { Router } from "express";
import { db, transactionsTable, usersTable, listingsTable, notificationsTable, promoWalletTable, walletTransactionsTable, walletTransfersTable, sellerPayoutAccountsTable, marketplaceSellerPayoutsTable, deliveriesTable, driversTable } from "@workspace/db";
import { eq, desc, and, or, sql, notInArray, inArray } from "drizzle-orm";
import { requireAuth, requireSuperAdmin, requireFinanceAdmin } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/email";
import { escrowReleasedSellerEmail } from "../lib/emailTemplates";
import {
  getDefaultCommissionRate, setDefaultCommissionRate,
  getMoncashRate, setMoncashRate, getStripeRate, setStripeRate,
  getBuyerFeeRate, setBuyerFeeRate,
  quoteForListing,
  MIN_RATE, MAX_RATE,
  DEFAULT_RATE_MONCASH, DEFAULT_RATE_STRIPE, DEFAULT_BUYER_FEE_STRIPE,
} from "../lib/commission";
import { getDisplayRate, setExchangeRate, setSpread, getExchangeRate, getSpread, getDopRate, setDopRate, getAllRates, convertToUsd } from "../lib/exchange-rate";

const router = Router();

const CARRIERS = [
  "UPS", "FedEx", "DHL", "USPS", "Canada Post",
  "Royal Mail", "La Poste", "Australia Post", "Colissimo",
  "Amazon Logistics", "Other",
] as const;

// Haiti: 3-day auto-release; Non-Haiti: 7-day auto-release
const AUTO_RELEASE_DAYS_HAITI = 3;
const AUTO_RELEASE_DAYS_OTHER = 7;

// ─── Escrow release ────────────────────────────────────────────────────────────

export async function releaseEscrow(
  txId: number,
  triggeredBy: "buyer" | "auto" | "carrier",
): Promise<void> {
  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, txId));

  if (!tx || tx.escrowReleased || !tx.sellerUserId) return;

  const sellerEarnings = tx.sellerEarnings ?? tx.amount;

  // For Stripe Connect orders the funds were already transferred to the
  // seller's Stripe account at checkout time (via transfer_data.destination).
  // Do NOT double-credit the platform wallet in that case — only credit the
  // wallet when the platform held the funds (MonCash, NatCash, or Stripe
  // without active Connect).
  const [sellerRecord] = await db
    .select({ stripeAccountId: usersTable.stripeAccountId, stripeAccountStatus: usersTable.stripeAccountStatus })
    .from(usersTable)
    .where(eq(usersTable.id, tx.sellerUserId));

  const isStripeConnectRouted =
    tx.paymentMethod === "stripe" &&
    !!sellerRecord?.stripeAccountId &&
    sellerRecord.stripeAccountStatus === "active";

  // Atomic gate: mark escrow released first using WHERE escrowReleased=false.
  // If another concurrent call already flipped the flag, rowsAffected=0 → bail out
  // before any wallet credit, preventing double-payment.
  const marked = await db
    .update(transactionsTable)
    .set({
      escrowReleased: true,
      escrowReleasedAt: new Date(),
      orderStatus: "completed",
      deliveredAt: tx.deliveredAt ?? new Date(),
    })
    .where(and(
      eq(transactionsTable.id, txId),
      eq(transactionsTable.escrowReleased, false),
    ))
    .returning({ id: transactionsTable.id });

  if (marked.length === 0) {
    logger.warn({ txId, triggeredBy }, "releaseEscrow: already released (concurrent call) — skipping wallet credit");
    return;
  }

  if (!isStripeConnectRouted) {
    // Credit seller's promo wallet (platform holds the funds)
    const [existing] = await db
      .select()
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, tx.sellerUserId));

    if (existing) {
      await db
        .update(promoWalletTable)
        .set({
          balanceUsd: sql`${promoWalletTable.balanceUsd} + ${sellerEarnings}`,
          updatedAt: new Date(),
        })
        .where(eq(promoWalletTable.userId, tx.sellerUserId));
    } else {
      await db
        .insert(promoWalletTable)
        .values({ userId: tx.sellerUserId, balanceUsd: sellerEarnings });
    }

    // Audit log
    await db.insert(walletTransactionsTable).values({
      userId: tx.sellerUserId,
      type: "sale_earnings",
      amountUsd: sellerEarnings,
      paymentRef: `order-${txId}`,
      status: "completed",
      note: `Sale earnings — order #${txId} (released by: ${triggeredBy})`,
    });
  } else {
    // Stripe Connect: log only for audit trail — no wallet credit (funds already with seller)
    await db.insert(walletTransactionsTable).values({
      userId: tx.sellerUserId,
      type: "sale_earnings",
      amountUsd: sellerEarnings,
      paymentRef: `order-${txId}`,
      status: "completed",
      note: `Stripe Connect transfer — order #${txId} (released by: ${triggeredBy}) — wallet NOT credited (funds sent via Stripe Connect)`,
    });
  }

  // Notify seller
  await db.insert(notificationsTable).values({
    userId: tx.sellerUserId,
    actorId: tx.userId,
    type: "order_delivered",
    listingId: tx.listingId ?? undefined,
  }).catch(() => {});

  // Auto-create a MonCash payout record for mobile-money orders so the admin
  // can track outstanding seller payments and mark them paid after the manual
  // MonCash transfer. Duplicate guard: UNIQUE on transaction_id prevents double-
  // inserts if releaseEscrow somehow runs twice (e.g. race between auto + buyer).
  if (tx.paymentMethod === "moncash" || tx.paymentMethod === "natcash") {
    const [payoutAccount] = await db
      .select()
      .from(sellerPayoutAccountsTable)
      .where(eq(sellerPayoutAccountsTable.userId, tx.sellerUserId));

    await db
      .insert(marketplaceSellerPayoutsTable)
      .values({
        transactionId: txId,
        sellerId: tx.sellerUserId,
        grossAmount: tx.amount,
        commissionRate: tx.commissionRate ?? 0,
        commissionAmount: tx.commissionAmount ?? 0,
        netAmount: sellerEarnings,
        paymentMethod: tx.paymentMethod,
        payoutMoncashNumber: payoutAccount?.moncashVerified ? payoutAccount.moncashNumber : null,
        status: "pending",
      })
      .onConflictDoNothing();
  }

  void sendPushToUser(tx.sellerUserId, {
    title: "Lajan ou lage!",
    body: `$${sellerEarnings.toFixed(2)} ajoute nan pòtfèy ou pou kòmand #${txId}.`,
    url: `/orders/${txId}`,
    tag: `escrow-${txId}`,
  });

  // Fire-and-forget escrow release email to seller
  void (async () => {
    const [sellerUser] = await db
      .select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, tx.sellerUserId));
    if (sellerUser?.email) {
      const tpl = escrowReleasedSellerEmail({
        sellerName: sellerUser.name ?? "Vandè",
        orderId: txId,
        listingTitle: `Kòmand #${txId}`,
        amount: sellerEarnings,
      });
      await sendEmail({ to: sellerUser.email, ...tpl });
    }
  })();

  logger.info({ txId, sellerUserId: tx.sellerUserId, sellerEarnings, triggeredBy }, "Escrow released");
}

// ─── Background auto-release job ──────────────────────────────────────────────

async function runAutoRelease(): Promise<void> {
  try {
    // ── 1. Normal auto-release (timer expired on shipped/delivered orders) ──
    const overdueOrders = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "purchase"),
          eq(transactionsTable.paymentStatus, "completed"),
          eq(transactionsTable.escrowReleased, false),
          sql`${transactionsTable.autoReleaseAt} IS NOT NULL`,
          sql`${transactionsTable.autoReleaseAt} <= NOW()`,
          sql`${transactionsTable.orderStatus} IN ('shipped', 'delivered')`,
        ),
      );

    for (const order of overdueOrders) {
      await releaseEscrow(order.id, "auto").catch((err) =>
        logger.error({ err, orderId: order.id }, "Auto-release failed for order"),
      );
    }

    if (overdueOrders.length > 0) {
      logger.info({ count: overdueOrders.length }, "Auto-released overdue escrows");
    }

    // ── 2. Buyer-absent deadline expired → refund buyer, credit driver, restore listing ──
    const expiredAbsent = await db
      .select({
        id: deliveriesTable.id,
        transactionId: deliveriesTable.transactionId,
        driverUserId: deliveriesTable.driverUserId,
        buyerId: deliveriesTable.buyerId,
        sellerId: deliveriesTable.sellerId,
        listingId: deliveriesTable.listingId,
        feeUsd: deliveriesTable.feeUsd,
        driverEarnings: deliveriesTable.driverEarnings,
      })
      .from(deliveriesTable)
      .where(
        and(
          eq(deliveriesTable.status, "buyer_absent"),
          sql`${deliveriesTable.buyerRescheduleDeadline} IS NOT NULL`,
          sql`${deliveriesTable.buyerRescheduleDeadline} <= NOW()`,
        ),
      );

    for (const d of expiredAbsent) {
      try {
        const now = new Date();

        // a) Mark delivery as returned
        await db.update(deliveriesTable)
          .set({ status: "returned", updatedAt: now } as any)
          .where(eq(deliveriesTable.id, d.id));

        // b) Restore listing to available
        if (d.listingId) {
          await db.update(listingsTable)
            .set({ status: "available" } as any)
            .where(eq(listingsTable.id, d.listingId));
        }

        // c) Refund buyer (reverse the escrow — put product price back to buyer wallet)
        if (d.transactionId) {
          const [tx] = await db.select({
            amount: transactionsTable.amount,
            userId: transactionsTable.userId,
            escrowReleased: transactionsTable.escrowReleased,
          }).from(transactionsTable).where(eq(transactionsTable.id, d.transactionId)).limit(1);

          if (tx && !tx.escrowReleased) {
            // Buyer pays return delivery fee (same as feeUsd) from escrow — deducted from product price
            const feeUsd = d.feeUsd ?? 0;
            const refundAmt = Math.max(0, Math.round((tx.amount - feeUsd) * 100) / 100);
            const buyerId = tx.userId;
            // Mark escrow as released (so normal auto-release doesn't double-fire)
            await db.update(transactionsTable)
              .set({
                escrowReleased: true,
                escrowReleasedAt: now,
                orderStatus: "return_refunded",
              } as any)
              .where(eq(transactionsTable.id, d.transactionId));

            // Refund buyer wallet
            const [buyerWallet] = await db.select({ id: promoWalletTable.id })
              .from(promoWalletTable).where(eq(promoWalletTable.userId, buyerId)).limit(1);
            if (buyerWallet) {
              await db.update(promoWalletTable)
                .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${refundAmt}`, updatedAt: now })
                .where(eq(promoWalletTable.userId, buyerId));
            } else {
              await db.insert(promoWalletTable).values({ userId: buyerId, balanceUsd: refundAmt });
            }
            await db.insert(walletTransactionsTable).values({
              userId: buyerId,
              type: "refund",
              amountUsd: refundAmt,
              paymentRef: `buyer-absent-refund-${d.id}`,
              note: `Ranbousman — achtè pa t disponib — livrezon #FL-${d.id}`,
            }).catch(() => {});

            // Notify buyer
            await db.insert(notificationsTable).values({
              userId: buyerId,
              type: "delivery_returned",
              message: `📦 Ou pa t reskède. Kòmand retounen bay machann otomatikman. ${refundAmt > 0 ? `💰 Ranbousman $${refundAmt.toFixed(2)} ajoute nan wallet ou (frè retou $${feeUsd.toFixed(2)} dedwi).` : "Pa gen ranbousman — frè livrezon kouvri tout kòb la."}`,
            } as any).catch(() => {});
          }
        }

        // d) Credit driver 2× delivery fee (original trip + auto-return trip)
        if (d.driverUserId) {
          const driverFeePerTrip = d.driverEarnings ?? (d.feeUsd != null ? Math.round(d.feeUsd * 0.85 * 100) / 100 : 0);
          const driverFee = Math.round(driverFeePerTrip * 2 * 100) / 100;
          if (driverFee > 0) {
            const [dw] = await db.select({ id: promoWalletTable.id })
              .from(promoWalletTable).where(eq(promoWalletTable.userId, d.driverUserId)).limit(1);
            if (dw) {
              await db.update(promoWalletTable)
                .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${driverFee}`, updatedAt: now })
                .where(eq(promoWalletTable.userId, d.driverUserId));
            } else {
              await db.insert(promoWalletTable).values({ userId: d.driverUserId, balanceUsd: driverFee });
            }
            await db.insert(walletTransactionsTable).values({
              userId: d.driverUserId,
              type: "delivery_earnings",
              amountUsd: driverFee,
              paymentRef: `buyer-absent-driver-${d.id}`,
              note: `Frè 2× ale+retou (achtè absan, auto) — #FL-${d.id}`,
            }).catch(() => {});

            // Notify driver
            await db.insert(notificationsTable).values({
              userId: d.driverUserId,
              type: "delivery_returned",
              message: `✅ Delè reskèd ekspire (auto-retou). $${driverFee.toFixed(2)} krédite nan kont ou (2× frè: ale + retou).`,
            } as any).catch(() => {});
          }
        }

        // e) Notify seller
        if (d.sellerId) {
          await db.insert(notificationsTable).values({
            userId: d.sellerId,
            type: "delivery_returned",
            message: `📦 Achtè a pa t reskède. Kòmand retounen ba ou. Pwodwi ou disponib ankò.`,
          } as any).catch(() => {});
        }

        logger.info({ deliveryId: d.id, transactionId: d.transactionId }, "Buyer-absent delivery auto-resolved");
      } catch (err) {
        logger.error({ err, deliveryId: d.id }, "Buyer-absent auto-resolution failed");
      }
    }

    if (expiredAbsent.length > 0) {
      logger.info({ count: expiredAbsent.length }, "Auto-resolved buyer-absent deliveries");
    }
  } catch (err) {
    logger.error({ err }, "Auto-release job error");
  }
}

// Run on startup (after a short delay) and every 30 minutes
setTimeout(runAutoRelease, 60_000);
setInterval(runAutoRelease, 30 * 60 * 1000);

// ─── Commission quote ──────────────────────────────────────────────────────────

router.get("/commission/quote", requireAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.query.listingId ?? ""), 10);
  if (!listingId) { res.status(400).json({ error: "listingId required" }); return; }
  const method = req.query.method ? String(req.query.method) : undefined;
  const deliveryFeeRaw = req.query.deliveryFeeUsd ? parseFloat(String(req.query.deliveryFeeUsd)) : null;
  const deliveryFeeUsd = deliveryFeeRaw !== null && deliveryFeeRaw > 0 ? deliveryFeeRaw : null;
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  // Convert non-USD price to USD before computing commission breakdown
  const quoteCurrency = (listing as any).currency ?? "USD";
  let quotePrice = listing.price;
  if (quoteCurrency === "HTG") {
    const { displayRate } = await getDisplayRate();
    quotePrice = parseFloat((quotePrice / displayRate).toFixed(2));
  } else if (quoteCurrency === "DOP") {
    const dopRate = await getDopRate();
    quotePrice = parseFloat((quotePrice / dopRate).toFixed(2));
  }
  const q = await quoteForListing({ ...listing, price: quotePrice }, method, deliveryFeeUsd);
  res.json(q);
});

// ─── Sales summary ────────────────────────────────────────────────────────────

router.get("/sales/summary", requireAuth, async (req, res): Promise<void> => {
  const [agg] = await db.select({
    orderCount: sql<number>`count(*)::int`,
    totalSales:  sql<number>`coalesce(sum(${transactionsTable.amount}),0)::float`,
    totalCommission: sql<number>`coalesce(sum(${transactionsTable.commissionAmount}),0)::float`,
    netEarnings:  sql<number>`coalesce(sum(${transactionsTable.sellerEarnings}),0)::float`,
  })
    .from(transactionsTable)
    .innerJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .where(and(
      eq(listingsTable.sellerId, req.userId!),
      eq(transactionsTable.type, "purchase"),
      eq(transactionsTable.paymentStatus, "completed"),
      // Exclude cancelled and refunded orders — only count real completed sales
      notInArray(transactionsTable.orderStatus, ["cancelled", "return_refunded"]),
    ));

  res.json({
    orderCount: agg?.orderCount ?? 0,
    totalSales: agg?.totalSales ?? 0,
    totalCommission: agg?.totalCommission ?? 0,
    netEarnings: agg?.netEarnings ?? 0,
  });
});

router.get("/transactions/me", requireAuth, async (req, res): Promise<void> => {
  const txs = await db
    .select({
      id: transactionsTable.id,
      type: transactionsTable.type,
      amount: transactionsTable.amount,
      currency: transactionsTable.currency,
      paymentMethod: transactionsTable.paymentMethod,
      paymentStatus: transactionsTable.paymentStatus,
      paymentRef: transactionsTable.paymentRef,
      description: transactionsTable.description,
      createdAt: transactionsTable.createdAt,
      listingTitle: listingsTable.title,
    })
    .from(transactionsTable)
    .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .where(eq(transactionsTable.userId, req.userId!))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(100);
  res.json(txs);
});

// ─── Orders: carrier list ──────────────────────────────────────────────────────

router.get("/orders/carriers", (_req, res): void => {
  res.json({ carriers: CARRIERS });
});

// ─── Orders: list (buyer) ──────────────────────────────────────────────────────

router.get("/orders/purchases", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: transactionsTable.id,
      amount: transactionsTable.amount,
      currency: transactionsTable.currency,
      paymentMethod: transactionsTable.paymentMethod,
      orderStatus: transactionsTable.orderStatus,
      trackingNumber: transactionsTable.trackingNumber,
      carrier: transactionsTable.carrier,
      trackingStatus: transactionsTable.trackingStatus,
      escrowReleased: transactionsTable.escrowReleased,
      shippedAt: transactionsTable.shippedAt,
      deliveredAt: transactionsTable.deliveredAt,
      createdAt: transactionsTable.createdAt,
      listingCountry: transactionsTable.listingCountry,
      listingId: listingsTable.id,
      listingTitle: listingsTable.title,
      listingImages: listingsTable.images,
      sellerId: listingsTable.sellerId,
      sellerName: usersTable.name,
    })
    .from(transactionsTable)
    .innerJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .where(and(
      eq(transactionsTable.userId, req.userId!),
      eq(transactionsTable.type, "purchase"),
      eq(transactionsTable.paymentStatus, "completed"),
    ))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);
  res.json(rows);
});

// ─── Orders: list (seller) ────────────────────────────────────────────────────

router.get("/orders/sales", requireAuth, async (req, res): Promise<void> => {
  const buyerAlias = usersTable;
  const rows = await db
    .select({
      id: transactionsTable.id,
      amount: transactionsTable.amount,
      currency: transactionsTable.currency,
      paymentMethod: transactionsTable.paymentMethod,
      paymentStatus: transactionsTable.paymentStatus,
      orderStatus: transactionsTable.orderStatus,
      trackingNumber: transactionsTable.trackingNumber,
      carrier: transactionsTable.carrier,
      trackingStatus: transactionsTable.trackingStatus,
      escrowReleased: transactionsTable.escrowReleased,
      shippedAt: transactionsTable.shippedAt,
      deliveredAt: transactionsTable.deliveredAt,
      createdAt: transactionsTable.createdAt,
      commissionRate: transactionsTable.commissionRate,
      commissionAmount: transactionsTable.commissionAmount,
      sellerEarnings: transactionsTable.sellerEarnings,
      shippingName: transactionsTable.shippingName,
      shippingCity: transactionsTable.shippingCity,
      shippingRegion: transactionsTable.shippingRegion,
      shippingZip: transactionsTable.shippingZip,
      listingCountry: transactionsTable.listingCountry,
      listingId: listingsTable.id,
      listingTitle: listingsTable.title,
      listingImages: listingsTable.images,
      sellerId: listingsTable.sellerId,
      buyerName: buyerAlias.name,
    })
    .from(transactionsTable)
    .innerJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .leftJoin(buyerAlias, eq(transactionsTable.userId, buyerAlias.id))
    .where(and(
      eq(listingsTable.sellerId, req.userId!),
      eq(transactionsTable.type, "purchase"),
      eq(transactionsTable.paymentStatus, "completed"),
      // Exclude cancelled and refunded orders from the sales list
      notInArray(transactionsTable.orderStatus, ["cancelled", "return_refunded"]),
    ))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);
  res.json(rows);
});

// ─── Order detail ──────────────────────────────────────────────────────────────

async function loadOrderForUser(orderId: number, userId: number) {
  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, orderId));
  if (!tx || tx.type !== "purchase" || tx.paymentStatus !== "completed" || !tx.listingId) return null;
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, tx.listingId));
  if (!listing) return null;
  const isSeller = listing.sellerId === userId;
  const isBuyer = tx.userId === userId;
  if (!isSeller && !isBuyer) return null;
  return { tx, listing, isSeller, isBuyer };
}

// Helper: fetch FM delivery + driver info for a transaction
async function loadFmDelivery(orderId: number) {
  const [delivery] = await db
    .select({
      id: deliveriesTable.id,
      status: deliveriesTable.status,
      deliveryMethod: deliveriesTable.deliveryMethod,
      pickupCity: deliveriesTable.pickupCity,
      deliveryCity: deliveriesTable.deliveryCity,
      driverUserId: deliveriesTable.driverUserId,
      acceptedAt: deliveriesTable.acceptedAt,
      verificationCode: deliveriesTable.verificationCode,
    })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.transactionId as any, orderId))
    .orderBy(desc(deliveriesTable.createdAt))
    .limit(1);

  if (!delivery) return null;

  let driverInfo: {
    name: string | null; phone: string | null; avatar: string | null;
    rating: number | null; deliveryCount: number | null;
    vehicleType: string | null; vehicleBrand: string | null; vehicleModel: string | null;
    vehicleYear: string | null; vehicleColor: string | null; licensePlateNumber: string | null;
    photoFront: string | null;
  } | null = null;

  if (delivery.driverUserId) {
    const [drv] = await db
      .select({
        name: usersTable.name,
        phone: usersTable.phone,
        avatar: usersTable.avatar,
        rating: driversTable.rating,
        deliveryCount: driversTable.deliveryCount,
        vehicleType: driversTable.vehicleType,
        vehicleBrand: driversTable.vehicleBrand,
        vehicleModel: driversTable.vehicleModel,
        vehicleYear: driversTable.vehicleYear,
        vehicleColor: driversTable.vehicleColor,
        licensePlateNumber: driversTable.licensePlateNumber,
        photoFront: driversTable.photoFront,
      })
      .from(usersTable)
      .leftJoin(driversTable, eq(driversTable.userId, usersTable.id))
      .where(eq(usersTable.id, delivery.driverUserId))
      .limit(1);
    driverInfo = drv ?? null;
  }

  return { ...delivery, driverInfo };
}

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (!orderId || Number.isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const isAdminReq = !!(req.user?.isAdmin || req.user?.isSuperAdmin);

  // Admins can view any order; regular users only their own
  let tx: any, listing: any, isSeller: boolean, isBuyer: boolean;
  if (isAdminReq) {
    const [txRow] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, orderId));
    if (!txRow || txRow.type !== "purchase" || txRow.paymentStatus !== "completed" || !txRow.listingId) {
      res.status(404).json({ error: "Order not found" }); return;
    }
    const [listingRow] = await db.select().from(listingsTable).where(eq(listingsTable.id, txRow.listingId));
    if (!listingRow) { res.status(404).json({ error: "Order not found" }); return; }
    tx = txRow; listing = listingRow;
    isSeller = listing.sellerId === req.userId;
    isBuyer = tx.userId === req.userId;
  } else {
    const ctx = await loadOrderForUser(orderId, req.userId!);
    if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
    tx = ctx.tx; listing = ctx.listing; isSeller = ctx.isSeller; isBuyer = ctx.isBuyer;
  }

  const [merchant] = await db
    .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatar: usersTable.avatar })
    .from(usersTable).where(eq(usersTable.id, listing.sellerId));
  const [buyer] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, tx.userId));

  const listingCountry = tx.listingCountry ?? listing.country ?? null;
  // Manual delivery flow: Haiti and Dominican Republic both use driver-based delivery (no carrier tracking)
  const isHaiti = listingCountry === "Haiti" || listingCountry === "Dominican Republic";

  // FM delivery: fetch linked delivery + driver info if it's an FM driver order
  const fmDelivery = await loadFmDelivery(orderId);

  res.json({
    orderId: tx.id,
    orderRef: `BZH-${String(tx.id).padStart(6, "0")}`,
    createdAt: tx.createdAt,
    amount: tx.amount,
    currency: tx.currency,
    paymentMethod: tx.paymentMethod,
    orderStatus: tx.orderStatus,
    shippedAt: tx.shippedAt,
    deliveredAt: tx.deliveredAt,
    buyerConfirmedAt: tx.buyerConfirmedAt,
    commissionRate: tx.commissionRate,
    commissionAmount: tx.commissionAmount,
    sellerEarnings: tx.sellerEarnings,
    // Tracking (non-Haiti)
    trackingNumber: tx.trackingNumber,
    carrier: tx.carrier,
    trackingStatus: tx.trackingStatus,
    trackingLastUpdated: tx.trackingLastUpdated,
    // Haiti delivery info
    deliveryDescription: tx.deliveryDescription,
    driverName: tx.driverName,
    driverPhone: tx.driverPhone,
    deliveryNote: tx.deliveryNote,
    // FM delivery with driver info (verificationCode only for buyer)
    fmDelivery: fmDelivery ? {
      ...fmDelivery,
      verificationCode: isBuyer ? fmDelivery.verificationCode : undefined,
    } : null,
    // Escrow
    escrowReleased: tx.escrowReleased,
    escrowReleasedAt: tx.escrowReleasedAt,
    autoReleaseAt: tx.autoReleaseAt,
    // Delivery type & buyer-proposed fee
    deliveryType: tx.deliveryType ?? "delivery",
    buyerProposedDeliveryFee: tx.buyerProposedDeliveryFee ?? null,
    // Meta
    listingCountry,
    isHaiti,
    isSeller,
    isBuyer,
    isAdminView: isAdminReq,
    listingCity: listing.city ?? null,
    listing: { id: listing.id, title: listing.title, images: listing.images, country: listing.country },
    merchant: {
      id: merchant?.id ?? listing.sellerId,
      name: merchant?.name ?? "Merchant",
      phone: merchant?.phone ?? null,
      avatar: merchant?.avatar ?? null,
    },
    buyer: { id: buyer?.id ?? tx.userId, name: buyer?.name ?? null },
    shipTo: {
      name: tx.shippingName, phone: tx.shippingPhone, email: tx.shippingEmail,
      street: tx.shippingStreet, city: tx.shippingCity, region: tx.shippingRegion,
      zip: tx.shippingZip,
      country: listing.country,
    },
  });
});

// ─── Order label ───────────────────────────────────────────────────────────────

router.get("/orders/:id/label", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (!orderId || Number.isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const ctx = await loadOrderForUser(orderId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
  if (!ctx.isSeller) { res.status(403).json({ error: "Forbidden" }); return; }
  const { tx, listing } = ctx;

  const [merchant] = await db
    .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
    .from(usersTable).where(eq(usersTable.id, listing.sellerId));
  const [buyer] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, tx.userId));

  res.json({
    orderId: tx.id,
    orderRef: `BZH-${String(tx.id).padStart(6, "0")}`,
    createdAt: tx.createdAt,
    amount: tx.amount,
    currency: tx.currency,
    paymentMethod: tx.paymentMethod,
    listing: { id: listing.id, title: listing.title },
    merchant: {
      id: merchant?.id ?? listing.sellerId,
      name: merchant?.name ?? "Merchant",
      phone: merchant?.phone ?? null,
    },
    buyer: { id: buyer?.id ?? tx.userId, name: buyer?.name ?? null },
    shipTo: {
      name: tx.shippingName, phone: tx.shippingPhone, email: tx.shippingEmail,
      street: tx.shippingStreet, city: tx.shippingCity, region: tx.shippingRegion,
      zip: tx.shippingZip,
      country: listing.country,
    },
  });
});

// ─── POST /orders/:id/ship ─────────────────────────────────────────────────────
//
// Seller marks order as shipped.
//
// Non-Haiti (carrier flow):
//   Body: { trackingNumber, carrier }  — both required
//   Sets auto_release_at = now + 7 days
//
// Haiti (manual confirmation flow):
//   Body: { deliveryDescription, driverPhone, driverName?, deliveryNote? }
//   driverPhone is required; sets auto_release_at = now + 3 days

router.post("/orders/:id/ship", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (!orderId || Number.isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const ctx = await loadOrderForUser(orderId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
  if (!ctx.isSeller) { res.status(403).json({ error: "Only the seller can update this order" }); return; }

  const { tx, listing } = ctx;
  if (tx.orderStatus !== "ready_to_ship") {
    res.status(409).json({ error: "Order is not in ready_to_ship state" });
    return;
  }

  const listingCountry = tx.listingCountry ?? listing.country ?? null;
  // Manual delivery flow: Haiti and Dominican Republic both use driver-based delivery (no carrier tracking)
  const isHaiti = listingCountry === "Haiti" || listingCountry === "Dominican Republic";

  const body = req.body as Record<string, string | undefined>;
  const now = new Date();

  let updateData: Record<string, unknown> = {
    orderStatus: "shipped",
    shippedAt: now,
    listingCountry: listingCountry ?? null,
  };

  if (isHaiti) {
    // Haiti: delivery info required
    const { deliveryDescription, driverPhone, driverName, deliveryNote, useFmDriver, fmVehicleType, useBus, busDestCity, busTrackingLink } = body as any;
    if (!deliveryDescription?.trim()) {
      res.status(400).json({ error: "Delivery description is required" }); return;
    }

    if (useBus) {
      // ── Bus / External transport: code-based confirmation, same security as personal driver ──
      if (!driverPhone?.trim()) {
        res.status(400).json({ error: "Transporter phone number is required" }); return;
      }
      const busCode = Math.floor(100000 + Math.random() * 900000).toString();
      const deliveryAddr = [tx.shippingStreet, tx.shippingCity, tx.shippingRegion].filter(Boolean).join(", ") || "Adres pa disponib";
      const busFeeUsd = typeof tx.deliveryFeeUsd === "number" && tx.deliveryFeeUsd > 0 ? tx.deliveryFeeUsd : null;

      await db.insert(deliveriesTable).values({
        transactionId: orderId,
        listingId: listing.id,
        sellerId: listing.sellerId,
        buyerId: tx.userId,
        status: "on_the_way",
        verificationCode: busCode,
        deliveryMethod: "bus",
        pickupCity: listing.city ?? null,
        deliveryCity: tx.shippingCity ?? null,
        deliveryAddress: deliveryAddr,
        country: listingCountry ?? "Haiti",
        currency: "USD",
        sellerNote: deliveryDescription.trim(),
        feeUsd: busFeeUsd,
        driverPhone: driverPhone.trim(),
      } as any).catch(() => {});

      const cityLine = busDestCity?.trim() ? ` → ${busDestCity.trim()}` : "";
      const notifNote = busTrackingLink?.trim()
        ? ` Lyen suivi: ${busTrackingLink.trim()}`
        : "";
      await db.insert(notificationsTable).values({
        userId: tx.userId,
        type: "driver_assigned",
        isRead: false,
        message: `📦 Kòmand ou nan wout pa bis/transpò${cityLine}. Transpòtè: ${driverName?.trim() || "—"} (${driverPhone.trim()}).${notifNote} Kòd sekrè ou: ${busCode}. Bay machann nan kòd la PA MESAJ sèlman lè ou resevwa atik la — sa ap libere lajan li imedyatman.`,
      } as any).catch(() => {});

      const noteToStore = [deliveryNote?.trim(), busTrackingLink?.trim()].filter(Boolean).join(" | ") || null;
      updateData = {
        ...updateData,
        deliveryDescription: deliveryDescription.trim(),
        driverPhone: driverPhone.trim(),
        driverName: driverName?.trim() ?? null,
        deliveryNote: noteToStore,
        autoReleaseAt: new Date(now.getTime() + AUTO_RELEASE_DAYS_HAITI * 86400000),
      };
    } else if (useFmDriver) {
      // ── FM Driver Pool: broadcast to available FM drivers ──────────────────
      const vehicleMethod = fmVehicleType === "car" ? "car" : "motorcycle";
      const sellerUser = await db.select({ location: usersTable.location }).from(usersTable).where(eq(usersTable.id, listing.sellerId)).then(r => r[0]).catch(() => null);
      const pickupCity = sellerUser?.location ?? listing.city ?? null;
      const deliveryCity = tx.shippingCity ?? null;
      const deliveryAddr = [tx.shippingStreet, tx.shippingCity, tx.shippingRegion].filter(Boolean).join(", ") || null;

      const fmFeeUsd = typeof tx.deliveryFeeUsd === "number" && tx.deliveryFeeUsd > 0 ? tx.deliveryFeeUsd : null;
      const fmDriverEarnings = fmFeeUsd != null ? Math.round(fmFeeUsd * 0.85 * 100) / 100 : null;
      await db.insert(deliveriesTable).values({
        transactionId: orderId,
        listingId: listing.id,
        sellerId: listing.sellerId,
        buyerId: tx.userId,
        deliveryMethod: vehicleMethod,
        pickupCity: pickupCity,
        pickupAddress: null,
        deliveryCity: deliveryCity,
        deliveryAddress: deliveryAddr ?? deliveryCity ?? "Adres pa disponib",
        country: listingCountry ?? "Haiti",
        status: "waiting",
        sellerNote: deliveryDescription.trim(),
        currency: "USD",
        feeUsd: fmFeeUsd,
        driverEarnings: fmDriverEarnings,
      } as any).catch(() => {});

      updateData = {
        ...updateData,
        deliveryDescription: deliveryDescription.trim(),
        driverPhone: null,
        driverName: "fm_driver",
        deliveryNote: deliveryNote?.trim() ?? null,
        autoReleaseAt: new Date(now.getTime() + AUTO_RELEASE_DAYS_HAITI * 86400000),
      };
    } else {
      // ── Personal driver: seller provides driver contact ────────────────────
      if (!driverPhone?.trim()) {
        res.status(400).json({ error: "Driver phone number is required" }); return;
      }

      // Generate a verification code and create a delivery record so the buyer can see their code
      const personalCode = Math.floor(100000 + Math.random() * 900000).toString();
      const deliveryAddr = [tx.shippingStreet, tx.shippingCity, tx.shippingRegion].filter(Boolean).join(", ") || "Adres pa disponib";
      const personalFeeUsd = typeof tx.deliveryFeeUsd === "number" && tx.deliveryFeeUsd > 0 ? tx.deliveryFeeUsd : null;
      const personalDriverEarnings = personalFeeUsd != null ? Math.round(personalFeeUsd * 0.85 * 100) / 100 : null;
      await db.insert(deliveriesTable).values({
        transactionId: orderId,
        listingId: listing.id,
        sellerId: listing.sellerId,
        buyerId: tx.userId,
        status: "on_the_way",
        verificationCode: personalCode,
        pickupCity: listing.city ?? null,
        deliveryCity: tx.shippingCity ?? null,
        deliveryAddress: deliveryAddr,
        country: listingCountry ?? "Haiti",
        currency: "USD",
        sellerNote: deliveryDescription.trim(),
        feeUsd: personalFeeUsd,
        driverEarnings: personalDriverEarnings,
      } as any).catch(() => {});

      // Notify buyer with the secret code
      await db.insert(notificationsTable).values({
        userId: tx.userId,
        type: "driver_assigned",
        isRead: false,
        message: `Chofè ou a ap vini. Kòd sekrè ou: ${personalCode}. Ba li chofè a SÈLMAN lè li rive ba ou kòmand lan. Pa pataje li ak pèsonn.`,
      } as any).catch(() => {});

      updateData = {
        ...updateData,
        deliveryDescription: deliveryDescription.trim(),
        driverPhone: driverPhone.trim(),
        driverName: driverName?.trim() ?? null,
        deliveryNote: deliveryNote?.trim() ?? null,
        autoReleaseAt: new Date(now.getTime() + AUTO_RELEASE_DAYS_HAITI * 86400000),
      };
    }
  } else {
    // Non-Haiti: tracking number + carrier required
    const { trackingNumber, carrier } = body;
    if (!trackingNumber?.trim()) {
      res.status(400).json({ error: "Tracking number is required" }); return;
    }
    if (!carrier?.trim()) {
      res.status(400).json({ error: "Carrier is required" }); return;
    }
    updateData = {
      ...updateData,
      trackingNumber: trackingNumber.trim(),
      carrier: carrier.trim(),
      trackingStatus: "in_transit",
      trackingLastUpdated: now,
      autoReleaseAt: new Date(now.getTime() + AUTO_RELEASE_DAYS_OTHER * 86400000),
    };
  }

  await db
    .update(transactionsTable)
    .set(updateData as any)
    .where(eq(transactionsTable.id, orderId));

  // Notify buyer
  await db.insert(notificationsTable).values({
    userId: tx.userId,
    actorId: listing.sellerId,
    type: "order_shipped",
    listingId: listing.id,
  }).catch(() => {});

  void sendPushToUser(tx.userId, {
    title: "Kòmand ou voye!",
    body: isHaiti
      ? `"${listing.title}" ap vini jwenn ou. Chèk detay livrezon an.`
      : `"${listing.title}" voye avèk ${body.carrier}. Nimewo: ${body.trackingNumber}`,
    url: `/orders/${orderId}`,
    tag: `order-${orderId}`,
  });

  res.json({ ok: true, orderStatus: "shipped" });
});

// ─── POST /orders/:id/seller-confirm-bus-code ──────────────────────────────────
//
// Seller enters the 6-digit code the buyer sent via message → immediate escrow release.
// Mirrors the FM-driver verify-code flow but actor is the seller, not a driver.

router.post("/orders/:id/seller-confirm-bus-code", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (!orderId || Number.isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const ctx = await loadOrderForUser(orderId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
  if (!ctx.isSeller) { res.status(403).json({ error: "Only the seller can confirm bus delivery" }); return; }

  const { code } = req.body;
  if (!String(code ?? "").trim()) { res.status(400).json({ error: "Code is required" }); return; }

  const { tx, listing } = ctx;

  const [delivery] = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.transactionId as any, orderId))
    .orderBy(desc(deliveriesTable.createdAt))
    .limit(1);

  if (!delivery) { res.status(404).json({ error: "Delivery record not found" }); return; }
  if (delivery.deliveryMethod !== "bus") { res.status(400).json({ error: "Not a bus delivery" }); return; }

  if (delivery.status === "delivered" || delivery.codeVerifiedAt !== null || tx.escrowReleased) {
    res.status(409).json({ error: "Delivery already confirmed", alreadyProcessed: true }); return;
  }

  if (String(delivery.verificationCode) !== String(code).trim()) {
    res.status(400).json({ error: "Kòd la pa kòrèk — verifye kòd achtè a te voye ba ou a" }); return;
  }

  const now = new Date();

  await db
    .update(deliveriesTable)
    .set({
      codeVerifiedAt: now,
      status: "delivered",
      deliveredAt: now,
      paymentHeldUntil: now,
      sellerPaymentReleased: true,
      sellerPaymentReleasedAt: now,
      updatedAt: now,
    })
    .where(eq(deliveriesTable.id, delivery.id));

  await releaseEscrow(orderId, "buyer").catch((err: unknown) => {
    req.log.error({ err, deliveryId: delivery.id, orderId }, "Bus escrow release failed");
  });

  await db.insert(notificationsTable).values({
    userId: tx.userId,
    type: "delivery_confirmed",
    isRead: false,
    message: `✅ Machann nan konfime li te resevwa kòmand ou a pou "${listing.title}". Livrezon konplè!`,
  } as any).catch(() => {});

  res.json({ ok: true });
});

// ─── POST /orders/:id/confirm-delivery ─────────────────────────────────────────
//
// Buyer confirms receipt → releases escrow immediately.

router.post("/orders/:id/confirm-delivery", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (!orderId || Number.isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const ctx = await loadOrderForUser(orderId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
  if (!ctx.isBuyer) { res.status(403).json({ error: "Only the buyer can confirm delivery" }); return; }

  const { tx, listing } = ctx;

  if (tx.escrowReleased) {
    res.status(409).json({ error: "Funds already released" });
    return;
  }

  const listingCountry = tx.listingCountry ?? listing.country ?? null;
  const isManualDelivery = listingCountry === "Haiti" || listingCountry === "Dominican Republic";

  // For manual-delivery countries (Haiti/DR): buyer can confirm from any active status.
  // For carrier-tracking countries: order must be shipped first.
  const allowedStatuses = isManualDelivery
    ? ["pending", "ready_to_ship", "shipped", "delivered"]
    : ["shipped", "delivered"];

  if (!allowedStatuses.includes(tx.orderStatus)) {
    res.status(409).json({ error: "Order cannot be confirmed at this stage" });
    return;
  }

  // Mark buyer confirmed + complete
  await db
    .update(transactionsTable)
    .set({
      buyerConfirmedAt: new Date(),
      deliveredAt: tx.deliveredAt ?? new Date(),
      shippedAt: tx.shippedAt ?? new Date(),
      orderStatus: "delivered",
    })
    .where(eq(transactionsTable.id, orderId));

  // Release escrow immediately
  await releaseEscrow(orderId, "buyer");

  res.json({ ok: true, orderStatus: "completed" });
});

// ─── POST /orders/:id/pickup-update ────────────────────────────────────────────
//
// Buyer updates pickup status for store-pickup orders.
//   en_route  → buyer left home, on the way to the seller
//   arrived   → buyer arrived at seller's location
//   collected → buyer picked up the item; escrow released to seller immediately

router.post("/orders/:id/pickup-update", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (!orderId || Number.isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const VALID = ["en_route", "arrived", "collected"] as const;
  type PickupStatus = typeof VALID[number];
  const status = String(req.body?.status ?? "") as PickupStatus;
  if (!VALID.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID.join(", ")}` });
    return;
  }

  const ctx = await loadOrderForUser(orderId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
  if (!ctx.isBuyer) { res.status(403).json({ error: "Only the buyer can update pickup status" }); return; }

  const { tx } = ctx;

  if (tx.escrowReleased) {
    res.status(409).json({ error: "Order already completed" });
    return;
  }

  // Validate allowed state transitions
  const allowedFrom: Record<PickupStatus, string[]> = {
    en_route:  ["ready_to_ship", "pending"],
    arrived:   ["en_route"],
    collected: ["arrived"],
  };

  if (!allowedFrom[status].includes(tx.orderStatus)) {
    res.status(409).json({ error: `Cannot transition to '${status}' from '${tx.orderStatus}'` });
    return;
  }

  if (status === "collected") {
    // Buyer collected the item — release escrow immediately
    await db.update(transactionsTable).set({
      orderStatus: "delivered",
      deliveredAt: new Date(),
      buyerConfirmedAt: new Date(),
      shippedAt: tx.shippedAt ?? new Date(),
    }).where(eq(transactionsTable.id, orderId));

    await releaseEscrow(orderId, "buyer");

    res.json({ ok: true, orderStatus: "completed" });
  } else {
    await db.update(transactionsTable).set({
      orderStatus: status,
    }).where(eq(transactionsTable.id, orderId));

    // Notify seller of buyer's pickup progress
    await db.insert(notificationsTable).values({
      userId: tx.sellerUserId!,
      actorId: tx.userId,
      type: "order_delivered",
      listingId: tx.listingId ?? undefined,
    }).catch(() => {});

    res.json({ ok: true, orderStatus: status });
  }
});

// ─── POST /orders/:id/simulate-tracking  ──────────────────────────────────────
//
// DEV / TEST endpoint: manually advance tracking status.
// Accepted statuses: in_transit | out_for_delivery | delivered
// When status = "delivered", escrow is auto-released.

router.post("/orders/:id/simulate-tracking", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (!orderId || Number.isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const VALID = ["in_transit", "out_for_delivery", "delivered"] as const;
  type ValidStatus = typeof VALID[number];
  const status = String(req.body?.status ?? "") as ValidStatus;
  if (!VALID.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID.join(", ")}` });
    return;
  }

  const ctx = await loadOrderForUser(orderId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }

  const { tx } = ctx;
  if (tx.orderStatus !== "shipped" && tx.orderStatus !== "delivered") {
    res.status(409).json({ error: "Order must be in shipped state to simulate tracking" });
    return;
  }

  const now = new Date();
  await db.update(transactionsTable).set({
    trackingStatus: status,
    trackingLastUpdated: now,
    ...(status === "delivered" ? { deliveredAt: now, orderStatus: "delivered" } : {}),
  }).where(eq(transactionsTable.id, orderId));

  if (status === "delivered" && !tx.escrowReleased) {
    await releaseEscrow(orderId, "carrier");
  }

  res.json({ ok: true, trackingStatus: status, orderStatus: status === "delivered" ? "completed" : tx.orderStatus });
});

// ─── Legacy: seller marks delivered (admin/override only) ─────────────────────

router.post("/orders/:id/deliver", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (!orderId || Number.isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const ctx = await loadOrderForUser(orderId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
  if (!ctx.isSeller) { res.status(403).json({ error: "Only the seller can update this order" }); return; }

  const { tx } = ctx;
  if (!["shipped", "ready_to_ship"].includes(tx.orderStatus)) {
    res.status(409).json({ error: "Order cannot be marked delivered from its current state" });
    return;
  }

  await db.update(transactionsTable).set({
    orderStatus: "delivered",
    deliveredAt: new Date(),
  }).where(eq(transactionsTable.id, orderId));

  await db.insert(notificationsTable).values({
    userId: tx.userId,
    actorId: ctx.listing.sellerId,
    type: "order_delivered",
    listingId: ctx.listing.id,
  }).catch(() => {});

  void sendPushToUser(tx.userId, {
    title: "Kòmand ou rive!",
    body: `"${ctx.listing.title}" make kòm rive.`,
    url: `/orders/${orderId}`,
    tag: `order-${orderId}`,
  });

  res.json({ ok: true, orderStatus: "delivered" });
});

// ─── Commission admin endpoints ────────────────────────────────────────────────

router.get("/admin/commission/settings", requireSuperAdmin, async (req, res): Promise<void> => {
  const rate = await getDefaultCommissionRate();
  res.json({ rate, minRate: MIN_RATE, maxRate: MAX_RATE });
});

router.put("/admin/commission/settings", requireSuperAdmin, async (req, res): Promise<void> => {
  const rate = parseFloat(String(req.body?.rate ?? ""));
  if (!Number.isFinite(rate)) { res.status(400).json({ error: "Invalid rate" }); return; }
  if (rate < MIN_RATE || rate > MAX_RATE) {
    res.status(400).json({ error: `Rate must be between ${(MIN_RATE * 100).toFixed(0)}% and ${(MAX_RATE * 100).toFixed(0)}%` });
    return;
  }
  await setDefaultCommissionRate(rate);
  res.json({ rate });
});

router.get("/admin/commission/method-rates", requireSuperAdmin, async (req, res): Promise<void> => {
  const [moncashRate, stripeRate] = await Promise.all([getMoncashRate(), getStripeRate()]);
  res.json({ moncash: moncashRate, stripe: stripeRate, minRate: MIN_RATE, maxRate: MAX_RATE, defaults: { moncash: DEFAULT_RATE_MONCASH, stripe: DEFAULT_RATE_STRIPE } });
});

router.put("/admin/commission/method-rates", requireSuperAdmin, async (req, res): Promise<void> => {

  const moncashRaw = req.body?.moncash;
  const stripeRaw = req.body?.stripe;
  const updates: Array<{ name: string; value: number; setter: (r: number) => Promise<void> }> = [];

  for (const [name, raw, setter] of [
    ["moncash", moncashRaw, setMoncashRate] as const,
    ["stripe", stripeRaw, setStripeRate] as const,
  ]) {
    if (raw === undefined || raw === null) continue;
    const n = parseFloat(String(raw));
    if (!Number.isFinite(n)) { res.status(400).json({ error: `Invalid ${name} rate` }); return; }
    if (n < MIN_RATE || n > MAX_RATE) {
      res.status(400).json({ error: `${name} rate must be between ${(MIN_RATE * 100).toFixed(0)}% and ${(MAX_RATE * 100).toFixed(0)}%` });
      return;
    }
    updates.push({ name, value: n, setter });
  }

  if (updates.length === 0) { res.status(400).json({ error: "Provide at least one of moncash, stripe" }); return; }
  for (const u of updates) await u.setter(u.value);
  const [moncashRate, stripeRate] = await Promise.all([getMoncashRate(), getStripeRate()]);
  res.json({ moncash: moncashRate, stripe: stripeRate });
});

router.get("/admin/commission/summary", requireSuperAdmin, async (req, res): Promise<void> => {

  const [totals] = await db.select({
    orderCount: sql<number>`count(*)::int`,
    gmv: sql<number>`coalesce(sum(${transactionsTable.amount}),0)::float`,
    platformEarnings: sql<number>`coalesce(sum(${transactionsTable.commissionAmount}),0)::float`,
    sellerEarnings: sql<number>`coalesce(sum(${transactionsTable.sellerEarnings}),0)::float`,
  })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.type, "purchase"), eq(transactionsTable.paymentStatus, "completed")));

  const perSeller = await db.select({
    sellerId: listingsTable.sellerId,
    sellerName: usersTable.name,
    orderCount: sql<number>`count(*)::int`,
    gmv: sql<number>`coalesce(sum(${transactionsTable.amount}),0)::float`,
    platformEarnings: sql<number>`coalesce(sum(${transactionsTable.commissionAmount}),0)::float`,
    sellerEarnings: sql<number>`coalesce(sum(${transactionsTable.sellerEarnings}),0)::float`,
  })
    .from(transactionsTable)
    .innerJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .where(and(eq(transactionsTable.type, "purchase"), eq(transactionsTable.paymentStatus, "completed")))
    .groupBy(listingsTable.sellerId, usersTable.name)
    .orderBy(sql`coalesce(sum(${transactionsTable.amount}),0) desc`)
    .limit(50);

  res.json({ totals, perSeller });
});

// ─── Public: exchange rate ──────────────────────────────────────────────────

router.get("/exchange-rate", async (_req, res): Promise<void> => {
  const all = await getAllRates();
  res.json({
    rate:        all.htg.rate,
    spread:      all.htg.spread,
    displayRate: all.htg.displayRate,
    dopRate:     all.dop.rate,
    htg:         all.htg,
    dop:         all.dop,
  });
});

// ─── Admin: exchange rate ───────────────────────────────────────────────────

router.put("/admin/exchange-rate", requireSuperAdmin, async (req, res): Promise<void> => {
  const rateRaw   = req.body?.rate;
  const spreadRaw = req.body?.spread;
  const dopRaw    = req.body?.dopRate;
  if (rateRaw !== undefined && rateRaw !== null) {
    const r = parseFloat(String(rateRaw));
    if (!Number.isFinite(r) || r <= 0) { res.status(400).json({ error: "Invalid HTG rate" }); return; }
    await setExchangeRate(r);
  }
  if (spreadRaw !== undefined && spreadRaw !== null) {
    const s = parseFloat(String(spreadRaw));
    if (!Number.isFinite(s) || s < 0) { res.status(400).json({ error: "Invalid spread" }); return; }
    await setSpread(s);
  }
  if (dopRaw !== undefined && dopRaw !== null) {
    const d = parseFloat(String(dopRaw));
    if (!Number.isFinite(d) || d <= 0) { res.status(400).json({ error: "Invalid DOP rate" }); return; }
    await setDopRate(d);
  }
  const all = await getAllRates();
  res.json({
    rate:        all.htg.rate,
    spread:      all.htg.spread,
    displayRate: all.htg.displayRate,
    dopRate:     all.dop.rate,
    htg:         all.htg,
    dop:         all.dop,
  });
});

router.get("/admin/exchange-rate", requireSuperAdmin, async (_req, res): Promise<void> => {
  const all = await getAllRates();
  res.json({
    rate:        all.htg.rate,
    spread:      all.htg.spread,
    displayRate: all.htg.displayRate,
    dopRate:     all.dop.rate,
    htg:         all.htg,
    dop:         all.dop,
  });
});

// ─── Admin: buyer fee rate ──────────────────────────────────────────────────

router.get("/admin/commission/buyer-fee", requireSuperAdmin, async (_req, res): Promise<void> => {
  const rate = await getBuyerFeeRate();
  res.json({ buyerFeeRate: rate, buyerFeePercent: rate * 100, default: DEFAULT_BUYER_FEE_STRIPE });
});

router.put("/admin/commission/buyer-fee", requireSuperAdmin, async (req, res): Promise<void> => {
  const raw = req.body?.rate;
  if (raw === undefined || raw === null) { res.status(400).json({ error: "rate required" }); return; }
  const rate = parseFloat(String(raw));
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.15) {
    res.status(400).json({ error: "Buyer fee rate must be between 0% and 15%" });
    return;
  }
  await setBuyerFeeRate(rate);
  res.json({ buyerFeeRate: rate, buyerFeePercent: rate * 100 });
});

// ─── Admin: platform revenue analytics ────────────────────────────────────────

router.get("/admin/platform-revenue", requireSuperAdmin, async (req, res): Promise<void> => {
  const period = String(req.query.period ?? "all");
  let since: Date | null = null;
  const now = new Date();
  if (period === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    since = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const walletSince = since
    ? sql`${walletTransactionsTable.createdAt} >= ${since}`
    : sql`1=1`;
  const txSince = since
    ? sql`${transactionsTable.createdAt} >= ${since}`
    : sql`1=1`;

  const delivSince = since ? sql`AND created_at >= ${since}` : sql`AND 1=1`;

  const [
    rechargeFeesRow,
    merchantRow,
    boostRow,
    subscriptionRow,
    transferFeeRow,
    walletFeeRow,
    p2pTransferFeeRow,
    deliveryPlatformRow,
  ] = await Promise.all([
    // Recharge fee revenue (type='recharge_fee')
    db.select({
      total: sql<number>`coalesce(sum(abs(${walletTransactionsTable.amountUsd})),0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(walletTransactionsTable)
      .where(and(eq(walletTransactionsTable.type, "recharge_fee"), eq(walletTransactionsTable.status, "completed"), walletSince))
      .then(r => r[0]),

    // Merchant commission revenue
    db.select({
      total: sql<number>`coalesce(sum(${transactionsTable.commissionAmount}),0)::float`,
      gmv:   sql<number>`coalesce(sum(${transactionsTable.amount}),0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(transactionsTable)
      .where(and(eq(transactionsTable.type, "purchase"), eq(transactionsTable.paymentStatus, "completed"), txSince))
      .then(r => r[0]),

    // Boost revenue — 100% of every boost payment goes to platform
    db.select({
      total: sql<number>`coalesce(sum(abs(${walletTransactionsTable.amountUsd})),0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(walletTransactionsTable)
      .where(and(
        sql`${walletTransactionsTable.type} IN ('boost_debit','promo_boost_debit')`,
        eq(walletTransactionsTable.status, "completed"),
        walletSince,
      ))
      .then(r => r[0]),

    // Vendor subscription revenue (wallet-pay, manual renewal, auto-renewal, Stripe webhook)
    db.select({
      total: sql<number>`coalesce(sum(abs(${walletTransactionsTable.amountUsd})),0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(walletTransactionsTable)
      .where(and(
        sql`${walletTransactionsTable.type} IN ('vendor_subscription','promo_subscription_debit')`,
        eq(walletTransactionsTable.status, "completed"),
        walletSince,
      ))
      .then(r => r[0]),

    // P2P transfer daily access fees ($3/day per sender)
    db.execute(
      since
        ? sql`SELECT coalesce(sum(fee_usd),0)::float AS total, count(*)::int AS count FROM transfer_daily_fees WHERE paid = true AND paid_at >= ${since}`
        : sql`SELECT coalesce(sum(fee_usd),0)::float AS total, count(*)::int AS count FROM transfer_daily_fees WHERE paid = true`,
    ).then(r => ({ total: Number((r.rows[0] as any)?.total ?? 0), count: Number((r.rows[0] as any)?.count ?? 0) })),

    // Other wallet fees (wallet_fee type)
    db.select({
      total: sql<number>`coalesce(sum(abs(${walletTransactionsTable.amountUsd})),0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(walletTransactionsTable)
      .where(and(eq(walletTransactionsTable.type, "wallet_fee"), eq(walletTransactionsTable.status, "completed"), walletSince))
      .then(r => r[0]),

    // P2P transfer fees: 5% of each completed transfer
    db.select({
      total: sql<number>`coalesce(sum(${walletTransfersTable.feeUsd}),0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(walletTransfersTable)
      .where(and(
        eq(walletTransfersTable.status, "completed"),
        since ? sql`${walletTransfersTable.createdAt} >= ${since}` : sql`1=1`,
      ))
      .then(r => r[0]),

    // Delivery platform commission: 15% of each completed delivery fee (PHASE 1 fix — was 20%)
    db.execute(
      since
        ? sql`SELECT coalesce(sum(fee_usd * 0.15),0)::float AS total, count(*)::int AS count FROM deliveries WHERE status = 'completed' AND fee_usd IS NOT NULL AND created_at >= ${since}`
        : sql`SELECT coalesce(sum(fee_usd * 0.15),0)::float AS total, count(*)::int AS count FROM deliveries WHERE status = 'completed' AND fee_usd IS NOT NULL`,
    ).then(r => ({ total: Number((r.rows[0] as any)?.total ?? 0), count: Number((r.rows[0] as any)?.count ?? 0) })),
  ]);

  // Daily breakdown for last 30 days (purchases + boost revenue combined)
  const [dailyOrders, dailyBoosts] = await Promise.all([
    db.select({
      date:               sql<string>`date_trunc('day', ${transactionsTable.createdAt})::date::text`,
      merchantCommission: sql<number>`coalesce(sum(${transactionsTable.commissionAmount}),0)::float`,
      gmv:                sql<number>`coalesce(sum(${transactionsTable.amount}),0)::float`,
      orderCount:         sql<number>`count(*)::int`,
    }).from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, "purchase"),
        eq(transactionsTable.paymentStatus, "completed"),
        sql`${transactionsTable.createdAt} >= NOW() - INTERVAL '30 days'`,
      ))
      .groupBy(sql`date_trunc('day', ${transactionsTable.createdAt})`)
      .orderBy(sql`date_trunc('day', ${transactionsTable.createdAt}) desc`)
      .limit(30),

    db.select({
      date:        sql<string>`date_trunc('day', ${walletTransactionsTable.createdAt})::date::text`,
      boostRevenue: sql<number>`coalesce(sum(abs(${walletTransactionsTable.amountUsd})),0)::float`,
      boostCount:   sql<number>`count(*)::int`,
    }).from(walletTransactionsTable)
      .where(and(
        sql`${walletTransactionsTable.type} IN ('boost_debit','promo_boost_debit')`,
        eq(walletTransactionsTable.status, "completed"),
        sql`${walletTransactionsTable.createdAt} >= NOW() - INTERVAL '30 days'`,
      ))
      .groupBy(sql`date_trunc('day', ${walletTransactionsTable.createdAt})`)
      .orderBy(sql`date_trunc('day', ${walletTransactionsTable.createdAt}) desc`)
      .limit(30),
  ]);

  // Merge daily order + boost rows by date
  const boostByDate = new Map(dailyBoosts.map(r => [r.date, r]));
  const allDates = new Set([...dailyOrders.map(r => r.date), ...dailyBoosts.map(r => r.date)]);
  const daily = Array.from(allDates).sort((a, b) => b.localeCompare(a)).slice(0, 30).map(date => {
    const o = dailyOrders.find(r => r.date === date);
    const b = boostByDate.get(date);
    return {
      date,
      merchantCommission: o?.merchantCommission ?? 0,
      boostRevenue:       b?.boostRevenue ?? 0,
      boostCount:         b?.boostCount ?? 0,
      gmv:                o?.gmv ?? 0,
      orderCount:         o?.orderCount ?? 0,
    };
  });

  const rechargeFees        = rechargeFeesRow?.total    ?? 0;
  const merchantCommission  = merchantRow?.total        ?? 0;
  const boostRevenue        = boostRow?.total           ?? 0;
  const subscriptionRevenue = subscriptionRow?.total    ?? 0;
  const transferFees        = transferFeeRow?.total     ?? 0;
  const walletFees          = walletFeeRow?.total       ?? 0;
  const p2pTransferFees     = p2pTransferFeeRow?.total  ?? 0;
  const deliveryFees        = deliveryPlatformRow?.total ?? 0;

  const totalRevenue = rechargeFees + merchantCommission + boostRevenue + subscriptionRevenue + transferFees + walletFees + p2pTransferFees + deliveryFees;

  res.json({
    period,
    summary: {
      totalRevenue:          parseFloat(totalRevenue.toFixed(2)),
      rechargeFees:          parseFloat(rechargeFees.toFixed(2)),
      totalRechargeRevenue:  parseFloat(rechargeFees.toFixed(2)),
      merchantCommission:    parseFloat(merchantCommission.toFixed(2)),
      boostRevenue:          parseFloat(boostRevenue.toFixed(2)),
      subscriptionRevenue:   parseFloat(subscriptionRevenue.toFixed(2)),
      transferFees:          parseFloat(transferFees.toFixed(2)),
      walletFees:            parseFloat(walletFees.toFixed(2)),
      p2pTransferFees:       parseFloat(p2pTransferFees.toFixed(2)),
      deliveryFees:          parseFloat(deliveryFees.toFixed(2)),
      rechargeCount:         rechargeFeesRow?.count    ?? 0,
      orderCount:            merchantRow?.count        ?? 0,
      boostCount:            boostRow?.count           ?? 0,
      subscriptionCount:     subscriptionRow?.count    ?? 0,
      transferFeeCount:      transferFeeRow?.count     ?? 0,
    },
    daily,
  });
});

// ─── Admin: monthly revenue statements ────────────────────────────────────────

router.get("/admin/platform-revenue/monthly", requireSuperAdmin, async (req, res): Promise<void> => {
  const year = parseInt(String(req.query.year ?? new Date().getFullYear()), 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    res.status(400).json({ error: "Invalid year" }); return;
  }

  // One query per revenue stream, grouped by month — efficient batch approach
  const [boostRows, commRows, rechargeRows, subscRows, p2pRows, delivRows, monthlyTxRows] = await Promise.all([
    // Boost
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS mo, coalesce(sum(abs(amount_usd)),0)::float AS total
      FROM wallet_transactions
      WHERE type IN ('boost_debit','promo_boost_debit') AND status = 'completed'
        AND EXTRACT(YEAR FROM created_at) = ${year}
      GROUP BY mo ORDER BY mo
    `).then(r => r.rows as { mo: string; total: number }[]),

    // Merchant commission
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS mo, coalesce(sum(commission_amount),0)::float AS total
      FROM transactions
      WHERE type = 'purchase' AND payment_status = 'completed'
        AND EXTRACT(YEAR FROM created_at) = ${year}
      GROUP BY mo ORDER BY mo
    `).then(r => r.rows as { mo: string; total: number }[]),

    // Recharge fees
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS mo, coalesce(sum(abs(amount_usd)),0)::float AS total
      FROM wallet_transactions
      WHERE type = 'recharge_fee' AND status = 'completed'
        AND EXTRACT(YEAR FROM created_at) = ${year}
      GROUP BY mo ORDER BY mo
    `).then(r => r.rows as { mo: string; total: number }[]),

    // Subscriptions (wallet-pay, manual renewal, auto-renewal, promo portion)
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS mo, coalesce(sum(abs(amount_usd)),0)::float AS total
      FROM wallet_transactions
      WHERE type IN ('vendor_subscription','promo_subscription_debit') AND status = 'completed'
        AND EXTRACT(YEAR FROM created_at) = ${year}
      GROUP BY mo ORDER BY mo
    `).then(r => r.rows as { mo: string; total: number }[]),

    // P2P transfer fees (5%)
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS mo, coalesce(sum(fee_usd),0)::float AS total
      FROM wallet_transfers
      WHERE status = 'completed'
        AND EXTRACT(YEAR FROM created_at) = ${year}
      GROUP BY mo ORDER BY mo
    `).then(r => r.rows as { mo: string; total: number }[]),

    // Delivery platform commission (15% — PHASE 1 fix, was 20%)
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS mo, coalesce(sum(fee_usd * 0.15),0)::float AS total
      FROM deliveries
      WHERE status = 'completed' AND fee_usd IS NOT NULL
        AND EXTRACT(YEAR FROM created_at) = ${year}
      GROUP BY mo ORDER BY mo
    `).then(r => r.rows as { mo: string; total: number }[]),

    // All monthly totals grouped (for summary row)
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS mo, count(*)::int AS tx_count
      FROM transactions
      WHERE type = 'purchase' AND payment_status = 'completed'
        AND EXTRACT(YEAR FROM created_at) = ${year}
      GROUP BY mo ORDER BY mo
    `).then(r => r.rows as { mo: string; tx_count: number }[]),
  ]);

  // Build month index map helpers
  const toMap = (rows: { mo: string; total: number }[]) =>
    Object.fromEntries(rows.map(r => [r.mo, r.total]));
  const boostMap   = toMap(boostRows);
  const commMap    = toMap(commRows);
  const rechMap    = toMap(rechargeRows);
  const subsMap    = toMap(subscRows);
  const p2pMap     = toMap(p2pRows);
  const delivMap   = toMap(delivRows);
  const txCountMap = Object.fromEntries(monthlyTxRows.map(r => [r.mo, r.tx_count]));

  // Generate all 12 months for the year
  const months = Array.from({ length: 12 }, (_, i) => {
    const mo = `${year}-${String(i + 1).padStart(2, "0")}`;
    const boost        = boostMap[mo]  ?? 0;
    const commission   = commMap[mo]   ?? 0;
    const recharge     = rechMap[mo]   ?? 0;
    const subscription = subsMap[mo]   ?? 0;
    const p2p          = p2pMap[mo]    ?? 0;
    const delivery     = delivMap[mo]  ?? 0;
    const total = boost + commission + recharge + subscription + p2p + delivery;
    return {
      month:              mo,
      totalRevenue:       parseFloat(total.toFixed(2)),
      boostRevenue:       parseFloat(boost.toFixed(2)),
      merchantCommission: parseFloat(commission.toFixed(2)),
      rechargeFees:       parseFloat(recharge.toFixed(2)),
      subscriptionRevenue:parseFloat(subscription.toFixed(2)),
      p2pTransferFees:    parseFloat(p2p.toFixed(2)),
      deliveryFees:       parseFloat(delivery.toFixed(2)),
      orderCount:         txCountMap[mo] ?? 0,
    };
  });

  const grandTotal = months.reduce((s, m) => s + m.totalRevenue, 0);
  res.json({ year, grandTotal: parseFloat(grandTotal.toFixed(2)), months });
});

router.get("/admin/transactions", requireFinanceAdmin, async (req, res): Promise<void> => {

  const txs = await db
    .select({
      id: transactionsTable.id,
      type: transactionsTable.type,
      amount: transactionsTable.amount,
      currency: transactionsTable.currency,
      paymentMethod: transactionsTable.paymentMethod,
      paymentStatus: transactionsTable.paymentStatus,
      paymentRef: transactionsTable.paymentRef,
      description: transactionsTable.description,
      createdAt: transactionsTable.createdAt,
      listingTitle: listingsTable.title,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(transactionsTable)
    .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(500);
  res.json(txs);
});

// ─── Buyer order cancellation ──────────────────────────────────────────────────
// POST /api/transactions/:id/cancel
// Rules:
//   • Buyer only (tx.userId must match)
//   • Only cancellable when orderStatus in ["pending","ready_to_ship"]
//   • If delivery exists and status is >= picked_up → blocked (driver has the parcel)
//   • If delivery status is "driver_assigned" → driver gets 30% of delivery fee as compensation
//   • If delivery status is "waiting" (no driver yet) → full refund
//   • Wallet-paid orders: auto-refund to buyer's real balance
//   • Other payment methods: mark cancelled; admin processes refund manually
router.post("/transactions/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const txId = parseInt(String(req.params.id), 10);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, txId))
    .limit(1);

  if (!tx) { res.status(404).json({ error: "Order not found" }); return; }
  if (tx.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (tx.orderStatus === "cancelled") { res.status(409).json({ error: "Deja kansele" }); return; }

  const cancellable = ["pending", "ready_to_ship"];
  if (!cancellable.includes(tx.orderStatus ?? "")) {
    res.status(409).json({ error: "Kòmand sa pa kapab kansele nan etap sa" }); return;
  }

  // Find associated delivery (Haiti local delivery flow only)
  const [delivery] = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.transactionId, txId))
    .limit(1);

  // Cancellation rules for local delivery orders:
  //   • status="waiting"         → buyer CAN cancel (full refund, no driver involved yet)
  //   • status="driver_assigned" → buyer CANNOT cancel (driver already committed)
  //   • status="picked_up" +     → buyer CANNOT cancel (driver has the parcel)
  if (delivery && delivery.status === "driver_assigned") {
    res.status(409).json({
      error: "Chofe a deja aksepte kòmand ou. Ou pa kapab kansele ankò.",
      driverAssigned: true,
    });
    return;
  }

  // Blocked states: driver already has the parcel — cannot cancel
  const lockedStatuses = ["picked_up", "on_the_way", "arrived", "delivered"];
  if (delivery && lockedStatuses.includes(delivery.status)) {
    res.status(409).json({ error: "Chofe a deja pran kòmand lan. Ou pa kapab kansele ankò." }); return;
  }

  const deliveryFee = tx.deliveryFeeUsd ?? 0;
  // Full refund: item price + delivery fee — no driver compensation since
  // the driver has not yet physically picked up the parcel.
  const refundAmount = tx.amount + deliveryFee;

  const now = new Date();

  // ── Wallet-paid: auto-refund buyer in full ────────────────────────────────
  if (tx.paymentMethod === "wallet" && refundAmount > 0) {
    const [buyerWallet] = await db
      .select()
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, userId))
      .limit(1);

    if (buyerWallet) {
      await db
        .update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${refundAmount}`, updatedAt: now })
        .where(eq(promoWalletTable.userId, userId));
    } else {
      await db.insert(promoWalletTable).values({ userId, balanceUsd: refundAmount });
    }

    await db.insert(walletTransactionsTable).values({
      userId,
      type: "refund",
      amountUsd: refundAmount,
      paymentRef: `cancel-${txId}`,
      status: "completed",
      note: `Rembosman konplè — kòmand #${txId} kansele anvan ranmase. $${refundAmount.toFixed(2)} (pri atik + frè livrezon) retounen nan pòtfèy ou imedyatman.`,
    });

    // Notify driver (if one was assigned) that the order is cancelled — no compensation
    if (delivery?.driverUserId) {
      await db.insert(notificationsTable).values({
        userId: delivery.driverUserId,
        type: "order_cancelled",
        actorId: userId,
        message: "Achetè a kansele kòmand lan anvan ou te ranmase li. Ou pa gen oken pèt — ou pa t' janm touche kòmand sa.",
      } as any).catch(() => {});
    }
  }

  // ── Mark transaction cancelled ───────────────────────────────────────────
  await db
    .update(transactionsTable)
    .set({ orderStatus: "cancelled" } as any)
    .where(eq(transactionsTable.id, txId));

  // ── Restore listing stock ─────────────────────────────────────────────────
  // If the listing had a stockQuantity (multi-item), increment it back by 1
  // and restore status to 'available' if it became 'sold'.
  // If it was a single-item listing (stockQuantity IS NULL), just restore
  // the status to 'available' so it reappears on the marketplace.
  if (tx.listingId) {
    const [listing] = await db
      .select({ stockQuantity: listingsTable.stockQuantity, status: listingsTable.status })
      .from(listingsTable)
      .where(eq(listingsTable.id, tx.listingId))
      .limit(1);

    if (listing) {
      if (listing.stockQuantity !== null && listing.stockQuantity !== undefined) {
        // Multi-stock listing: increment quantity back, un-sell if needed
        await db
          .update(listingsTable)
          .set({
            stockQuantity: sql`${listingsTable.stockQuantity} + 1`,
            status: "available",
          } as any)
          .where(eq(listingsTable.id, tx.listingId));
      } else if (listing.status === "sold") {
        // Single-item listing: just restore to available
        await db
          .update(listingsTable)
          .set({ status: "available" } as any)
          .where(eq(listingsTable.id, tx.listingId));
      }
    }
  }

  // ── Mark delivery cancelled (reset so no stale delivery stays active) ────
  if (delivery) {
    await db
      .update(deliveriesTable)
      .set({ status: "cancelled", updatedAt: now } as any)
      .where(eq(deliveriesTable.id, delivery.id));
  }

  // Notify seller
  if (tx.sellerUserId) {
    await db.insert(notificationsTable).values({
      userId: tx.sellerUserId,
      type: "order_cancelled",
      actorId: userId,
      listingId: tx.listingId ?? undefined,
    } as any).catch(() => {});
  }

  req.log.info({ txId, userId, refundAmount, paymentMethod: tx.paymentMethod }, "Order cancelled by buyer — full refund (pre-pickup)");

  res.json({
    ok: true,
    refundAmount,
    driverCompensation: 0,
    walletRefunded: tx.paymentMethod === "wallet",
  });
});

// ─── Seller order rejection → instant buyer refund ─────────────────────────────
// POST /api/orders/:id/seller-reject
//   • Only the seller of the order can call this
//   • Only when orderStatus is "ready_to_ship" (driver not yet assigned)
//   • Wallet-paid orders: instant full refund to buyer's real balance
//   • Listing is restored to "available"
router.post("/orders/:id/seller-reject", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const txId = parseInt(String(req.params.id), 10);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, txId))
    .limit(1);

  if (!tx) { res.status(404).json({ error: "Kòmand pa jwenn" }); return; }
  if (tx.sellerUserId !== userId) { res.status(403).json({ error: "Sèlman machann an ka refize kòmand sa" }); return; }
  if (tx.orderStatus === "cancelled") { res.status(409).json({ error: "Kòmand deja kansele" }); return; }
  if (tx.orderStatus !== "ready_to_ship") {
    res.status(409).json({ error: "Ou ka sèlman refize yon kòmand ki poko voye" }); return;
  }

  const [delivery] = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.transactionId, txId))
    .limit(1);

  if (delivery && ["driver_assigned", "picked_up", "on_the_way", "arrived", "delivered"].includes(delivery.status)) {
    res.status(409).json({ error: "Chofe a deja pran kòmand lan — ou pa kapab refize ankò" }); return;
  }

  const now = new Date();
  const buyerId = tx.userId;
  const refundAmount = (tx.amount ?? 0) + (tx.deliveryFeeUsd ?? 0);

  // ── Instant wallet refund to buyer ─────────────────────────────────────────
  if (tx.paymentMethod === "wallet" && refundAmount > 0 && buyerId) {
    const [buyerWallet] = await db
      .select()
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, buyerId))
      .limit(1);

    if (buyerWallet) {
      await db
        .update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${refundAmount}`, updatedAt: now })
        .where(eq(promoWalletTable.userId, buyerId));
    } else {
      await db.insert(promoWalletTable).values({ userId: buyerId, balanceUsd: refundAmount });
    }

    await db.insert(walletTransactionsTable).values({
      userId: buyerId,
      type: "refund",
      amountUsd: refundAmount,
      paymentRef: `seller-reject-${txId}`,
      status: "completed",
      note: `Ranbousman — machann te refize kòmand #${txId}. $${refundAmount.toFixed(2)} tounen nan pòtfèy ou imedyatman.`,
    });
  }

  // ── Cancel order ────────────────────────────────────────────────────────────
  await db
    .update(transactionsTable)
    .set({ orderStatus: "cancelled" } as any)
    .where(eq(transactionsTable.id, txId));

  // ── Restore listing ─────────────────────────────────────────────────────────
  if (tx.listingId) {
    const [listing] = await db
      .select({ stockQuantity: listingsTable.stockQuantity, status: listingsTable.status })
      .from(listingsTable)
      .where(eq(listingsTable.id, tx.listingId))
      .limit(1);
    if (listing) {
      if (listing.stockQuantity !== null && listing.stockQuantity !== undefined) {
        await db.update(listingsTable)
          .set({ stockQuantity: sql`${listingsTable.stockQuantity} + 1`, status: "available" } as any)
          .where(eq(listingsTable.id, tx.listingId));
      } else if (listing.status === "sold") {
        await db.update(listingsTable)
          .set({ status: "available" } as any)
          .where(eq(listingsTable.id, tx.listingId));
      }
    }
  }

  // ── Cancel any pending delivery ─────────────────────────────────────────────
  if (delivery) {
    await db.update(deliveriesTable)
      .set({ status: "cancelled", updatedAt: now } as any)
      .where(eq(deliveriesTable.id, delivery.id));
  }

  // ── Notify buyer ────────────────────────────────────────────────────────────
  if (buyerId) {
    await db.insert(notificationsTable).values({
      userId: buyerId,
      type: "order_cancelled",
      actorId: userId,
      listingId: tx.listingId ?? undefined,
      message: tx.paymentMethod === "wallet"
        ? `Machann nan te refize kòmand #${txId} ou a. $${refundAmount.toFixed(2)} tounen nan pòtfèy ou imedyatman.`
        : `Machann nan te refize kòmand #${txId} ou a. Ou pral resevwa ranbousman ou — kontakte sipò si ou pa resevwa l nan 48h.`,
    } as any).catch(() => {});
  }

  req.log.info({ txId, sellerId: userId, buyerId, refundAmount, paymentMethod: tx.paymentMethod }, "Order rejected by seller — buyer refunded");

  res.json({ ok: true, refundAmount, walletRefunded: tx.paymentMethod === "wallet" });
});

// ─── Multi-seller cart checkout ────────────────────────────────────────────────
router.post("/cart/checkout", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const {
    items: rawItems,
    shippingName, shippingPhone, shippingEmail,
    shippingStreet, shippingCity, shippingRegion,
    paymentMethod = "wallet",
    deliveryMethod = "motorcycle",
  } = req.body;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    res.status(400).json({ error: "Panye a vid" }); return;
  }
  if (!shippingName?.trim() || !shippingPhone?.trim() || !shippingCity?.trim()) {
    res.status(400).json({ error: "Non, telefòn, ak vil livrezon obligatwa" }); return;
  }
  if (paymentMethod !== "wallet") {
    res.status(400).json({ error: "Sèlman peman wallet disponib pou panye kounye a" }); return;
  }

  const listingIds: number[] = rawItems.map((i: any) => Number(i.listingId)).filter(n => n > 0);
  if (listingIds.length === 0) { res.status(400).json({ error: "ID pwodwi pa valab" }); return; }

  // Load all listings at once
  const listings = await db.select().from(listingsTable).where(inArray(listingsTable.id, listingIds));
  for (const lid of listingIds) {
    const l = listings.find(x => x.id === lid);
    if (!l) { res.status(404).json({ error: `Pwodwi #${lid} pa jwenn` }); return; }
    if (l.status !== "available") { res.status(409).json({ error: `Pwodwi "${l.title}" deja vann` }); return; }
    if (l.sellerId === userId) { res.status(400).json({ error: `Ou pa ka achte pwòp pwodwi ou: "${l.title}"` }); return; }
  }

  // Calculate grand total — convert non-USD listing currencies to USD first
  const [{ displayRate: cartDisplayRate }, cartDopRate] = await Promise.all([getDisplayRate(), getDopRate()]);
  let grandTotal = 0;
  for (const item of rawItems) {
    const l = listings.find(x => x.id === Number(item.listingId))!;
    const lCurrency = (l as any).currency ?? "USD";
    let lPriceUsd = l.price;
    if (lCurrency === "HTG") lPriceUsd = parseFloat((lPriceUsd / cartDisplayRate).toFixed(2));
    else if (lCurrency === "DOP") lPriceUsd = parseFloat((lPriceUsd / cartDopRate).toFixed(2));
    grandTotal += lPriceUsd * (Number(item.quantity) || 1);
  }
  grandTotal = Math.round(grandTotal * 100) / 100;

  // Pre-calculate per-item delivery fees using the pricing engine
  // seller city → buyer city distance-based fee for each item
  const { calculateDeliveryPrice } = await import("../lib/deliveryPricing");
  const shippingCityForDelivery = String(req.body?.shippingCity ?? "").trim();
  interface ItemDeliveryFee { listingId: number; feeUsd: number; pickupCity: string }
  const itemDeliveryFees: ItemDeliveryFee[] = [];
  let totalDeliveryFees = 0;
  for (const item of rawItems) {
    const l = listings.find(x => x.id === Number(item.listingId))!;
    const [sellerUser] = await db.select({ location: usersTable.location })
      .from(usersTable).where(eq(usersTable.id, l.sellerId)).limit(1);
    const sellerCity = sellerUser?.location ?? (l as any).city ?? "Port-au-Prince";
    const lCountry = l.country ?? "Haiti";
    const lCurr = (l as any).currency ?? "USD";
    let lPriceForDelivery = l.price;
    if (lCurr === "HTG") lPriceForDelivery = parseFloat((lPriceForDelivery / cartDisplayRate).toFixed(2));
    else if (lCurr === "DOP") lPriceForDelivery = parseFloat((lPriceForDelivery / cartDopRate).toFixed(2));
    const result = calculateDeliveryPrice(
      sellerCity, shippingCityForDelivery || sellerCity,
      lCountry, req.body?.deliveryMethod ?? "motorcycle",
      cartDisplayRate, undefined, false, lPriceForDelivery,
    );
    itemDeliveryFees.push({ listingId: l.id, feeUsd: result.feeUsd, pickupCity: sellerCity });
    totalDeliveryFees += result.feeUsd;
  }
  totalDeliveryFees = Math.round(totalDeliveryFees * 100) / 100;
  const grandTotalWithDelivery = Math.round((grandTotal + totalDeliveryFees) * 100) / 100;

  // Check wallet — must cover product total + all delivery fees
  const [wallet] = await db.select({ balanceUsd: promoWalletTable.balanceUsd, promoBalance: promoWalletTable.promoBalance })
    .from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
  const available = Math.round(((wallet?.balanceUsd ?? 0) + (wallet?.promoBalance ?? 0)) * 100) / 100;
  if (available < grandTotalWithDelivery) {
    res.status(402).json({
      error: `Balans ensifizan. Ou bezwen $${grandTotalWithDelivery.toFixed(2)} (atik $${grandTotal.toFixed(2)} + livrezon $${totalDeliveryFees.toFixed(2)}), ou gen $${available.toFixed(2)}`,
    }); return;
  }

  // Deduct wallet upfront — products + delivery (refund per-item if listing already sold)
  const now = new Date();
  if (wallet) {
    await db.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${grandTotalWithDelivery}`, updatedAt: now })
      .where(eq(promoWalletTable.userId, userId));
  } else {
    await db.insert(promoWalletTable).values({ userId, balanceUsd: -grandTotalWithDelivery });
  }
  await db.insert(walletTransactionsTable).values({
    userId, type: "purchase", amountUsd: -grandTotalWithDelivery,
    paymentRef: `CART-${Date.now()}`,
    note: `Panye — ${rawItems.length} atik — pwodwi $${grandTotal.toFixed(2)} + livrezon $${totalDeliveryFees.toFixed(2)}`,
  }).catch(() => {});

  const orders: { txId: number; sellerId: number; amount: number; deliveryFee: number; title: string }[] = [];
  let refundTotal = 0;

  for (const item of rawItems) {
    const listing = listings.find(x => x.id === Number(item.listingId))!;
    const qty = Number(item.quantity) || 1;
    const itemCurrency = (listing as any).currency ?? "USD";
    let itemPriceUsd = listing.price;
    if (itemCurrency === "HTG") itemPriceUsd = parseFloat((itemPriceUsd / cartDisplayRate).toFixed(2));
    else if (itemCurrency === "DOP") itemPriceUsd = parseFloat((itemPriceUsd / cartDopRate).toFixed(2));
    const itemTotal = Math.round(itemPriceUsd * qty * 100) / 100;
    const listingCountry = listing.country ?? "Haiti";
    const autoReleaseDays = listingCountry === "Haiti" ? AUTO_RELEASE_DAYS_HAITI : AUTO_RELEASE_DAYS_OTHER;

    // Mark listing sold (skip if already gone)
    const [updated] = await db.update(listingsTable)
      .set({ status: "sold" } as any)
      .where(and(eq(listingsTable.id, listing.id), eq(listingsTable.status, "available")))
      .returning({ id: listingsTable.id });

    if (!updated) {
      // Already sold — refund this item
      refundTotal += itemTotal;
      continue;
    }

    const commission = await quoteForListing(
      { sellerId: listing.sellerId, categoryId: listing.categoryId, price: itemTotal },
      "wallet", null,
    );
    const paymentRef = `CART-${Date.now()}-${listing.id}`;

    const [txRow] = await db.insert(transactionsTable).values({
      userId,
      listingId: listing.id,
      sellerUserId: listing.sellerId,
      type: "purchase",
      amount: itemTotal,
      currency: listing.currency ?? (listingCountry === "Haiti" ? "HTG" : "USD"),
      paymentMethod: "wallet",
      paymentStatus: "completed",
      paymentRef,
      description: `Purchase of "${listing.title}" (panye)`,
      shippingName: shippingName.trim(),
      shippingPhone: shippingPhone.trim(),
      shippingEmail: shippingEmail?.trim() ?? null,
      shippingStreet: shippingStreet?.trim() ?? null,
      shippingCity: shippingCity.trim(),
      shippingRegion: shippingRegion?.trim() ?? null,
      commissionRate: commission.rate,
      commissionAmount: commission.commissionAmount,
      sellerEarnings: commission.sellerEarnings,
      buyerFeeRate: 0,
      buyerFeeAmount: 0,
      buyerTotal: itemTotal,
      listingCurrency: listing.currency ?? "USD",
      listingPriceOriginal: listing.price,
      deliveryMethod,
      deliveryType: "delivery",
      autoReleaseAt: new Date(now.getTime() + autoReleaseDays * 86400000),
      listingCountry,
    } as any).returning({ id: transactionsTable.id });

    // Create delivery record for each item (one driver per item/seller city)
    const deliveryFeeEntry = itemDeliveryFees.find(d => d.listingId === listing.id);
    const itemDeliveryFeeUsd = deliveryFeeEntry?.feeUsd ?? 0;
    const [sellerUser] = await db.select({ location: usersTable.location, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, listing.sellerId)).limit(1);
    const pickupCity = deliveryFeeEntry?.pickupCity ?? sellerUser?.location ?? (listing as any).city ?? null;
    await db.insert(deliveriesTable).values({
      transactionId: txRow.id,
      listingId: listing.id,
      sellerId: listing.sellerId,
      buyerId: userId,
      driverUserId: null,
      deliveryMethod: deliveryMethod === "car" ? "car" : "motorcycle",
      pickupCity,
      deliveryCity: shippingCity.trim(),
      deliveryAddress: [shippingStreet, shippingCity, shippingRegion].filter(Boolean).join(", ") || shippingCity.trim(),
      country: listingCountry,
      status: "waiting",
      sellerNote: `Panye — ${listing.title}`,
      currency: "USD",
      feeUsd: itemDeliveryFeeUsd,
      feeLocal: Math.round(itemDeliveryFeeUsd * cartDisplayRate),
    } as any).catch(() => {});

    // Notify seller
    await db.insert(notificationsTable).values({
      userId: listing.sellerId,
      type: "new_order",
      actorId: userId,
      listingId: listing.id,
      message: `💰 Nouvo kòmand "${listing.title}" — $${itemTotal.toFixed(2)} + livrezon $${itemDeliveryFeeUsd.toFixed(2)} (panye). Peman nan escrow.`,
    } as any).catch(() => {});

    orders.push({ txId: txRow.id, sellerId: listing.sellerId, amount: itemTotal, deliveryFee: itemDeliveryFeeUsd, title: listing.title });
  }

  // Refund items that were already sold
  if (refundTotal > 0) {
    await db.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${refundTotal}`, updatedAt: now })
      .where(eq(promoWalletTable.userId, userId));
    await db.insert(walletTransactionsTable).values({
      userId, type: "refund", amountUsd: refundTotal,
      paymentRef: `CART-REFUND-${Date.now()}`,
      note: `Ranbousman — atik ki deja vann nan panye a`,
    }).catch(() => {});
  }

  req.log.info({ userId, orders: orders.length, grandTotal, totalDeliveryFees, refundTotal }, "Cart checkout completed");
  res.json({ ok: true, orders, total: grandTotal - refundTotal, deliveryTotal: totalDeliveryFees, grandTotal: grandTotalWithDelivery - refundTotal, refundedCount: refundTotal > 0 ? 1 : 0 });
});

export default router;
