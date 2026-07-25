import { Router } from "express";
import { db, promoCodesTable, promoCodeUsesTable, platformSettingsTable, promoWalletTable, walletTransactionsTable, transactionsTable } from "@workspace/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ─── Platform settings helpers ─────────────────────────────────────────────

async function getBonusSettings() {
  const rows = await db.select().from(platformSettingsTable)
    .where(sql`${platformSettingsTable.key} IN (
      'purchase_bonus_enabled',
      'purchase_bonus_threshold',
      'purchase_bonus_amount',
      'bonus_campaign_active',
      'bonus_campaign_multiplier',
      'bonus_campaign_ends_at',
      'bonus_campaign_label',
      'htg_to_usd_rate'
    )`);
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    enabled: map["purchase_bonus_enabled"] !== "false",
    threshold: parseFloat(map["purchase_bonus_threshold"] ?? "20"),
    bonusAmount: parseFloat(map["purchase_bonus_amount"] ?? "1"),
    campaignActive: map["bonus_campaign_active"] === "true",
    campaignMultiplier: parseFloat(map["bonus_campaign_multiplier"] ?? "2"),
    campaignEndsAt: map["bonus_campaign_ends_at"] ?? "",
    campaignLabel: map["bonus_campaign_label"] ?? "Bònus Espesyal",
    htgRate: parseFloat(map["htg_to_usd_rate"] ?? "130"),
  };
}

/**
 * Called after every confirmed purchase. Credits an immediate per-purchase
 * loyalty bonus to the buyer's promoBalance (locked promo credit).
 *
 * Bonus rate = bonusAmount / threshold (e.g. $1/$20 = 5% cashback).
 * Every purchase earns immediately — no cumulative threshold needed.
 *
 * @param userId           The buyer's user ID
 * @param purchaseAmountRaw The purchase price in its original currency
 * @param currency         'HTG' or 'USD' (default 'USD')
 */
export async function processPurchaseLoyaltyBonus(
  userId: number,
  purchaseAmountRaw: number,
  currency: string = "USD",
  transactionId?: number,
): Promise<number> {
  const settings = await getBonusSettings();
  if (!settings.enabled || purchaseAmountRaw <= 0) return 0;

  // Convert to USD if necessary
  const purchaseAmountUsd =
    currency === "HTG"
      ? purchaseAmountRaw / settings.htgRate
      : purchaseAmountRaw;

  // Campaign multiplier — only active if campaign is not expired
  let multiplier = 1;
  if (settings.campaignActive) {
    const endsAt = settings.campaignEndsAt ? new Date(settings.campaignEndsAt) : null;
    if (!endsAt || endsAt > new Date()) {
      multiplier = settings.campaignMultiplier;
    }
  }

  // Rate: bonusAmount per threshold (e.g. $1 per $20 = 5%)
  // Every purchase earns this fraction of its own price immediately.
  const rate = settings.bonusAmount / settings.threshold;
  const bonus = parseFloat((purchaseAmountUsd * rate * multiplier).toFixed(2));

  if (bonus <= 0) return 0;

  // Credit to promoBalance (locked) — not directly withdrawable
  const [existing] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.userId, userId));
  if (existing) {
    await db.update(promoWalletTable)
      .set({ promoBalance: sql`${promoWalletTable.promoBalance} + ${bonus}`, updatedAt: new Date() })
      .where(eq(promoWalletTable.userId, userId));
  } else {
    await db.insert(promoWalletTable).values({ userId, promoBalance: bonus });
  }

  await db.insert(walletTransactionsTable).values({
    userId,
    type: "purchase_loyalty_bonus",
    amountUsd: bonus,
    status: "completed",
    paymentRef: transactionId ? `tx-${transactionId}` : undefined,
    note: `Bonis achte — ${(rate * 100).toFixed(0)}% × $${purchaseAmountUsd.toFixed(2)}${multiplier > 1 ? ` × ${multiplier}x kanpay` : ""}`,
  });

  logger.info({ userId, bonus, purchaseAmountUsd, rate, multiplier }, "Purchase loyalty bonus credited");
  return bonus;
}

// ─── GET /api/promo/campaign — public campaign info ─────────────────────────

