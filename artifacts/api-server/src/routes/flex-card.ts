import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  promoWalletTable,
  walletTransactionsTable,
  notificationsTable,
  flexCardDebtsTable,
  flexCardRepaymentsTable,
} from "@workspace/db";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireFinanceAdmin } from "../middlewares/auth";
import { logAdminAction } from "../lib/auditLogger";

const router: IRouter = Router();

const VALID_REASONS = [
  "debt",
  "merchant_complaint",
  "chargeback",
  "fraud_investigation",
  "policy_violation",
  "manual_review",
  "other",
] as const;

function genReference(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `FCD-${year}-${rand}`;
}

async function getActiveDebt(userId: number) {
  const [debt] = await db
    .select()
    .from(flexCardDebtsTable)
    .where(and(eq(flexCardDebtsTable.userId, userId), eq(flexCardDebtsTable.status, "active")));
  return debt ?? null;
}

async function notify(userId: number, actorId: number, type: string, message: string) {
  try {
    await db.insert(notificationsTable).values({ userId, actorId, type, message });
  } catch {
    /* non-fatal */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: block / adjust / unblock / status
// ─────────────────────────────────────────────────────────────────────────────

// Block a user's Flex Card for debt — WITHOUT suspending their account.
router.post("/admin/flex-card/block", requireFinanceAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.body?.userId);
  const reason = String(req.body?.reason ?? "debt");
  const amountUsd = Number(req.body?.amountUsd);
  const notes = req.body?.notes ? String(req.body.notes) : null;
  const deadline = req.body?.deadline ? new Date(req.body.deadline) : null;

  if (!Number.isFinite(userId) || userId <= 0) { res.status(400).json({ error: "userId is required" }); return; }
  if (!VALID_REASONS.includes(reason as any)) { res.status(400).json({ error: "Invalid reason" }); return; }
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) { res.status(400).json({ error: "amountUsd must be greater than 0" }); return; }
  if (deadline && isNaN(deadline.getTime())) { res.status(400).json({ error: "Invalid deadline" }); return; }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const referenceCode = genReference();
  let debt;
  try {
    debt = await db.transaction(async (tx) => {
      // Lock any existing active debt for this user so two concurrent blocks
      // cannot both pass the check. The partial unique index is the hard guard.
      const [existing] = await tx
        .select()
        .from(flexCardDebtsTable)
        .where(and(eq(flexCardDebtsTable.userId, userId), eq(flexCardDebtsTable.status, "active")))
        .for("update");
      if (existing) throw new Error("ALREADY_BLOCKED");

      const [created] = await tx
        .insert(flexCardDebtsTable)
        .values({
          userId,
          adminId: req.userId ?? null,
          reason,
          referenceCode,
          originalAmountUsd: amountUsd,
          outstandingUsd: amountUsd,
          notes,
          deadline,
          status: "active",
        })
        .returning();

      await tx.update(usersTable)
        .set({ flexCardBlocked: true, flexCardDebtUsd: amountUsd })
        .where(eq(usersTable.id, userId));

      return created;
    });
  } catch (e: any) {
    if (e?.message === "ALREADY_BLOCKED" || /unique|duplicate/i.test(e?.message ?? "")) {
      const current = await getActiveDebt(userId);
      res.status(409).json({ error: "User's Flex Card is already blocked", debt: current });
      return;
    }
    throw e;
  }

  await notify(userId, req.userId!, "flex_card_blocked",
    `Flex Card ou bloke pou yon dèt de $${amountUsd.toFixed(2)}. Referans: ${referenceCode}. Ale nan paj Ranbousman an pou peye.`);

  await logAdminAction(req, {
    actionType: "flex_card_block",
    actionCategory: "wallet",
    description: `Blocked Flex Card for user #${userId} — debt $${amountUsd.toFixed(2)} (${reason})`,
    targetType: "user",
    targetId: userId,
    targetName: target.name,
    afterState: { reason, amountUsd, referenceCode, deadline },
    metadata: { notes },
    riskLevel: "high",
  });

  res.json({ ok: true, debt });
});

