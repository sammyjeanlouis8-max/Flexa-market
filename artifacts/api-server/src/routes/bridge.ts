import { Router } from "express";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import {
  crossAppWalletTransfersTable,
  db,
  promoWalletTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db";
import { decodeBridgeUserId, encodeBridgeUserId, isWholesaleCreditSource, requireBridgeHmac } from "../lib/bridge";

const router = Router();
router.use("/bridge/v1", requireBridgeHmac);

router.post("/bridge/v1/users/search", async (req, res): Promise<void> => {
  const query = String(req.body?.query ?? "").trim();
  const keys = Object.keys(req.body ?? {});
  if (req.body?.source_app !== "wholesale" || keys.length !== 2 || !keys.every((key) => key === "query" || key === "source_app")
    || query.length < 2 || query.length > 100) {
    res.status(400).json({ error: "Query must contain 2 to 100 characters" });
    return;
  }
  const rows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    avatar: usersTable.avatar,
    country: usersTable.country,
  }).from(usersTable).where(or(
    ilike(usersTable.name, `%${query}%`),
    ilike(usersTable.email, `%${query}%`),
    ilike(usersTable.phone, `%${query}%`),
  )).limit(10);
  res.json({ users: rows.map((row) => ({ ...row, id: encodeBridgeUserId(row.id) })) });
});

router.post("/bridge/v1/wallet/credits", async (req, res): Promise<void> => {
  const idempotencyKey = req.header("X-Flexa-Idempotency-Key")!;
  const sourceApp = String(req.body?.source_app ?? "");
  const destinationUserId = String(req.body?.destination_user_id ?? "");
  const sourceUserId = String(req.body?.source_user_id ?? "");
  const amountCents = req.body?.amount_cents;
  const note = req.body?.note === null ? null : typeof req.body?.note === "string" ? req.body.note.slice(0, 200) : undefined;
  const keys = Object.keys(req.body ?? {});
  const netAmountUsd = typeof amountCents === "number" && Number.isSafeInteger(amountCents) ? amountCents / 100 : NaN;
  const userId = decodeBridgeUserId(destinationUserId);
  if (!isWholesaleCreditSource(req.body) || sourceApp !== "wholesale" || !userId || !sourceUserId
    || !Number.isSafeInteger(amountCents) || amountCents <= 0 || note === undefined || keys.length !== 5
    || !["destination_user_id", "source_user_id", "amount_cents", "source_app", "note"].every((key) => keys.includes(key))) {
    res.status(400).json({ error: "Invalid credit payload" });
    return;
  }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [created] = await tx.insert(crossAppWalletTransfersTable).values({
      idempotencyKey,
      sourceApp: "wholesale",
      destinationApp: "market",
      sourceUserId,
      destinationUserId,
      localUserId: userId,
      amountCents,
      feeCents: 0,
      netCents: amountCents,
      status: "pending",
      direction: "incoming",
    }).onConflictDoNothing({ target: crossAppWalletTransfersTable.idempotencyKey }).returning();

    if (!created) {
      const [existing] = await tx.select().from(crossAppWalletTransfersTable)
        .where(eq(crossAppWalletTransfersTable.idempotencyKey, idempotencyKey)).limit(1);
      if (!existing || existing.direction !== "incoming" || existing.destinationUserId !== destinationUserId
        || existing.sourceUserId !== sourceUserId || existing.netCents !== amountCents) {
        throw new Error("IDEMPOTENCY_CONFLICT");
      }
      return { transfer: existing, duplicate: true };
    }

    await tx.insert(promoWalletTable).values({
      userId,
      balanceUsd: netAmountUsd,
      promoBalance: 0,
      unlockedBalance: 0,
    }).onConflictDoUpdate({
      target: promoWalletTable.userId,
      set: { balanceUsd: sql`${promoWalletTable.balanceUsd} + ${netAmountUsd}`, updatedAt: new Date() },
    });
    await tx.insert(walletTransactionsTable).values({
      userId,
      type: "cross_app_transfer_credit",
      amountUsd: netAmountUsd,
      paymentRef: `bridge:${idempotencyKey}`,
      status: "completed",
      note: note ?? "Flexa Wholesale wallet transfer",
    });
    const [completed] = await tx.update(crossAppWalletTransfersTable).set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(crossAppWalletTransfersTable.id, created.id),
      eq(crossAppWalletTransfersTable.status, "pending"),
    )).returning();
    return { transfer: completed, duplicate: false };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return null;
    throw error;
  });

  if (!result) {
    res.status(409).json({ error: "Idempotency key was already used for another credit" });
    return;
  }
  res.status(result.duplicate ? 200 : 201).json({
    transfer_id: String(result.transfer.id),
    status: result.transfer.status,
    duplicate: result.duplicate,
  });
});

export default router;