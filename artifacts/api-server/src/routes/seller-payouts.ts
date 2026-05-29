import { Router } from "express";
import {
  db,
  usersTable,
  sellerPayoutAccountsTable,
  marketplaceSellerPayoutsTable,
  transactionsTable,
  listingsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireFinanceAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const MONCASH_RE = /^509\d{8}$/;

// ─── Seller: get own payout account ──────────────────────────────────────────
router.get("/seller/payout-account", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [account] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.userId, userId));
  res.json(account ?? null);
});

// ─── Seller: update MonCash payout number ────────────────────────────────────
// Saving a new number resets verification — admin must re-approve.
router.put("/seller/payout-account/moncash", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { moncashNumber } = req.body as { moncashNumber?: string };
  const num = (moncashNumber ?? "").trim();

  if (!num || !MONCASH_RE.test(num)) {
    res.status(400).json({ error: "Nimewo MonCash la dwe kòmanse pa 509 epi gen 11 chif (egzanp: 50937001234)" });
    return;
  }

  const now = new Date();
  const [existing] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.userId, userId));

  let account;
  if (existing) {
    const changed = existing.moncashNumber !== num;
    [account] = await db
      .update(sellerPayoutAccountsTable)
      .set({
        moncashNumber: num,
        moncashVerified: changed ? false : existing.moncashVerified,
        moncashVerifiedAt: changed ? null : existing.moncashVerifiedAt,
        moncashVerifiedBy: changed ? null : existing.moncashVerifiedBy,
        moncashRejectedReason: changed ? null : existing.moncashRejectedReason,
        updatedAt: now,
      })
      .where(eq(sellerPayoutAccountsTable.userId, userId))
      .returning();
  } else {
    [account] = await db
      .insert(sellerPayoutAccountsTable)
      .values({ userId, moncashNumber: num, moncashVerified: false })
      .returning();
  }

  logger.info({ userId, moncashNumber: num }, "Seller updated MonCash payout number");
  res.json(account);
});

// ─── Seller: update card payout method preference ─────────────────────────────
router.patch("/seller/payout-account/card-method", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { method } = req.body as { method?: string };

  if (method !== "fm_wallet" && method !== "stripe") {
    res.status(400).json({ error: "Metòd pa valab. Chwazi 'fm_wallet' oswa 'stripe'." });
    return;
  }

  const [existing] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.userId, userId));

  let account;
  if (existing) {
    [account] = await db
      .update(sellerPayoutAccountsTable)
      .set({ cardPayoutMethod: method, updatedAt: new Date() })
      .where(eq(sellerPayoutAccountsTable.userId, userId))
      .returning();
  } else {
    [account] = await db
      .insert(sellerPayoutAccountsTable)
      .values({ userId, cardPayoutMethod: method })
      .returning();
  }

  logger.info({ userId, method }, "Seller updated card payout method");
  res.json({ cardPayoutMethod: account.cardPayoutMethod });
});

// ─── Legacy route kept for backward compatibility ─────────────────────────────
router.put("/seller/payout-account", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { moncashNumber } = req.body as { moncashNumber?: string };
  const num = (moncashNumber ?? "").trim();

  if (!num || !MONCASH_RE.test(num)) {
    res.status(400).json({ error: "Nimewo MonCash la dwe kòmanse pa 509 epi gen 11 chif (egzanp: 50937001234)" });
    return;
  }

  const now = new Date();
  const [existing] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.userId, userId));

  let account;
  if (existing) {
    const changed = existing.moncashNumber !== num;
    [account] = await db
      .update(sellerPayoutAccountsTable)
      .set({
        moncashNumber: num,
        moncashVerified: changed ? false : existing.moncashVerified,
        moncashVerifiedAt: changed ? null : existing.moncashVerifiedAt,
        moncashVerifiedBy: changed ? null : existing.moncashVerifiedBy,
        moncashRejectedReason: changed ? null : existing.moncashRejectedReason,
        updatedAt: now,
      })
      .where(eq(sellerPayoutAccountsTable.userId, userId))
      .returning();
  } else {
    [account] = await db
      .insert(sellerPayoutAccountsTable)
      .values({ userId, moncashNumber: num, moncashVerified: false })
      .returning();
  }

  logger.info({ userId, moncashNumber: num }, "Seller updated MonCash payout number (legacy route)");
  res.json(account);
});