// Adjust the outstanding amount of an active debt. Setting it to 0 clears & unblocks.
router.post("/admin/flex-card/adjust", requireFinanceAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.body?.userId);
  const outstandingUsd = Number(req.body?.outstandingUsd);
  const notes = req.body?.notes ? String(req.body.notes) : null;

  if (!Number.isFinite(userId) || userId <= 0) { res.status(400).json({ error: "userId is required" }); return; }
  if (!Number.isFinite(outstandingUsd) || outstandingUsd < 0) { res.status(400).json({ error: "outstandingUsd must be >= 0" }); return; }

  const debt = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(flexCardDebtsTable)
      .where(and(eq(flexCardDebtsTable.userId, userId), eq(flexCardDebtsTable.status, "active")))
      .for("update");
    if (!locked) return null;

    if (outstandingUsd <= 0.001) {
      await tx.update(flexCardDebtsTable)
        .set({ outstandingUsd: 0, status: "cleared", clearedAt: new Date(), notes: notes ?? locked.notes })
        .where(eq(flexCardDebtsTable.id, locked.id));
      await tx.update(usersTable)
        .set({ flexCardBlocked: false, flexCardDebtUsd: 0 })
        .where(eq(usersTable.id, userId));
    } else {
      await tx.update(flexCardDebtsTable)
        .set({ outstandingUsd, notes: notes ?? locked.notes })
        .where(eq(flexCardDebtsTable.id, locked.id));
      await tx.update(usersTable)
        .set({ flexCardDebtUsd: outstandingUsd })
        .where(eq(usersTable.id, userId));
    }
    return locked;
  });

  if (!debt) { res.status(404).json({ error: "No active Flex Card block for this user" }); return; }

  if (outstandingUsd <= 0.001) {
    await notify(userId, req.userId!, "flex_card_cleared", "Bon nouvèl! Flex Card ou debloke. Ou ka itilize tout sèvis yo ankò.");
  }

  await logAdminAction(req, {
    actionType: "flex_card_adjust",
    actionCategory: "wallet",
    description: `Adjusted Flex Card debt for user #${userId}: $${debt.outstandingUsd.toFixed(2)} -> $${outstandingUsd.toFixed(2)}`,
    targetType: "user",
    targetId: userId,
    beforeState: { outstandingUsd: debt.outstandingUsd },
    afterState: { outstandingUsd },
    metadata: { notes },
    riskLevel: "high",
  });

  res.json({ ok: true, outstandingUsd });
});

// Manually unblock (clear) a user's Flex Card debt.
router.post("/admin/flex-card/unblock", requireFinanceAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.body?.userId);
  if (!Number.isFinite(userId) || userId <= 0) { res.status(400).json({ error: "userId is required" }); return; }

  const debt = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(flexCardDebtsTable)
      .where(and(eq(flexCardDebtsTable.userId, userId), eq(flexCardDebtsTable.status, "active")))
      .for("update");
    if (!locked) return null;

    await tx.update(flexCardDebtsTable)
      .set({ outstandingUsd: 0, status: "cleared", clearedAt: new Date() })
      .where(eq(flexCardDebtsTable.id, locked.id));
    await tx.update(usersTable)
      .set({ flexCardBlocked: false, flexCardDebtUsd: 0 })
      .where(eq(usersTable.id, userId));
    return locked;
  });

  if (!debt) { res.status(404).json({ error: "No active Flex Card block for this user" }); return; }

  await notify(userId, req.userId!, "flex_card_cleared", "Flex Card ou debloke pa yon administratè. Ou ka itilize tout sèvis yo ankò.");

  await logAdminAction(req, {
    actionType: "flex_card_unblock",
    actionCategory: "wallet",
    description: `Manually unblocked Flex Card for user #${userId} (forgave $${debt.outstandingUsd.toFixed(2)})`,
    targetType: "user",
    targetId: userId,
    beforeState: { outstandingUsd: debt.outstandingUsd, status: "active" },
    afterState: { outstandingUsd: 0, status: "cleared" },
    riskLevel: "high",
  });

  res.json({ ok: true });
});