router.get("/promo/campaign", async (_req, res): Promise<void> => {
  const s = await getBonusSettings();
  let campaignLive = false;
  if (s.campaignActive) {
    const endsAt = s.campaignEndsAt ? new Date(s.campaignEndsAt) : null;
    campaignLive = !endsAt || endsAt > new Date();
  }
  res.json({
    enabled: s.enabled,
    threshold: s.threshold,
    bonusAmount: s.bonusAmount,
    campaignActive: campaignLive,
    campaignMultiplier: s.campaignMultiplier,
    campaignEndsAt: s.campaignEndsAt || null,
    campaignLabel: s.campaignLabel,
    effectiveBonus: s.bonusAmount * (campaignLive ? s.campaignMultiplier : 1),
  });
});

// ─── GET /api/promo/progress — buyer's loyalty progress ─────────────────────

router.get("/promo/progress", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const s = await getBonusSettings();

  const [spendRow] = await db
    .select({
      total: sql<number>`coalesce(sum(
        case when ${transactionsTable.currency} = 'HTG'
          then ${transactionsTable.amount} / ${s.htgRate}
          else ${transactionsTable.amount}
        end
      ), 0)::float`,
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.type, "purchase"),
        eq(transactionsTable.paymentStatus, "completed"),
      ),
    );

  const [paidRow] = await db
    .select({ total: sql<number>`coalesce(sum(${walletTransactionsTable.amountUsd}), 0)::float` })
    .from(walletTransactionsTable)
    .where(
      and(
        eq(walletTransactionsTable.userId, userId),
        eq(walletTransactionsTable.type, "purchase_loyalty_bonus"),
        eq(walletTransactionsTable.status, "completed"),
      ),
    );

  const totalSpendUsd = spendRow?.total ?? 0;
  const totalBonusEarned = paidRow?.total ?? 0;
  const spendInCurrentBlock = totalSpendUsd % s.threshold;
  const toNextReward = parseFloat((s.threshold - spendInCurrentBlock).toFixed(2));
  const progressPct = Math.min(100, Math.round((spendInCurrentBlock / s.threshold) * 100));

  let campaignLive = false;
  if (s.campaignActive) {
    const endsAt = s.campaignEndsAt ? new Date(s.campaignEndsAt) : null;
    campaignLive = !endsAt || endsAt > new Date();
  }

  res.json({
    totalSpendUsd: parseFloat(totalSpendUsd.toFixed(2)),
    totalBonusEarned: parseFloat(totalBonusEarned.toFixed(2)),
    threshold: s.threshold,
    bonusAmount: s.bonusAmount,
    spendInCurrentBlock: parseFloat(spendInCurrentBlock.toFixed(2)),
    toNextReward,
    progressPct,
    campaignActive: campaignLive,
    campaignMultiplier: s.campaignMultiplier,
    campaignEndsAt: s.campaignEndsAt || null,
    campaignLabel: s.campaignLabel,
    effectiveBonus: s.bonusAmount * (campaignLive ? s.campaignMultiplier : 1),
  });
});

// ─── POST /api/promo/validate — validate promo code before purchase ──────────

router.post("/promo/validate", requireAuth, async (req, res): Promise<void> => {
  const { code, orderValue } = req.body as { code?: string; orderValue?: number };
  const userId = req.userId!;

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Kòd obligatwa" });
    return;
  }

  const upperCode = code.trim().toUpperCase();
  const [promoCode] = await db
    .select()
    .from(promoCodesTable)
    .where(and(eq(promoCodesTable.code, upperCode), eq(promoCodesTable.active, true)));

  if (!promoCode) {
    res.status(404).json({ error: "Kòd promo sa a pa valab" });
    return;
  }

  // Expiry check
  if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) {
    res.status(400).json({ error: "Kòd sa a ekspire" });
    return;
  }

  // Max global uses
  if (promoCode.maxUses !== null && promoCode.usesCount >= promoCode.maxUses) {
    res.status(400).json({ error: "Kòd sa a rive nan limit itilizasyon li" });
    return;
  }

  // Per-user limit
  const [userUse] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoCodeUsesTable)
    .where(and(eq(promoCodeUsesTable.codeId, promoCode.id), eq(promoCodeUsesTable.userId, userId)));
  if ((userUse?.count ?? 0) >= promoCode.maxUsesPerUser) {
    res.status(400).json({ error: "Ou deja itilize kòd sa a" });
    return;
  }

  // Min order check
  const orderVal = parseFloat(String(orderValue ?? 0));
  if (orderVal < promoCode.minOrderValue) {
    res.status(400).json({ error: `Kòmand minimòm pou kòd sa a: $${promoCode.minOrderValue.toFixed(2)}` });
    return;
  }

  // Calculate discount
  let discountAmount = 0;
  if (promoCode.discountType === "percent") {
    discountAmount = parseFloat(((orderVal * promoCode.discountValue) / 100).toFixed(2));
  } else {
    discountAmount = Math.min(promoCode.discountValue, orderVal);
  }

  res.json({
    valid: true,
    code: promoCode.code,
    discountType: promoCode.discountType,
    discountValue: promoCode.discountValue,
    discountAmount,
    finalPrice: Math.max(0, orderVal - discountAmount),
    description: promoCode.description,
  });
});