// ─── Seller: update bank account payout info ─────────────────────────────────
// Saving new bank details resets bank verification — admin must re-approve.
router.put("/seller/payout-account/bank", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { bankName, bankAccountName, bankAccountNumber } = req.body as {
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
  };

  const trimmed = {
    bankName: (bankName ?? "").trim(),
    bankAccountName: (bankAccountName ?? "").trim(),
    bankAccountNumber: (bankAccountNumber ?? "").trim(),
  };

  if (!trimmed.bankName) { res.status(400).json({ error: "Non bank lan obligatwa" }); return; }
  if (!trimmed.bankAccountName) { res.status(400).json({ error: "Non pwopriyetè kont lan obligatwa" }); return; }
  if (!trimmed.bankAccountNumber) { res.status(400).json({ error: "Nimewo kont labank obligatwa" }); return; }
  if (trimmed.bankAccountNumber.length < 4) { res.status(400).json({ error: "Nimewo kont labank envalid" }); return; }

  const now = new Date();
  const [existing] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.userId, userId));

  let account;
  if (existing) {
    const changed =
      existing.bankName !== trimmed.bankName ||
      existing.bankAccountName !== trimmed.bankAccountName ||
      existing.bankAccountNumber !== trimmed.bankAccountNumber;

    [account] = await db
      .update(sellerPayoutAccountsTable)
      .set({
        bankName: trimmed.bankName,
        bankAccountName: trimmed.bankAccountName,
        bankAccountNumber: trimmed.bankAccountNumber,
        bankVerified: changed ? false : existing.bankVerified,
        bankVerifiedAt: changed ? null : existing.bankVerifiedAt,
        bankVerifiedBy: changed ? null : existing.bankVerifiedBy,
        bankRejectedReason: changed ? null : existing.bankRejectedReason,
        updatedAt: now,
      })
      .where(eq(sellerPayoutAccountsTable.userId, userId))
      .returning();
  } else {
    [account] = await db
      .insert(sellerPayoutAccountsTable)
      .values({
        userId,
        bankName: trimmed.bankName,
        bankAccountName: trimmed.bankAccountName,
        bankAccountNumber: trimmed.bankAccountNumber,
        bankVerified: false,
      })
      .returning();
  }

  logger.info({ userId, bankName: trimmed.bankName }, "Seller updated bank payout account");
  res.json(account);
});

// ─── Admin: list all seller payout accounts (for verification) ───────────────
router.get("/admin/seller-payout-accounts", requireFinanceAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: sellerPayoutAccountsTable.id,
      userId: sellerPayoutAccountsTable.userId,
      moncashNumber: sellerPayoutAccountsTable.moncashNumber,
      moncashVerified: sellerPayoutAccountsTable.moncashVerified,
      moncashVerifiedAt: sellerPayoutAccountsTable.moncashVerifiedAt,
      moncashRejectedReason: sellerPayoutAccountsTable.moncashRejectedReason,
      bankName: sellerPayoutAccountsTable.bankName,
      bankAccountName: sellerPayoutAccountsTable.bankAccountName,
      bankAccountNumber: sellerPayoutAccountsTable.bankAccountNumber,
      bankVerified: sellerPayoutAccountsTable.bankVerified,
      bankVerifiedAt: sellerPayoutAccountsTable.bankVerifiedAt,
      bankRejectedReason: sellerPayoutAccountsTable.bankRejectedReason,
      updatedAt: sellerPayoutAccountsTable.updatedAt,
      sellerName: usersTable.name,
      sellerEmail: usersTable.email,
      sellerAvatar: usersTable.avatar,
    })
    .from(sellerPayoutAccountsTable)
    .innerJoin(usersTable, eq(usersTable.id, sellerPayoutAccountsTable.userId))
    .orderBy(desc(sellerPayoutAccountsTable.updatedAt));
  res.json(rows);
});