// Admin: list every user that has a Flex Card debt (defaults to active blocks),
// powering the debt-management dashboard. Joins the user record and the latest
// repayment so each row renders name, outstanding, original, reference, deadline
// & last payment without an N+1 fetch per row.
router.get("/admin/flex-card", requireFinanceAdmin, async (req, res): Promise<void> => {
  const status = String(req.query.status ?? "active");
  const allowed = ["active", "cleared", "all"] as const;
  if (!allowed.includes(status as any)) { res.status(400).json({ error: "Invalid status" }); return; }

  const rows = await db
    .select({
      debtId: flexCardDebtsTable.id,
      userId: flexCardDebtsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userPhone: usersTable.phone,
      userAvatar: usersTable.avatar,
      reason: flexCardDebtsTable.reason,
      referenceCode: flexCardDebtsTable.referenceCode,
      originalAmountUsd: flexCardDebtsTable.originalAmountUsd,
      outstandingUsd: flexCardDebtsTable.outstandingUsd,
      notes: flexCardDebtsTable.notes,
      deadline: flexCardDebtsTable.deadline,
      status: flexCardDebtsTable.status,
      blockedAt: flexCardDebtsTable.blockedAt,
      clearedAt: flexCardDebtsTable.clearedAt,
    })
    .from(flexCardDebtsTable)
    .innerJoin(usersTable, eq(usersTable.id, flexCardDebtsTable.userId))
    .where(status === "all" ? undefined : eq(flexCardDebtsTable.status, status))
    .orderBy(desc(flexCardDebtsTable.outstandingUsd), desc(flexCardDebtsTable.blockedAt));

  // Latest repayment per debt — one batched query, mapped in memory.
  const debtIds = rows.map((r) => r.debtId);
  const lastByDebt = new Map<number, { amountUsd: number; createdAt: Date }>();
  if (debtIds.length) {
    const reps = await db
      .select()
      .from(flexCardRepaymentsTable)
      .where(inArray(flexCardRepaymentsTable.debtId, debtIds))
      .orderBy(desc(flexCardRepaymentsTable.createdAt));
    for (const rp of reps) {
      if (!lastByDebt.has(rp.debtId)) lastByDebt.set(rp.debtId, { amountUsd: rp.amountUsd, createdAt: rp.createdAt });
    }
  }

  const items = rows.map((r) => {
    const last = lastByDebt.get(r.debtId) ?? null;
    const repaidUsd = Math.max(0, Math.round((r.originalAmountUsd - r.outstandingUsd) * 100) / 100);
    return {
      ...r,
      repaidUsd,
      lastRepaymentUsd: last?.amountUsd ?? null,
      lastRepaymentAt: last?.createdAt ?? null,
    };
  });

  const totalOutstandingUsd =
    Math.round(items.reduce((s, i) => s + (i.status === "active" ? i.outstandingUsd : 0), 0) * 100) / 100;

  res.json({ items, total: items.length, totalOutstandingUsd });
});

// Admin: view a user's debt status + history.
router.get("/admin/flex-card/:userId", requireFinanceAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) { res.status(400).json({ error: "Invalid userId" }); return; }

  const active = await getActiveDebt(userId);
  const debts = await db.select().from(flexCardDebtsTable)
    .where(eq(flexCardDebtsTable.userId, userId))
    .orderBy(desc(flexCardDebtsTable.createdAt));
  const repayments = await db.select().from(flexCardRepaymentsTable)
    .where(eq(flexCardRepaymentsTable.userId, userId))
    .orderBy(desc(flexCardRepaymentsTable.createdAt));

  res.json({ blocked: !!active, active, debts, repayments });
});

// ─────────────────────────────────────────────────────────────────────────────
// USER: status + repayment (repayment is the ONE allowed outgoing while blocked)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/flex-card/me", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const debt = await getActiveDebt(userId);
  const repayments = await db.select().from(flexCardRepaymentsTable)
    .where(eq(flexCardRepaymentsTable.userId, userId))
    .orderBy(desc(flexCardRepaymentsTable.createdAt))
    .limit(50);
  const [wallet] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.userId, userId));

  res.json({
    blocked: !!debt,
    debt: debt
      ? {
          referenceCode: debt.referenceCode,
          reason: debt.reason,
          originalAmountUsd: debt.originalAmountUsd,
          outstandingUsd: debt.outstandingUsd,
          deadline: debt.deadline,
          notes: debt.notes,
          blockedAt: debt.blockedAt,
        }
      : null,
    repayments,
    walletBalanceUsd: wallet?.balanceUsd ?? 0,
  });
});

