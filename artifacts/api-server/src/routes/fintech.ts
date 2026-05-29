import { Router } from "express";
import { db, usersTable, fintechVendorsTable, fintechOrdersTable, fintechPayoutsTable } from "@workspace/db";
import { eq, sql, sum, count } from "drizzle-orm";
import { requireAuth, requireFinanceAdmin } from "../middlewares/auth";

const router = Router();

const COMMISSION_RATE = 0.10;

const MONCASH_RE = /^509\d{8}$/;

// ─── Public: list vendors (for customer order form) ───────────────────────────
router.get("/fintech/vendors", async (req, res) => {
  const vendors = await db
    .select({
      id: fintechVendorsTable.id,
      userId: fintechVendorsTable.userId,
      moncashNumber: fintechVendorsTable.moncashNumber,
      moncashConfirmed: fintechVendorsTable.moncashConfirmed,
      balance: fintechVendorsTable.balance,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(fintechVendorsTable)
    .innerJoin(usersTable, eq(usersTable.id, fintechVendorsTable.userId));
  res.json(vendors);
});

// ─── Vendor: my profile ───────────────────────────────────────────────────────
router.get("/fintech/vendor/me", requireAuth, async (req, res) => {
  const userId = req.userId!;
  let [vendor] = await db
    .select({
      id: fintechVendorsTable.id,
      userId: fintechVendorsTable.userId,
      moncashNumber: fintechVendorsTable.moncashNumber,
      moncashConfirmed: fintechVendorsTable.moncashConfirmed,
      balance: fintechVendorsTable.balance,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(fintechVendorsTable)
    .innerJoin(usersTable, eq(usersTable.id, fintechVendorsTable.userId))
    .where(eq(fintechVendorsTable.userId, userId));

  if (!vendor) {
    const [inserted] = await db
      .insert(fintechVendorsTable)
      .values({ userId })
      .returning();
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    vendor = {
      id: inserted.id,
      userId: inserted.userId,
      moncashNumber: inserted.moncashNumber ?? null,
      moncashConfirmed: inserted.moncashConfirmed,
      balance: inserted.balance,
      name: u.name,
      email: u.email,
    };
  }

  res.json(vendor);
});

// ─── Vendor: update MonCash number ───────────────────────────────────────────
router.put("/fintech/vendor/me", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { moncashNumber } = req.body as { moncashNumber?: string };

  if (!moncashNumber || !MONCASH_RE.test(moncashNumber)) {
    res.status(400).json({ error: "Nimewo MonCash la dwe kòmanse pa 509 epi gen 11 chif" });
    return;
  }

  let [vendor] = await db
    .select()
    .from(fintechVendorsTable)
    .where(eq(fintechVendorsTable.userId, userId));

  if (!vendor) {
    [vendor] = await db
      .insert(fintechVendorsTable)
      .values({ userId, moncashNumber, moncashConfirmed: true })
      .returning();
  } else {
    [vendor] = await db
      .update(fintechVendorsTable)
      .set({ moncashNumber, moncashConfirmed: true })
      .where(eq(fintechVendorsTable.userId, userId))
      .returning();
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.json({ ...vendor, name: u.name, email: u.email });
});

// ─── Vendor: stats ────────────────────────────────────────────────────────────
router.get("/fintech/vendor/stats", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const [vendor] = await db
    .select()
    .from(fintechVendorsTable)
    .where(eq(fintechVendorsTable.userId, userId));

  if (!vendor) {
    res.json({ totalEarnings: 0, pendingBalance: 0, paidOut: 0, totalOrders: 0 });
    return;
  }

  const [orderStats] = await db
    .select({
      totalEarnings: sql<number>`coalesce(sum(${fintechOrdersTable.vendorEarnings}), 0)`,
      totalOrders: count(fintechOrdersTable.id),
    })
    .from(fintechOrdersTable)
    .where(eq(fintechOrdersTable.vendorId, vendor.id));

  const [payoutStats] = await db
    .select({
      paidOut: sql<number>`coalesce(sum(${fintechPayoutsTable.amount}), 0)`,
    })
    .from(fintechPayoutsTable)
    .where(eq(fintechPayoutsTable.vendorId, vendor.id));

  res.json({
    totalEarnings: orderStats?.totalEarnings ?? 0,
    pendingBalance: vendor.balance,
    paidOut: payoutStats?.paidOut ?? 0,
    totalOrders: orderStats?.totalOrders ?? 0,
  });
});

// ─── Vendor: orders ───────────────────────────────────────────────────────────
router.get("/fintech/vendor/orders", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const [vendor] = await db
    .select()
    .from(fintechVendorsTable)
    .where(eq(fintechVendorsTable.userId, userId));

  if (!vendor) { res.json([]); return; }

  const customerAlias = db.$with("customer").as(
    db.select().from(usersTable)
  );

  const orders = await db
    .select({
      id: fintechOrdersTable.id,
      vendorId: fintechOrdersTable.vendorId,
      vendorName: usersTable.name,
      customerId: fintechOrdersTable.customerId,
      customerName: sql<string>`(select name from users where id = ${fintechOrdersTable.customerId})`,
      amount: fintechOrdersTable.amount,
      description: fintechOrdersTable.description,
      status: fintechOrdersTable.status,
      adminCommission: fintechOrdersTable.adminCommission,
      vendorEarnings: fintechOrdersTable.vendorEarnings,
      createdAt: fintechOrdersTable.createdAt,
    })
    .from(fintechOrdersTable)
    .innerJoin(fintechVendorsTable, eq(fintechVendorsTable.id, fintechOrdersTable.vendorId))
    .innerJoin(usersTable, eq(usersTable.id, fintechVendorsTable.userId))
    .where(eq(fintechOrdersTable.vendorId, vendor.id))
    .orderBy(sql`${fintechOrdersTable.createdAt} desc`);

  res.json(orders);
});

// ─── Vendor: payouts ─────────────────────────────────────────────────────────
router.get("/fintech/vendor/payouts", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const [vendor] = await db
    .select()
    .from(fintechVendorsTable)
    .where(eq(fintechVendorsTable.userId, userId));

  if (!vendor) { res.json([]); return; }

  const payouts = await db
    .select({
      id: fintechPayoutsTable.id,
      vendorId: fintechPayoutsTable.vendorId,
      vendorName: usersTable.name,
      moncashNumber: fintechVendorsTable.moncashNumber,
      amount: fintechPayoutsTable.amount,
      status: fintechPayoutsTable.status,
      notes: fintechPayoutsTable.notes,
      createdAt: fintechPayoutsTable.createdAt,
      paidAt: fintechPayoutsTable.paidAt,
    })
    .from(fintechPayoutsTable)
    .innerJoin(fintechVendorsTable, eq(fintechVendorsTable.id, fintechPayoutsTable.vendorId))
    .innerJoin(usersTable, eq(usersTable.id, fintechVendorsTable.userId))
    .where(eq(fintechPayoutsTable.vendorId, vendor.id))
    .orderBy(sql`${fintechPayoutsTable.createdAt} desc`);

  res.json(payouts);
});

// ─── Customer: list my orders ─────────────────────────────────────────────────
router.get("/fintech/orders", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const orders = await db
    .select({
      id: fintechOrdersTable.id,
      vendorId: fintechOrdersTable.vendorId,
      vendorName: usersTable.name,
      customerId: fintechOrdersTable.customerId,
      customerName: sql<string>`(select name from users where id = ${fintechOrdersTable.customerId})`,
      amount: fintechOrdersTable.amount,
      description: fintechOrdersTable.description,
      status: fintechOrdersTable.status,
      adminCommission: fintechOrdersTable.adminCommission,
      vendorEarnings: fintechOrdersTable.vendorEarnings,
      createdAt: fintechOrdersTable.createdAt,
    })
    .from(fintechOrdersTable)
    .innerJoin(fintechVendorsTable, eq(fintechVendorsTable.id, fintechOrdersTable.vendorId))
    .innerJoin(usersTable, eq(usersTable.id, fintechVendorsTable.userId))
    .where(eq(fintechOrdersTable.customerId, userId))
    .orderBy(sql`${fintechOrdersTable.createdAt} desc`);

  res.json(orders);
});