// ─── Admin: list promo codes ─────────────────────────────────────────────────

router.get("/admin/promo/codes", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(promoCodesTable).orderBy(desc(promoCodesTable.createdAt));
  res.json(rows);
});

// ─── Admin: create promo code ────────────────────────────────────────────────

router.post("/admin/promo/codes", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { code, discountType, discountValue, minOrderValue, maxUses, maxUsesPerUser, expiresAt, description } = req.body as {
    code?: string;
    discountType?: string;
    discountValue?: number;
    minOrderValue?: number;
    maxUses?: number | null;
    maxUsesPerUser?: number;
    expiresAt?: string | null;
    description?: string;
  };

  const upperCode = (code ?? "").trim().toUpperCase();
  if (!upperCode || upperCode.length < 3) {
    res.status(400).json({ error: "Kòd dwe gen omwen 3 karaktè" });
    return;
  }
  if (!discountType || !["percent", "fixed"].includes(discountType)) {
    res.status(400).json({ error: "Tip reduksyon pa valab" });
    return;
  }
  const val = parseFloat(String(discountValue ?? 0));
  if (!val || val <= 0) {
    res.status(400).json({ error: "Valè reduksyon dwe pozitif" });
    return;
  }
  if (discountType === "percent" && val > 100) {
    res.status(400).json({ error: "Pousantaj reduksyon pa ka depase 100%" });
    return;
  }

  try {
    const [row] = await db.insert(promoCodesTable).values({
      code: upperCode,
      discountType,
      discountValue: val,
      minOrderValue: parseFloat(String(minOrderValue ?? 0)),
      maxUses: maxUses ?? null,
      maxUsesPerUser: maxUsesPerUser ?? 1,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      description: description?.trim() || null,
      createdBy: req.userId!,
    }).returning();
    logger.info({ code: upperCode, adminId: req.userId }, "Promo code created");
    res.json(row);
  } catch (e: any) {
    if (e?.code === "23505") {
      res.status(409).json({ error: "Kòd sa a deja egziste" });
    } else {
      res.status(500).json({ error: "Echèk" });
    }
  }
});

// ─── Admin: toggle / deactivate promo code ───────────────────────────────────

router.patch("/admin/promo/codes/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { active } = req.body as { active?: boolean };
  const [row] = await db.update(promoCodesTable).set({ active: !!active }).where(eq(promoCodesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Pa jwenn" }); return; }
  res.json(row);
});

// ─── Admin: get / set campaign settings ─────────────────────────────────────

router.get("/admin/promo/campaign", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const s = await getBonusSettings();
  res.json(s);
});

router.put("/admin/promo/campaign", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const {
    enabled, threshold, bonusAmount,
    campaignActive, campaignMultiplier, campaignEndsAt, campaignLabel,
  } = req.body as {
    enabled?: boolean;
    threshold?: number;
    bonusAmount?: number;
    campaignActive?: boolean;
    campaignMultiplier?: number;
    campaignEndsAt?: string;
    campaignLabel?: string;
  };

  const upsert = async (key: string, value: string) => {
    await db.insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
  };

  if (enabled !== undefined) await upsert("purchase_bonus_enabled", String(enabled));
  if (threshold !== undefined && threshold > 0) await upsert("purchase_bonus_threshold", String(threshold));
  if (bonusAmount !== undefined && bonusAmount > 0) await upsert("purchase_bonus_amount", String(bonusAmount));
  if (campaignActive !== undefined) await upsert("bonus_campaign_active", String(campaignActive));
  if (campaignMultiplier !== undefined && campaignMultiplier >= 1) await upsert("bonus_campaign_multiplier", String(campaignMultiplier));
  if (campaignEndsAt !== undefined) await upsert("bonus_campaign_ends_at", campaignEndsAt ?? "");
  if (campaignLabel !== undefined) await upsert("bonus_campaign_label", campaignLabel ?? "");

  const updated = await getBonusSettings();
  logger.info({ adminId: req.userId, ...updated }, "Promo campaign settings updated");
  res.json(updated);
});

export default router;
