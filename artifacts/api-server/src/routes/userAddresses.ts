import { Router } from "express";
import { db, userAddressesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  normalizeAddressInput,
  serializeAddress,
  type AddressKind,
} from "../lib/userAddressValidation";

const router = Router();

async function clearDefault(userId: number, kind: AddressKind) {
  await db
    .update(userAddressesTable)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(
      eq(userAddressesTable.userId, userId),
      eq(userAddressesTable.kind, kind),
      eq(userAddressesTable.isDefault, true),
    ));
}

/**
 * GET /api/me/addresses?kind=delivery|ship_from
 */
router.get("/me/addresses", requireAuth, async (req: any, res) => {
  try {
    const kind = String(req.query.kind || "delivery");
    if (kind !== "delivery" && kind !== "ship_from") {
      return res.status(400).json({ error: "Invalid kind" });
    }
    const rows = await db
      .select()
      .from(userAddressesTable)
      .where(and(
        eq(userAddressesTable.userId, req.userId),
        eq(userAddressesTable.kind, kind),
      ))
      .orderBy(desc(userAddressesTable.isDefault), desc(userAddressesTable.updatedAt));
    res.json({
      addresses: rows.map(serializeAddress),
      defaultAddress: rows.find((r) => r.isDefault) ? serializeAddress(rows.find((r) => r.isDefault)!) : null,
    });
  } catch (err) {
    logger.error({ err }, "GET /me/addresses failed");
    res.status(500).json({ error: "Failed to load addresses" });
  }
});

/**
 * POST /api/me/addresses
 * Create a saved address. First address of a kind becomes default.
 * Saves even when checkout is abandoned (client calls on form submit).
 */
router.post("/me/addresses", requireAuth, async (req: any, res) => {
  try {
    const parsed = normalizeAddressInput(req.body ?? {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const value = parsed.value;

    const existing = await db
      .select({ id: userAddressesTable.id })
      .from(userAddressesTable)
      .where(and(
        eq(userAddressesTable.userId, req.userId),
        eq(userAddressesTable.kind, value.kind),
      ));

    const makeDefault = value.isDefault || existing.length === 0;
    if (makeDefault) await clearDefault(req.userId, value.kind);

    const [row] = await db.insert(userAddressesTable).values({
      userId: req.userId,
      kind: value.kind,
      label: value.label,
      fullName: value.fullName,
      phone: value.phone,
      email: value.email,
      street: value.street,
      apartment: value.apartment,
      city: value.city,
      region: value.region,
      postalCode: value.postalCode,
      country: value.country,
      isDefault: makeDefault,
    }).returning();

    logger.info({ userId: req.userId, addressId: row.id, kind: value.kind }, "Saved user address");
    res.status(201).json({ address: serializeAddress(row) });
  } catch (err) {
    logger.error({ err }, "POST /me/addresses failed");
    res.status(500).json({ error: "Failed to save address" });
  }
});

/**
 * PATCH /api/me/addresses/:id
 */
router.patch("/me/addresses/:id", requireAuth, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [owned] = await db
      .select()
      .from(userAddressesTable)
      .where(and(
        eq(userAddressesTable.id, id),
        eq(userAddressesTable.userId, req.userId),
      ));
    if (!owned) return res.status(404).json({ error: "Address not found" });

    const parsed = normalizeAddressInput({
      kind: owned.kind,
      label: req.body?.label ?? owned.label,
      fullName: req.body?.fullName ?? owned.fullName,
      phone: req.body?.phone ?? owned.phone,
      email: req.body?.email !== undefined ? req.body.email : owned.email,
      street: req.body?.street ?? owned.street,
      apartment: req.body?.apartment !== undefined ? req.body.apartment : owned.apartment,
      city: req.body?.city ?? owned.city,
      region: req.body?.region ?? owned.region,
      postalCode: req.body?.postalCode !== undefined ? req.body.postalCode : owned.postalCode,
      country: req.body?.country ?? owned.country,
      isDefault: req.body?.isDefault !== undefined ? !!req.body.isDefault : owned.isDefault,
    });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const value = parsed.value;

    if (value.isDefault) await clearDefault(req.userId, owned.kind as AddressKind);

    const [row] = await db.update(userAddressesTable).set({
      label: value.label,
      fullName: value.fullName,
      phone: value.phone,
      email: value.email,
      street: value.street,
      apartment: value.apartment,
      city: value.city,
      region: value.region,
      postalCode: value.postalCode,
      country: value.country,
      isDefault: value.isDefault || owned.isDefault,
      updatedAt: new Date(),
    }).where(and(
      eq(userAddressesTable.id, id),
      eq(userAddressesTable.userId, req.userId),
    )).returning();

    res.json({ address: serializeAddress(row) });
  } catch (err) {
    logger.error({ err }, "PATCH /me/addresses failed");
    res.status(500).json({ error: "Failed to update address" });
  }
});

/**
 * POST /api/me/addresses/:id/default
 */
router.post("/me/addresses/:id/default", requireAuth, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [owned] = await db
      .select()
      .from(userAddressesTable)
      .where(and(
        eq(userAddressesTable.id, id),
        eq(userAddressesTable.userId, req.userId),
      ));
    if (!owned) return res.status(404).json({ error: "Address not found" });

    await clearDefault(req.userId, owned.kind as AddressKind);
    const [row] = await db.update(userAddressesTable).set({
      isDefault: true,
      updatedAt: new Date(),
    }).where(and(
      eq(userAddressesTable.id, id),
      eq(userAddressesTable.userId, req.userId),
    )).returning();

    res.json({ address: serializeAddress(row) });
  } catch (err) {
    logger.error({ err }, "POST /me/addresses/:id/default failed");
    res.status(500).json({ error: "Failed to set default address" });
  }
});

/**
 * DELETE /api/me/addresses/:id
 * Does NOT touch order shipping snapshots.
 */
router.delete("/me/addresses/:id", requireAuth, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [owned] = await db
      .select()
      .from(userAddressesTable)
      .where(and(
        eq(userAddressesTable.id, id),
        eq(userAddressesTable.userId, req.userId),
      ));
    if (!owned) return res.status(404).json({ error: "Address not found" });

    await db.delete(userAddressesTable).where(and(
      eq(userAddressesTable.id, id),
      eq(userAddressesTable.userId, req.userId),
    ));

    if (owned.isDefault) {
      const [next] = await db
        .select()
        .from(userAddressesTable)
        .where(and(
          eq(userAddressesTable.userId, req.userId),
          eq(userAddressesTable.kind, owned.kind),
        ))
        .orderBy(desc(userAddressesTable.updatedAt))
        .limit(1);
      if (next) {
        await db.update(userAddressesTable)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(userAddressesTable.id, next.id));
      }
    }

    logger.info({ userId: req.userId, addressId: id }, "Deleted user address (orders unchanged)");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /me/addresses failed");
    res.status(500).json({ error: "Failed to delete address" });
  }
});

export default router;
