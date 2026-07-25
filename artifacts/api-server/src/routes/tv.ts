import { Router } from "express";
import { db, tvSeriesTable, tvProgramsTable } from "@workspace/db";
import { eq, and, lte, gte, gt, desc, asc, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// ── GET /api/tv/now-playing ── public ─────────────────────────────────────────
router.get("/tv/now-playing", async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const [program] = await db
      .select({
        id: tvProgramsTable.id,
        title: tvProgramsTable.title,
        description: tvProgramsTable.description,
        type: tvProgramsTable.type,
        videoUrl: tvProgramsTable.videoUrl,
        videoKey: tvProgramsTable.videoKey,
        thumbnailUrl: tvProgramsTable.thumbnailUrl,
        durationMinutes: tvProgramsTable.durationMinutes,
        scheduledAt: tvProgramsTable.scheduledAt,
        endsAt: tvProgramsTable.endsAt,
        seriesId: tvProgramsTable.seriesId,
        episodeNumber: tvProgramsTable.episodeNumber,
        seasonNumber: tvProgramsTable.seasonNumber,
        isFeatured: tvProgramsTable.isFeatured,
        viewCount: tvProgramsTable.viewCount,
        seriesTitle: tvSeriesTable.title,
      })
      .from(tvProgramsTable)
      .leftJoin(tvSeriesTable, eq(tvProgramsTable.seriesId, tvSeriesTable.id))
      .where(
        and(
          eq(tvProgramsTable.isActive, true),
          lte(tvProgramsTable.scheduledAt, now),
          gte(tvProgramsTable.endsAt, now)
        )
      )
      .orderBy(desc(tvProgramsTable.scheduledAt))
      .limit(1);

    // Fallback: featured program if nothing is scheduled right now
    if (!program) {
      const [featured] = await db
        .select({
          id: tvProgramsTable.id,
          title: tvProgramsTable.title,
          description: tvProgramsTable.description,
          type: tvProgramsTable.type,
          videoUrl: tvProgramsTable.videoUrl,
          videoKey: tvProgramsTable.videoKey,
          thumbnailUrl: tvProgramsTable.thumbnailUrl,
          durationMinutes: tvProgramsTable.durationMinutes,
          scheduledAt: tvProgramsTable.scheduledAt,
          endsAt: tvProgramsTable.endsAt,
          seriesId: tvProgramsTable.seriesId,
          episodeNumber: tvProgramsTable.episodeNumber,
          seasonNumber: tvProgramsTable.seasonNumber,
          isFeatured: tvProgramsTable.isFeatured,
          viewCount: tvProgramsTable.viewCount,
          seriesTitle: tvSeriesTable.title,
        })
        .from(tvProgramsTable)
        .leftJoin(tvSeriesTable, eq(tvProgramsTable.seriesId, tvSeriesTable.id))
        .where(and(eq(tvProgramsTable.isActive, true), eq(tvProgramsTable.isFeatured, true)))
        .orderBy(desc(tvProgramsTable.viewCount))
        .limit(1);
      return void res.json({ program: featured ?? null });
    }

    return void res.json({ program });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to fetch now-playing" });
  }
});