// ─── Admin: verify a seller's MonCash number ─────────────────────────────────
router.post("/admin/seller-payout-accounts/:id/verify", requireFinanceAdmin, async (req, res): Promise<void> => {
  const accountId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const adminId = req.userId!;

  const [account] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.id, accountId));
  if (!account) { res.status(404).json({ error: "Kont pa jwenn" }); return; }

  const [updated] = await db
    .update(sellerPayoutAccountsTable)
    .set({
      moncashVerified: true,
      moncashVerifiedAt: new Date(),
      moncashVerifiedBy: adminId,
      moncashRejectedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(sellerPayoutAccountsTable.id, accountId))
    .returning();

  logger.info({ accountId, adminId, moncashNumber: account.moncashNumber }, "Admin verified seller MonCash");
  res.json(updated);
});

// ─── Admin: reject a seller's MonCash number ─────────────────────────────────
router.post("/admin/seller-payout-accounts/:id/reject", requireFinanceAdmin, async (req, res): Promise<void> => {
  const accountId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const adminId = req.userId!;
  const { reason } = req.body as { reason?: string };

  const [account] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.id, accountId));
  if (!account) { res.status(404).json({ error: "Kont pa jwenn" }); return; }

  const [updated] = await db
    .update(sellerPayoutAccountsTable)
    .set({
      moncashVerified: false,
      moncashVerifiedAt: null,
      moncashVerifiedBy: null,
      moncashRejectedReason: reason?.trim() || "Rejte pa admin",
      updatedAt: new Date(),
    })
    .where(eq(sellerPayoutAccountsTable.id, accountId))
    .returning();

  logger.info({ accountId, adminId, reason }, "Admin rejected seller MonCash");
  res.json(updated);
});

// ─── Admin: verify a seller's bank account ───────────────────────────────────
router.post("/admin/seller-payout-accounts/:id/verify-bank", requireFinanceAdmin, async (req, res): Promise<void> => {
  const accountId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const adminId = req.userId!;

  const [account] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.id, accountId));
  if (!account) { res.status(404).json({ error: "Kont pa jwenn" }); return; }
  if (!account.bankAccountNumber) { res.status(400).json({ error: "Vendè sa a pa gen kont labank" }); return; }

  const [updated] = await db
    .update(sellerPayoutAccountsTable)
    .set({
      bankVerified: true,
      bankVerifiedAt: new Date(),
      bankVerifiedBy: adminId,
      bankRejectedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(sellerPayoutAccountsTable.id, accountId))
    .returning();

  logger.info({ accountId, adminId, bankName: account.bankName }, "Admin verified seller bank account");
  res.json(updated);
});

// ─── Admin: reject a seller's bank account ───────────────────────────────────
router.post("/admin/seller-payout-accounts/:id/reject-bank", requireFinanceAdmin, async (req, res): Promise<void> => {
  const accountId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const adminId = req.userId!;
  const { reason } = req.body as { reason?: string };

  const [account] = await db
    .select()
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.id, accountId));
  if (!account) { res.status(404).json({ error: "Kont pa jwenn" }); return; }

  const [updated] = await db
    .update(sellerPayoutAccountsTable)
    .set({
      bankVerified: false,
      bankVerifiedAt: null,
      bankVerifiedBy: null,
      bankRejectedReason: reason?.trim() || "Rejte pa admin",
      updatedAt: new Date(),
    })
    .where(eq(sellerPayoutAccountsTable.id, accountId))
    .returning();

  logger.info({ accountId, adminId, reason }, "Admin rejected seller bank account");
  res.json(updated);
});

