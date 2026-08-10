import { Router } from "express";
import { db, promoPurchaseCommissionsTable, promoWalletTable } from "@workspace/db";
import { eq, and, lt, ne, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

/** GET /promo-purchase-commissions/my
 * Returns:
 *   pendingAmount   — this month's earnings (locked until next month)
 *   pendingCount    — number of commissions this month
 *   availableAmount — past-month earnings not yet withdrawn (ready to withdraw)
 *   availableCount  — count of those records
 *   currentMonth    — "YYYY-MM"
 *   history         — last 50 commission rows
 */
router.get("/promo-purchase-commissions/my", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    const rows = await db
      .select()
      .from(promoPurchaseCommissionsTable)
      .where(eq(promoPurchaseCommissionsTable.referrerUserId, userId))
      .orderBy(desc(promoPurchaseCommissionsTable.createdAt))
      .limit(100);

    const pendingRows    = rows.filter(r => r.status === "pending" && r.cycleMonth === currentMonth);
    const availableRows  = rows.filter(r => r.status === "pending" && r.cycleMonth < currentMonth);
    const withdrawnRows  = rows.filter(r => r.status === "withdrawn");

    const pendingAmount   = pendingRows.reduce((s, r) => s + (r.commissionAmount ?? 0), 0);
    const availableAmount = availableRows.reduce((s, r) => s + (r.commissionAmount ?? 0), 0);

    res.json({
      currentMonth,
      pendingAmount:   Math.round(pendingAmount * 100) / 100,
      pendingCount:    pendingRows.length,
      availableAmount: Math.round(availableAmount * 100) / 100,
      availableCount:  availableRows.length,
      history:         rows.slice(0, 50).map(r => ({
        id: r.id,
        commissionAmount: r.commissionAmount,
        purchaseAmount:   r.purchaseAmount,
        cycleMonth:       r.cycleMonth,
        status:           r.status,
        isAvailable:      r.status === "pending" && r.cycleMonth < currentMonth,
        createdAt:        r.createdAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "[promo-purchase-commissions] fetch failed");
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

/** POST /promo-purchase-commissions/withdraw
 * Transfer all available (past-month, pending) commissions to the user's main wallet.
 */
router.post("/promo-purchase-commissions/withdraw", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Find all available (past months, not yet withdrawn)
    const available = await db
      .select()
      .from(promoPurchaseCommissionsTable)
      .where(
        and(
          eq(promoPurchaseCommissionsTable.referrerUserId, userId),
          eq(promoPurchaseCommissionsTable.status, "pending"),
          lt(promoPurchaseCommissionsTable.cycleMonth, currentMonth),
        )
      );

    if (available.length === 0) {
      res.status(400).json({ error: "No available commissions to withdraw" });
      return;
    }

    const totalAmount = available.reduce((s, r) => s + (r.commissionAmount ?? 0), 0);
    const roundedTotal = Math.round(totalAmount * 100) / 100;

    // Mark all available commissions as withdrawn
    const ids = available.map(r => r.id);
    await db
      .update(promoPurchaseCommissionsTable)
      .set({ status: "withdrawn" })
      .where(
        and(
          eq(promoPurchaseCommissionsTable.referrerUserId, userId),
          eq(promoPurchaseCommissionsTable.status, "pending"),
          lt(promoPurchaseCommissionsTable.cycleMonth, currentMonth),
        )
      );

    // Credit to user's main wallet balance
    await db
      .update(promoWalletTable)
      .set({
        balanceUsd: sql`${promoWalletTable.balanceUsd} + ${roundedTotal}`,
        updatedAt: new Date(),
      })
      .where(eq(promoWalletTable.userId, userId));

    // Ensure wallet row exists (getOrCreate-style)
    // If the UPDATE above affected 0 rows the wallet doesn't exist yet — create it.
    const [wallet] = await db
      .select({ balance: promoWalletTable.balanceUsd })
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, userId));

    if (!wallet) {
      // Wallet was missing — shouldn't happen but be safe
      await db.insert(promoWalletTable).values({
        userId,
        balanceUsd: roundedTotal,
      }).onConflictDoNothing();
    }

    const [updated] = await db
      .select({ balance: promoWalletTable.balanceUsd })
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, userId));

    res.json({
      withdrawn: roundedTotal,
      count: available.length,
      newBalance: updated?.balance ?? roundedTotal,
    });
  } catch (err) {
    req.log.error({ err }, "[promo-purchase-commissions] withdraw failed");
    res.status(500).json({ error: "Withdrawal failed" });
  }
});

export default router;