// ─── Customer: place order ────────────────────────────────────────────────────
router.post("/fintech/orders", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { vendorId, amount, description } = req.body as {
    vendorId: number; amount: number; description?: string;
  };

  if (!vendorId || !amount || amount <= 0) {
    res.status(400).json({ error: "vendorId ak amount obligatwa" });
    return;
  }

  const [vendor] = await db
    .select()
    .from(fintechVendorsTable)
    .where(eq(fintechVendorsTable.id, vendorId));

  if (!vendor) {
    res.status(404).json({ error: "Vandè pa jwenn" });
    return;
  }

  const adminCommission = Math.round(amount * COMMISSION_RATE * 100) / 100;
  const vendorEarnings = Math.round((amount - adminCommission) * 100) / 100;

  const [order] = await db
    .insert(fintechOrdersTable)
    .values({
      customerId: userId,
      vendorId,
      amount,
      description: description ?? null,
      status: "pending",
      adminCommission,
      vendorEarnings,
    })
    .returning();

  const [vendorUser] = await db.select().from(usersTable).where(eq(usersTable.id, vendor.userId));
  const [customerUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  res.status(201).json({
    ...order,
    vendorName: vendorUser?.name ?? "",
    customerName: customerUser?.name ?? "",
  });
});

// ─── Complete order (finance admin) ──────────────────────────────────────────
router.post("/fintech/orders/:id/complete", requireFinanceAdmin, async (req, res) => {

  const orderId = parseInt(req.params.id);
  const [order] = await db
    .select()
    .from(fintechOrdersTable)
    .where(eq(fintechOrdersTable.id, orderId));

  if (!order) { res.status(404).json({ error: "Kòmand pa jwenn" }); return; }
  if (order.status === "completed") { res.status(400).json({ error: "Kòmand deja konplète" }); return; }

  const [updated] = await db
    .update(fintechOrdersTable)
    .set({ status: "completed" })
    .where(eq(fintechOrdersTable.id, orderId))
    .returning();

  // Credit vendor balance
  await db
    .update(fintechVendorsTable)
    .set({ balance: sql`${fintechVendorsTable.balance} + ${order.vendorEarnings}` })
    .where(eq(fintechVendorsTable.id, order.vendorId));

  const [vendor] = await db.select().from(fintechVendorsTable).where(eq(fintechVendorsTable.id, order.vendorId));
  const [vendorUser] = await db.select().from(usersTable).where(eq(usersTable.id, vendor.userId));
  const [customerUser] = await db.select().from(usersTable).where(eq(usersTable.id, order.customerId));

  res.json({ ...updated, vendorName: vendorUser?.name ?? "", customerName: customerUser?.name ?? "" });
});