// ─── Admin: list seller payouts queue ────────────────────────────────────────
router.get("/admin/seller-payouts", requireFinanceAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: marketplaceSellerPayoutsTable.id,
      transactionId: marketplaceSellerPayoutsTable.transactionId,
      sellerId: marketplaceSellerPayoutsTable.sellerId,
      grossAmount: marketplaceSellerPayoutsTable.grossAmount,
      commissionRate: marketplaceSellerPayoutsTable.commissionRate,
      commissionAmount: marketplaceSellerPayoutsTable.commissionAmount,
      netAmount: marketplaceSellerPayoutsTable.netAmount,
      paymentMethod: marketplaceSellerPayoutsTable.paymentMethod,
      payoutMoncashNumber: marketplaceSellerPayoutsTable.payoutMoncashNumber,
      status: marketplaceSellerPayoutsTable.status,
      notes: marketplaceSellerPayoutsTable.notes,
      paidAt: marketplaceSellerPayoutsTable.paidAt,
      createdAt: marketplaceSellerPayoutsTable.createdAt,
      sellerName: usersTable.name,
      sellerEmail: usersTable.email,
      sellerAvatar: usersTable.avatar,
      listingTitle: listingsTable.title,
    })
    .from(marketplaceSellerPayoutsTable)
    .innerJoin(usersTable, eq(usersTable.id, marketplaceSellerPayoutsTable.sellerId))
    .leftJoin(transactionsTable, eq(transactionsTable.id, marketplaceSellerPayoutsTable.transactionId))
    .leftJoin(listingsTable, eq(listingsTable.id, transactionsTable.listingId))
    .orderBy(desc(marketplaceSellerPayoutsTable.createdAt));
  res.json(rows);
});

// ─── Admin: mark a seller payout as paid ─────────────────────────────────────
router.post("/admin/seller-payouts/:id/mark-paid", requireFinanceAdmin, async (req, res): Promise<void> => {
  const payoutId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const adminId = req.userId!;
  const { notes } = req.body as { notes?: string };

  const [payout] = await db
    .select()
    .from(marketplaceSellerPayoutsTable)
    .where(eq(marketplaceSellerPayoutsTable.id, payoutId));

  if (!payout) { res.status(404).json({ error: "Peman pa jwenn" }); return; }
  if (payout.status === "paid") { res.status(400).json({ error: "Peman sa a deja make kòm peye" }); return; }

  const [updated] = await db
    .update(marketplaceSellerPayoutsTable)
    .set({
      status: "paid",
      paidAt: new Date(),
      paidByAdminId: adminId,
      notes: notes?.trim() || null,
    })
    .where(eq(marketplaceSellerPayoutsTable.id, payoutId))
    .returning();

  logger.info({ payoutId, adminId, sellerId: payout.sellerId, netAmount: payout.netAmount }, "Admin marked seller payout paid");
  res.json(updated);
});

// ─── Admin: seller payout stats ──────────────────────────────────────────────
router.get("/admin/seller-payouts/stats", requireFinanceAdmin, async (_req, res): Promise<void> => {
  const [stats] = await db
    .select({
      totalPending: sql<number>`coalesce(count(*) filter (where ${marketplaceSellerPayoutsTable.status} = 'pending'), 0)::int`,
      totalPaid: sql<number>`coalesce(count(*) filter (where ${marketplaceSellerPayoutsTable.status} = 'paid'), 0)::int`,
      pendingAmount: sql<number>`coalesce(sum(${marketplaceSellerPayoutsTable.netAmount}) filter (where ${marketplaceSellerPayoutsTable.status} = 'pending'), 0)::float`,
      paidAmount: sql<number>`coalesce(sum(${marketplaceSellerPayoutsTable.netAmount}) filter (where ${marketplaceSellerPayoutsTable.status} = 'paid'), 0)::float`,
      totalCommission: sql<number>`coalesce(sum(${marketplaceSellerPayoutsTable.commissionAmount}), 0)::float`,
    })
    .from(marketplaceSellerPayoutsTable);
  res.json(stats);
});

export default router;
