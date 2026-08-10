import { Router } from "express";
import { db, promoPurchaseCommissionsTable, promoWalletTable, usersTable } from "@workspace/db";
import { eq, and, lt, desc, sql, countDistinct, count } from "drizzle-orm";
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

    // Commission rows + referral stats + user's own code in parallel
    const [rows, [referralStats], [buyerStats], meRow] = await Promise.all([
      db
        .select()
        .from(promoPurchaseCommissionsTable)
        .where(eq(promoPurchaseCommissionsTable.referrerUserId, userId))
        .orderBy(desc(promoPurchaseCommissionsTable.createdAt))
        .limit(100),

      // Total people who signed up using this user's referral code
      db
        .select({ total: count() })
        .from(usersTable)
        .where(eq(usersTable.referredByUserId, userId)),

      // Unique buyers among those referrals who actually made a purchase (earned commission)
      db
        .select({ total: countDistinct(promoPurchaseCommissionsTable.buyerUserId) })
        .from(promoPurchaseCommissionsTable)
        .where(eq(promoPurchaseCommissionsTable.referrerUserId, userId)),

      // This user's own referral code + name
      db
        .select({ referralCode: usersTable.referralCode, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1),
    ]);

    // Extract as mutable so we can update it if the code gets regenerated
    let me = meRow[0];

    // Auto-convert old-format codes on page load:
    //   - Old random FX codes:  ^FX[A-Z0-9]+   (e.g. FXBJU2EZ)
    //   - Old all-caps+3-digit: ^[A-Z]{2,8}[0-9]{3}$  (e.g. SAMUEL247)
    // New format: proper-case first name + 2 digits  (e.g. Samuel37)
    const isOldCode =
      /^FX[A-Z0-9]+$/.test(me?.referralCode ?? "") ||
      /^[A-Z]{2,8}[0-9]{3}$/.test(me?.referralCode ?? "");
    if (me && isOldCode) {
      const nameBase = (n: string) => {
        const raw = String(n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/)[0].slice(0, 8);
        return raw.length >= 2 ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "Fm";
      };
      const base = nameBase(me.name ?? "");
      let newCode: string | null = null;
      for (let i = 0; i < 30; i++) {
        const candidate = base + String(Math.floor(10 + Math.random() * 90)); // 2 digits
        const [conflict] = await db.select({ id: usersTable.id }).from(usersTable)
          .where(eq(usersTable.referralCode, candidate)).limit(1);
        if (!conflict) { newCode = candidate; break; }
      }
      if (newCode) {
        await db.update(usersTable)
          .set({ referralCode: newCode })
          .where(eq(usersTable.id, userId));
        me = { ...me, referralCode: newCode };
      }
    }

    const pendingRows    = rows.filter(r => r.status === "pending" && r.cycleMonth === currentMonth);
    const availableRows  = rows.filter(r => r.status === "pending" && r.cycleMonth < currentMonth);

    const pendingAmount   = pendingRows.reduce((s, r) => s + (r.commissionAmount ?? 0), 0);
    const availableAmount = availableRows.reduce((s, r) => s + (r.commissionAmount ?? 0), 0);

    res.json({
      currentMonth,
      pendingAmount:    Math.round(pendingAmount * 100) / 100,
      pendingCount:     pendingRows.length,
      availableAmount:  Math.round(availableAmount * 100) / 100,
      availableCount:   availableRows.length,
      totalReferrals:   referralStats?.total ?? 0,
      buyersWhoSpent:   buyerStats?.total ?? 0,
      referralCode:     me?.referralCode ?? null,
      referralLink:     me?.referralCode ? `https://flexamarket.com/auth/register?ref=${me.referralCode}` : null,
      history:          rows.slice(0, 50).map(r => ({
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

/** POST /promo-purchase-commissions/regenerate-code
 * Force-regenerate the caller's referral code from their name.
 * Safe to call any time — generates a unique name-based code.
 */
router.post("/promo-purchase-commissions/regenerate-code", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const [me] = await db.select({ name: usersTable.name, referralCode: usersTable.referralCode })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!me) { res.status(404).json({ error: "User not found" }); return; }

    const nameBase = (n: string) => {
      const raw = String(n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/)[0].slice(0, 8);
      return raw.length >= 2 ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "Fm";
    };
    const base = nameBase(me.name ?? "");
    let newCode: string | null = null;
    for (let i = 0; i < 50; i++) {
      const candidate = base + String(Math.floor(10 + Math.random() * 90)); // 2 digits
      const [conflict] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.referralCode, candidate)).limit(1);
      if (!conflict) { newCode = candidate; break; }
    }
    if (!newCode) {
      newCode = base + Date.now().toString(36).slice(-2);
    }
    await db.update(usersTable).set({ referralCode: newCode }).where(eq(usersTable.id, userId));
    res.json({
      referralCode: newCode,
      referralLink: `https://flexamarket.com/auth/register?ref=${newCode}`,
    });
  } catch (err) {
    req.log.error({ err }, "[promo-purchase-commissions] regenerate-code failed");
    res.status(500).json({ error: "Failed to regenerate code" });
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