// ─── Admin: stats ─────────────────────────────────────────────────────────────
router.get("/fintech/admin/stats", requireFinanceAdmin, async (req, res) => {

  const [vendorCount] = await db.select({ c: count() }).from(fintechVendorsTable);
  const [orderStats] = await db
    .select({
      totalOrders: count(fintechOrdersTable.id),
      totalRevenue: sql<number>`coalesce(sum(${fintechOrdersTable.amount}), 0)`,
      totalCommission: sql<number>`coalesce(sum(${fintechOrdersTable.adminCommission}), 0)`,
    })
    .from(fintechOrdersTable);
  const [payoutStats] = await db
    .select({
      pendingPayouts: sql<number>`coalesce(sum(${fintechPayoutsTable.amount}) filter (where ${fintechPayoutsTable.status} = 'pending'), 0)`,
      paidPayouts: sql<number>`coalesce(sum(${fintechPayoutsTable.amount}) filter (where ${fintechPayoutsTable.status} = 'paid'), 0)`,
    })
    .from(fintechPayoutsTable);

  res.json({
    totalVendors: vendorCount?.c ?? 0,
    totalOrders: orderStats?.totalOrders ?? 0,
    totalRevenue: orderStats?.totalRevenue ?? 0,
    totalCommission: orderStats?.totalCommission ?? 0,
    pendingPayouts: payoutStats?.pendingPayouts ?? 0,
    paidPayouts: payoutStats?.paidPayouts ?? 0,
  });
});

