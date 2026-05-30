/**
 * International Shipping Routes — FlexaMarket
 *
 * GET  /api/shipping/countries          List all supported shipping countries
 * POST /api/shipping/quote              Get carrier options + pricing for an order
 * PATCH /api/orders/:id/tracking        Seller sets tracking number & carrier
 * GET  /api/orders/:id/tracking         Get tracking info for an order
 */

import { Router } from "express";
import { db, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  quoteInternationalShipping,
  listShippingCountries,
  getReturnWindowDays,
  getReturnPolicyLabel,
  CARRIERS,
} from "../lib/internationalShipping";

const router = Router();

// ─── GET /api/shipping/countries ─────────────────────────────────────────────
// Returns all countries FlexaMarket can ship to with return windows.

router.get("/shipping/countries", (_req, res) => {
  const countries = listShippingCountries();
  res.json({ countries });
});

// ─── GET /api/shipping/carriers ──────────────────────────────────────────────
// Returns all supported carriers.

router.get("/shipping/carriers", (_req, res) => {
  res.json({ carriers: Object.values(CARRIERS) });
});

// ─── POST /api/shipping/quote ─────────────────────────────────────────────────
// Body: { destinationCountry: string, weightKg: number, itemValueUsd?: number }
// Returns: carrier options sorted economy → standard → express

router.post("/shipping/quote", async (req, res): Promise<void> => {
  const { destinationCountry, weightKg, itemValueUsd } = req.body ?? {};

  if (!destinationCountry || typeof destinationCountry !== "string") {
    res.status(400).json({ error: "destinationCountry obligatwa" });
    return;
  }

  const weight = parseFloat(weightKg ?? 0);
  if (!weight || weight <= 0 || weight > 20) {
    res.status(400).json({ error: "weightKg dwe ant 0.01 ak 20 kg" });
    return;
  }

  const quote = quoteInternationalShipping(
    destinationCountry,
    weight,
    parseFloat(itemValueUsd ?? 0),
  );

  if (!quote) {
    // Local delivery country — use local delivery system
    if (["Haiti", "Dominican Republic"].includes(destinationCountry)) {
      res.status(422).json({
        error: "Livrezon lokal — itilize sistèm chauffeur pou Ayiti / RD",
        isLocal: true,
      });
    } else {
      res.status(404).json({ error: `Peyi "${destinationCountry}" pa sipòte pou livrezon entènasyonal` });
    }
    return;
  }

  logger.info({ destinationCountry, weightKg: weight, options: quote.options.length }, "Shipping quote generated");
  res.json(quote);
});

// ─── GET /api/shipping/return-policy ─────────────────────────────────────────
// Query: ?country=France
// Returns the return policy for a given destination country.

router.get("/shipping/return-policy", (req, res) => {
  const country = String(req.query.country ?? "").trim();
  if (!country) {
    res.status(400).json({ error: "country obligatwa" });
    return;
  }
  const days   = getReturnWindowDays(country);
  const policy = getReturnPolicyLabel(days, country);
  res.json({ country, returnWindowDays: days, returnPolicy: policy });
});

// ─── PATCH /api/orders/:id/tracking ──────────────────────────────────────────
// Seller updates the international carrier & tracking number for an order.

router.patch("/orders/:id/tracking", requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id ?? "", 10);
  if (!orderId) { res.status(400).json({ error: "ID kòmand pa valid" }); return; }

  const { carrier, trackingNumber, shippingMethod } = req.body ?? {};

  if (!carrier || typeof carrier !== "string") {
    res.status(400).json({ error: "carrier obligatwa" }); return;
  }
  if (!trackingNumber || typeof trackingNumber !== "string" || trackingNumber.trim().length < 4) {
    res.status(400).json({ error: "Nimewo traking obligatwa (min 4 karaktè)" }); return;
  }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, orderId));
  if (!tx) { res.status(404).json({ error: "Kòmand pa jwenn" }); return; }

  const isSeller = tx.sellerUserId === req.userId;
  const isAdmin  = req.user?.isAdmin || req.user?.isSuperAdmin;
  if (!isSeller && !isAdmin) {
    res.status(403).json({ error: "Sèlman vandè a ka mete enfòmasyon traking" }); return;
  }

  if (!["ready_to_ship", "shipped"].includes(tx.orderStatus ?? "")) {
    res.status(409).json({ error: "Kòmand la pa nan eta pou mete traking (dwe ready_to_ship oswa shipped)" }); return;
  }

  const [updated] = await db
    .update(transactionsTable)
    .set({
      carrier:         carrier.trim(),
      trackingNumber:  trackingNumber.trim(),
      shippingMethod:  shippingMethod?.trim() ?? tx.shippingMethod,
      orderStatus:     "shipped",
      shippedAt:       tx.shippedAt ?? new Date(),
    })
    .where(eq(transactionsTable.id, orderId))
    .returning();

  logger.info({ orderId, carrier, trackingNumber, sellerId: req.userId }, "Tracking info updated by seller");
  res.json({ ok: true, order: updated });
});

// ─── GET /api/orders/:id/tracking ─────────────────────────────────────────────
// Returns tracking info for an order (buyer + seller can see).

router.get("/orders/:id/tracking", requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id ?? "", 10);
  if (!orderId) { res.status(400).json({ error: "ID kòmand pa valid" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, orderId));
  if (!tx) { res.status(404).json({ error: "Kòmand pa jwenn" }); return; }

  const isBuyer  = tx.userId === req.userId;
  const isSeller = tx.sellerUserId === req.userId;
  const isAdmin  = req.user?.isAdmin || req.user?.isSuperAdmin;
  if (!isBuyer && !isSeller && !isAdmin) {
    res.status(403).json({ error: "Aksè refize" }); return;
  }

  res.json({
    orderId,
    orderStatus:    tx.orderStatus,
    carrier:        tx.carrier ?? null,
    trackingNumber: tx.trackingNumber ?? null,
    shippingMethod: tx.shippingMethod ?? null,
    shippedAt:      tx.shippedAt ?? null,
    deliveredAt:    tx.deliveredAt ?? null,
    returnWindow:   tx.listingCountry
      ? { days: getReturnWindowDays(tx.listingCountry), policy: getReturnPolicyLabel(getReturnWindowDays(tx.listingCountry), tx.listingCountry) }
      : null,
  });
});

export default router;