// Repay the debt from the FM wallet balance. Auto-unblocks when it reaches 0.
router.post("/flex-card/repay", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const requested = Number(req.body?.amountUsd);
  if (!Number.isFinite(requested) || requested <= 0) { res.status(400).json({ error: "amountUsd must be greater than 0" }); return; }

  // Everything that touches money runs inside a single DB transaction with
  // row-level locks (FOR UPDATE) on the debt row AND the wallet row, so that
  // concurrent repayments serialize instead of double-charging the wallet
  // against a stale outstanding balance.
  const outcome = await db.transaction(async (tx) => {
    const [debt] = await tx
      .select()
      .from(flexCardDebtsTable)
      .where(and(eq(flexCardDebtsTable.userId, userId), eq(flexCardDebtsTable.status, "active")))
      .for("update");
    if (!debt) return { code: "NO_ACTIVE_DEBT" as const };

    // Never overpay — clamp to the (freshly locked) outstanding balance.
    let pay = Math.min(requested, debt.outstandingUsd);
    pay = Math.round(pay * 100) / 100;
    if (pay <= 0) return { code: "NOTHING_TO_REPAY" as const };

    const [wallet] = await tx
      .select()
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, userId))
      .for("update");
    if (!wallet || wallet.balanceUsd < pay - 0.001) {
      return { code: "INSUFFICIENT_FUNDS" as const, walletBalanceUsd: wallet?.balanceUsd ?? 0 };
    }

    await tx.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${pay}`, updatedAt: new Date() })
      .where(eq(promoWalletTable.userId, userId));

    const outstandingAfter = Math.round((debt.outstandingUsd - pay) * 100) / 100;
    const cleared = outstandingAfter <= 0.001;

    await tx.insert(walletTransactionsTable).values({
      userId,
      type: "flex_card_repayment",
      amountUsd: -pay,
      status: "completed",
      note: `Flex Card debt repayment (${debt.referenceCode})`,
    });

    await tx.insert(flexCardRepaymentsTable).values({
      debtId: debt.id,
      userId,
      amountUsd: pay,
      outstandingAfterUsd: cleared ? 0 : outstandingAfter,
      source: "fm_wallet",
    });

    if (cleared) {
      await tx.update(flexCardDebtsTable)
        .set({ outstandingUsd: 0, status: "cleared", clearedAt: new Date() })
        .where(eq(flexCardDebtsTable.id, debt.id));
      await tx.update(usersTable)
        .set({ flexCardBlocked: false, flexCardDebtUsd: 0 })
        .where(eq(usersTable.id, userId));
    } else {
      await tx.update(flexCardDebtsTable)
        .set({ outstandingUsd: outstandingAfter })
        .where(eq(flexCardDebtsTable.id, debt.id));
      await tx.update(usersTable)
        .set({ flexCardDebtUsd: outstandingAfter })
        .where(eq(usersTable.id, userId));
    }

    return { code: "OK" as const, debt, pay, outstandingAfter, cleared };
  });

  if (outcome.code === "NO_ACTIVE_DEBT") { res.status(400).json({ error: "No active Flex Card debt to repay", code: "NO_ACTIVE_DEBT" }); return; }
  if (outcome.code === "NOTHING_TO_REPAY") { res.status(400).json({ error: "Nothing left to repay" }); return; }
  if (outcome.code === "INSUFFICIENT_FUNDS") {
    res.status(400).json({ error: "Insufficient FM wallet balance", code: "INSUFFICIENT_FUNDS", walletBalanceUsd: outcome.walletBalanceUsd });
    return;
  }

  // Notifications + audit run after commit (non-critical, must not roll back money).
  if (outcome.cleared) {
    await notify(userId, userId, "flex_card_cleared", "Bon nouvèl! Ou peye tout dèt la. Flex Card ou debloke — ou ka depanse, voye ak retire lajan ankò.");
    await logAdminAction(req, {
      actionType: "flex_card_repaid_cleared",
      actionCategory: "wallet",
      description: `User #${userId} fully repaid Flex Card debt ${outcome.debt.referenceCode} — auto-unblocked`,
      targetType: "user",
      targetId: userId,
      afterState: { outstandingUsd: 0, status: "cleared" },
      riskLevel: "medium",
    });
  } else {
    await logAdminAction(req, {
      actionType: "flex_card_repayment",
      actionCategory: "wallet",
      description: `User #${userId} repaid $${outcome.pay.toFixed(2)} toward Flex Card debt ${outcome.debt.referenceCode}`,
      targetType: "user",
      targetId: userId,
      beforeState: { outstandingUsd: outcome.debt.outstandingUsd },
      afterState: { outstandingUsd: outcome.outstandingAfter },
      riskLevel: "low",
    });
  }

  res.json({ ok: true, amountPaid: outcome.pay, outstandingUsd: outcome.cleared ? 0 : outcome.outstandingAfter, cleared: outcome.cleared });
});

export default router;
