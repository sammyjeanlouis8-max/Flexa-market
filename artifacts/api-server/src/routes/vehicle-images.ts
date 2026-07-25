import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// ── GET /api/vehicle-images — public lookup ────────────────────────────────────
router.get("/vehicle-images", async (req, res) => {
  try {
    const { brand, model } = req.query as { brand?: string; model?: string };
    let query = "SELECT * FROM vehicle_images WHERE 1=1";
    const params: string[] = [];
    if (brand) { params.push(brand); query += ` AND lower(brand) = lower($${params.length})`; }
    if (model) { params.push(model); query += ` AND lower(model) = lower($${params.length})`; }
    query += " ORDER BY year_from DESC NULLS LAST LIMIT 20";
    const result = await db.execute(sql.raw(query.replace(/\$(\d+)/g, (_, i) => `'${params[parseInt(i) - 1].replace(/'/g, "''")}'`)));
    res.json({ images: result.rows ?? [] });
  } catch {
    res.status(500).json({ error: "Failed to fetch vehicle images" });
  }
});

// ── GET /api/admin/vehicle-images — admin list all ────────────────────────────
router.get("/admin/vehicle-images", requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT vi.*, u.name as created_by_name
      FROM vehicle_images vi
      LEFT JOIN users u ON u.id = vi.created_by
      ORDER BY vi.created_at DESC
      LIMIT 200
    `);
    res.json({ images: result.rows ?? [] });
  } catch {
    res.status(500).json({ error: "Failed to fetch vehicle images" });
  }
});

// ── POST /api/admin/vehicle-images — create ───────────────────────────────────
router.post("/admin/vehicle-images", requireAdmin, async (req, res) => {
  try {
    const { brand, model, yearFrom, yearTo, imageUrl, bodyStyle } = req.body as {
      brand: string; model: string; yearFrom?: number; yearTo?: number;
      imageUrl: string; bodyStyle?: string;
    };
    if (!brand?.trim() || !model?.trim() || !imageUrl?.trim()) {
      res.status(400).json({ error: "brand, model and imageUrl are required" });
      return;
    }
    const result = await db.execute(sql`
      INSERT INTO vehicle_images (brand, model, year_from, year_to, image_url, body_style, created_by)
      VALUES (
        ${brand.trim()}, ${model.trim()},
        ${yearFrom ?? null}, ${yearTo ?? null},
        ${imageUrl.trim()}, ${bodyStyle ?? null},
        ${req.userId!}
      )
      RETURNING *
    `);
    res.status(201).json({ image: result.rows[0] });
  } catch {
    res.status(500).json({ error: "Failed to create vehicle image" });
  }
});

// ── PUT /api/admin/vehicle-images/:id — update ────────────────────────────────
router.put("/admin/vehicle-images/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { brand, model, yearFrom, yearTo, imageUrl, bodyStyle } = req.body as {
      brand?: string; model?: string; yearFrom?: number; yearTo?: number;
      imageUrl?: string; bodyStyle?: string;
    };
    const result = await db.execute(sql`
      UPDATE vehicle_images
      SET
        brand      = COALESCE(${brand?.trim() ?? null}, brand),
        model      = COALESCE(${model?.trim() ?? null}, model),
        year_from  = COALESCE(${yearFrom ?? null}, year_from),
        year_to    = COALESCE(${yearTo ?? null}, year_to),
        image_url  = COALESCE(${imageUrl?.trim() ?? null}, image_url),
        body_style = COALESCE(${bodyStyle ?? null}, body_style)
      WHERE id = ${id}
      RETURNING *
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ image: result.rows[0] });
  } catch {
    res.status(500).json({ error: "Failed to update vehicle image" });
  }
});

// ── DELETE /api/admin/vehicle-images/:id ─────────────────────────────────────
router.delete("/admin/vehicle-images/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    await db.execute(sql`DELETE FROM vehicle_images WHERE id = ${id}`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete vehicle image" });
  }
});

export default router;