// ── GET /api/tv/schedule ── public — next 24h ─────────────────────────────────
router.get("/tv/schedule", async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const schedule = await db
      .select({
        id: tvProgramsTable.id,
        title: tvProgramsTable.title,
        description: tvProgramsTable.description,
        type: tvProgramsTable.type,
        videoUrl: tvProgramsTable.videoUrl,
        videoKey: tvProgramsTable.videoKey,
        thumbnailUrl: tvProgramsTable.thumbnailUrl,
        durationMinutes: tvProgramsTable.durationMinutes,
        scheduledAt: tvProgramsTable.scheduledAt,
        endsAt: tvProgramsTable.endsAt,
        seriesId: tvProgramsTable.seriesId,
        episodeNumber: tvProgramsTable.episodeNumber,
        seasonNumber: tvProgramsTable.seasonNumber,
        isFeatured: tvProgramsTable.isFeatured,
        viewCount: tvProgramsTable.viewCount,
        seriesTitle: tvSeriesTable.title,
      })
      .from(tvProgramsTable)
      .leftJoin(tvSeriesTable, eq(tvProgramsTable.seriesId, tvSeriesTable.id))
      .where(
        and(
          eq(tvProgramsTable.isActive, true),
          gt(tvProgramsTable.scheduledAt, now),
          lte(tvProgramsTable.scheduledAt, tomorrow)
        )
      )
      .orderBy(asc(tvProgramsTable.scheduledAt));
    return void res.json({ schedule });
  } catch {
    return void res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

// ── GET /api/tv/programs ── public ────────────────────────────────────────────
router.get("/tv/programs", async (_req, res): Promise<void> => {
  try {
    const programs = await db
      .select({
        id: tvProgramsTable.id,
        title: tvProgramsTable.title,
        description: tvProgramsTable.description,
        type: tvProgramsTable.type,
        videoUrl: tvProgramsTable.videoUrl,
        videoKey: tvProgramsTable.videoKey,
        thumbnailUrl: tvProgramsTable.thumbnailUrl,
        durationMinutes: tvProgramsTable.durationMinutes,
        scheduledAt: tvProgramsTable.scheduledAt,
        endsAt: tvProgramsTable.endsAt,
        seriesId: tvProgramsTable.seriesId,
        episodeNumber: tvProgramsTable.episodeNumber,
        seasonNumber: tvProgramsTable.seasonNumber,
        isFeatured: tvProgramsTable.isFeatured,
        viewCount: tvProgramsTable.viewCount,
        seriesTitle: tvSeriesTable.title,
      })
      .from(tvProgramsTable)
      .leftJoin(tvSeriesTable, eq(tvProgramsTable.seriesId, tvSeriesTable.id))
      .where(eq(tvProgramsTable.isActive, true))
      .orderBy(desc(tvProgramsTable.isFeatured), desc(tvProgramsTable.viewCount));
    return void res.json({ programs });
  } catch {
    return void res.status(500).json({ error: "Failed to fetch programs" });
  }
});

// ── GET /api/tv/series ── public ──────────────────────────────────────────────
router.get("/tv/series", async (_req, res): Promise<void> => {
  try {
    const series = await db
      .select()
      .from(tvSeriesTable)
      .where(eq(tvSeriesTable.isActive, true))
      .orderBy(asc(tvSeriesTable.title));
    return void res.json({ series });
  } catch {
    return void res.status(500).json({ error: "Failed to fetch series" });
  }
});

// ── POST /api/tv/programs/:id/view ── public ──────────────────────────────────
router.post("/tv/programs/:id/view", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    await db
      .update(tvProgramsTable)
      .set({ viewCount: sql`${tvProgramsTable.viewCount} + 1` })
      .where(eq(tvProgramsTable.id, id));
    return void res.json({ ok: true });
  } catch {
    return void res.status(500).json({ error: "Failed to record view" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/tv/programs ── all programs incl inactive ──────────────────
router.get("/admin/tv/programs", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const programs = await db
      .select({
        id: tvProgramsTable.id,
        title: tvProgramsTable.title,
        description: tvProgramsTable.description,
        type: tvProgramsTable.type,
        videoUrl: tvProgramsTable.videoUrl,
        videoKey: tvProgramsTable.videoKey,
        thumbnailUrl: tvProgramsTable.thumbnailUrl,
        durationMinutes: tvProgramsTable.durationMinutes,
        scheduledAt: tvProgramsTable.scheduledAt,
        endsAt: tvProgramsTable.endsAt,
        seriesId: tvProgramsTable.seriesId,
        episodeNumber: tvProgramsTable.episodeNumber,
        seasonNumber: tvProgramsTable.seasonNumber,
        isActive: tvProgramsTable.isActive,
        isFeatured: tvProgramsTable.isFeatured,
        createdBy: tvProgramsTable.createdBy,
        viewCount: tvProgramsTable.viewCount,
        createdAt: tvProgramsTable.createdAt,
        seriesTitle: tvSeriesTable.title,
      })
      .from(tvProgramsTable)
      .leftJoin(tvSeriesTable, eq(tvProgramsTable.seriesId, tvSeriesTable.id))
      .orderBy(desc(tvProgramsTable.createdAt));
    return void res.json({ programs });
  } catch {
    return void res.status(500).json({ error: "Failed to fetch programs" });
  }
});

// ── GET /api/admin/tv/series ── all series incl inactive ─────────────────────
router.get("/admin/tv/series", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const series = await db.select().from(tvSeriesTable).orderBy(asc(tvSeriesTable.title));
    return void res.json({ series });
  } catch {
    return void res.status(500).json({ error: "Failed to fetch series" });
  }
});