// ─── Admin: list all vendors ──────────────────────────────────────────────────
router.get("/fintech/admin/vendors", requireFinanceAdmin, async (req, res) => {

  const vendors = await db
    .select({
      id: fintechVendorsTable.id,
      userId: fintechVendorsTable.userId,
      moncashNumber: fintechVendorsTable.moncashNumber,
      moncashConfirmed: fintechVendorsTable.moncashConfirmed,
      balance: fintechVendorsTable.balance,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(fintechVendorsTable)
    .innerJoin(usersTable, eq(usersTable.id, fintechVendorsTable.userId))
    .orderBy(sql`${fintechVendorsTable.balance} desc`);

  res.json(vendors);
});

// ─── Admin: pay vendor ────────────────────────────────────────────────────────
router.post("/fintech/admin/vendors/:id/pay", requireFinanceAdmin, async (req, res) => {

  const vendorId = parseInt(req.params.id);
  const { notes } = req.body as { notes?: string };

  const [vendor] = await db
    .select()
    .from(fintechVendorsTable)
    .where(eq(fintechVendorsTable.id, vendorId));

  if (!vendor) { res.status(404).json({ error: "Vandè pa jwenn" }); return; }
  if (vendor.balance <= 0) { res.status(400).json({ error: "Balans la vide" }); return; }

  const payoutAmount = vendor.balance;

  const [payout] = await db
    .insert(fintechPayoutsTable)
    .values({
      vendorId,
      amount: payoutAmount,
      status: "paid",
      notes: notes ?? null,
      paidAt: new Date(),
    })
    .returning();

  await db
    .update(fintechVendorsTable)
    .set({ balance: 0 })
    .where(eq(fintechVendorsTable.id, vendorId));

  const [vendorUser] = await db.select().from(usersTable).where(eq(usersTable.id, vendor.userId));

  res.json({
    ...payout,
    vendorName: vendorUser?.name ?? "",
    moncashNumber: vendor.moncashNumber ?? null,
  });
});

// ─── Admin: all orders ────────────────────────────────────────────────────────
router.get("/fintech/admin/orders", requireFinanceAdmin, async (req, res) => {

  const orders = await db
    .select({
      id: fintechOrdersTable.id,
      vendorId: fintechOrdersTable.vendorId,
      vendorName: usersTable.name,
      customerId: fintechOrdersTable.customerId,
      customerName: sql<string>`(select name from users where id = ${fintechOrdersTable.customerId})`,
      amount: fintechOrdersTable.amount,
      description: fintechOrdersTable.description,
      status: fintechOrdersTable.status,
      adminCommission: fintechOrdersTable.adminCommission,
      vendorEarnings: fintechOrdersTable.vendorEarnings,
      createdAt: fintechOrdersTable.createdAt,
    })
    .from(fintechOrdersTable)
    .innerJoin(fintechVendorsTable, eq(fintechVendorsTable.id, fintechOrdersTable.vendorId))
    .innerJoin(usersTable, eq(usersTable.id, fintechVendorsTable.userId))
    .orderBy(sql`${fintechOrdersTable.createdAt} desc`);

  res.json(orders);
});

// ─── Admin: all payouts ───────────────────────────────────────────────────────
router.get("/fintech/admin/payouts", requireFinanceAdmin, async (req, res) => {

  const payouts = await db
    .select({
      id: fintechPayoutsTable.id,
      vendorId: fintechPayoutsTable.vendorId,
      vendorName: usersTable.name,
      moncashNumber: fintechVendorsTable.moncashNumber,
      amount: fintechPayoutsTable.amount,
      status: fintechPayoutsTable.status,
      notes: fintechPayoutsTable.notes,
      createdAt: fintechPayoutsTable.createdAt,
      paidAt: fintechPayoutsTable.paidAt,
    })
    .from(fintechPayoutsTable)
    .innerJoin(fintechVendorsTable, eq(fintechVendorsTable.id, fintechPayoutsTable.vendorId))
    .innerJoin(usersTable, eq(usersTable.id, fintechVendorsTable.userId))
    .orderBy(sql`${fintechPayoutsTable.createdAt} desc`);

  res.json(payouts);
});

export default router;