// ── POST /api/admin/tv/programs ── create ─────────────────────────────────────
router.post("/admin/tv/programs", requireAdmin, async (req: any, res): Promise<void> => {
  try {
    const {
      title, description, type, videoUrl, videoKey, thumbnailUrl,
      durationMinutes, scheduledAt, endsAt,
      seriesId, episodeNumber, seasonNumber,
      isActive, isFeatured,
    } = req.body;

    if (!title) return void res.status(400).json({ error: "title required" });

    // Auto-compute endsAt if not given
    let computedEndsAt = endsAt ?? null;
    if (!computedEndsAt && scheduledAt && durationMinutes) {
      computedEndsAt = new Date(new Date(scheduledAt).getTime() + durationMinutes * 60_000).toISOString();
    }

    const [program] = await db
      .insert(tvProgramsTable)
      .values({
        title,
        description: description ?? null,
        type: type ?? "program",
        videoUrl: videoUrl ?? null,
        videoKey: videoKey ?? null,
        thumbnailUrl: thumbnailUrl ?? null,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        endsAt: computedEndsAt ? new Date(computedEndsAt) : null,
        seriesId: seriesId ? Number(seriesId) : null,
        episodeNumber: episodeNumber ? Number(episodeNumber) : null,
        seasonNumber: seasonNumber ? Number(seasonNumber) : 1,
        isActive: isActive !== false,
        isFeatured: isFeatured === true,
        createdBy: req.user?.id ?? null,
      })
      .returning();
    return void res.status(201).json({ program });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to create program" });
  }
});

// ── PUT /api/admin/tv/programs/:id ── update ──────────────────────────────────
router.put("/admin/tv/programs/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

    const {
      title, description, type, videoUrl, videoKey, thumbnailUrl,
      durationMinutes, scheduledAt, endsAt,
      seriesId, episodeNumber, seasonNumber,
      isActive, isFeatured,
    } = req.body;

    let computedEndsAt = endsAt ?? undefined;
    if (!computedEndsAt && scheduledAt && durationMinutes) {
      computedEndsAt = new Date(new Date(scheduledAt).getTime() + Number(durationMinutes) * 60_000).toISOString();
    }

    const [program] = await db
      .update(tvProgramsTable)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...(videoKey !== undefined && { videoKey }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
        ...(durationMinutes !== undefined && { durationMinutes: durationMinutes ? Number(durationMinutes) : null }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
        ...(computedEndsAt !== undefined && { endsAt: computedEndsAt ? new Date(computedEndsAt) : null }),
        ...(seriesId !== undefined && { seriesId: seriesId ? Number(seriesId) : null }),
        ...(episodeNumber !== undefined && { episodeNumber: episodeNumber ? Number(episodeNumber) : null }),
        ...(seasonNumber !== undefined && { seasonNumber: seasonNumber ? Number(seasonNumber) : 1 }),
        ...(isActive !== undefined && { isActive }),
        ...(isFeatured !== undefined && { isFeatured }),
        updatedAt: new Date(),
      })
      .where(eq(tvProgramsTable.id, id))
      .returning();

    if (!program) return void res.status(404).json({ error: "Not found" });
    return void res.json({ program });
  } catch {
    return void res.status(500).json({ error: "Failed to update program" });
  }
});

// ── DELETE /api/admin/tv/programs/:id ────────────────────────────────────────
router.delete("/admin/tv/programs/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    await db.delete(tvProgramsTable).where(eq(tvProgramsTable.id, id));
    return void res.json({ ok: true });
  } catch {
    return void res.status(500).json({ error: "Failed to delete program" });
  }
});

// ── POST /api/admin/tv/series ── create ───────────────────────────────────────
router.post("/admin/tv/series", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { title, description, thumbnailUrl, isActive } = req.body;
    if (!title) return void res.status(400).json({ error: "title required" });
    const [series] = await db
      .insert(tvSeriesTable)
      .values({ title, description: description ?? null, thumbnailUrl: thumbnailUrl ?? null, isActive: isActive !== false })
      .returning();
    return void res.status(201).json({ series });
  } catch {
    return void res.status(500).json({ error: "Failed to create series" });
  }
});

// ── PUT /api/admin/tv/series/:id ─────────────────────────────────────────────
router.put("/admin/tv/series/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const { title, description, thumbnailUrl, isActive } = req.body;
    const [series] = await db
      .update(tvSeriesTable)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(tvSeriesTable.id, id))
      .returning();
    if (!series) return void res.status(404).json({ error: "Not found" });
    return void res.json({ series });
  } catch {
    return void res.status(500).json({ error: "Failed to update series" });
  }
});

// ── DELETE /api/admin/tv/series/:id ──────────────────────────────────────────
router.delete("/admin/tv/series/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    await db.delete(tvSeriesTable).where(eq(tvSeriesTable.id, id));
    return void res.json({ ok: true });
  } catch {
    return void res.status(500).json({ error: "Failed to delete series" });
  }
});

export default router;
