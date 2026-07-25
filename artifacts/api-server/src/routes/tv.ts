import { Router } from "express";
import { db, tvSeriesTable, tvProgramsTable, platformSettingsTable, expoPushTokensTable } from "@workspace/db";
import { eq, and, lte, gte, gt, desc, asc, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import multer from "multer";
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../lib/objectStorage";
import { sendExpoPushToUser } from "../lib/expo-push";

const router = Router();
const objectStorage = new ObjectStorageService();
const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════════════════════
// BROADCAST STATE — in-memory + persisted to platform_settings for crash recovery
// ══════════════════════════════════════════════════════════════════════════════
type PlaybackState = "playing" | "paused" | "stopped";
interface BroadcastState {
  programId: number | null;
  programTitle: string | null;
  videoUrl: string | null;
  videoKey: string | null;
  state: PlaybackState;
  startedAt: Date | null;
  updatedAt: Date;
}
const broadcast: BroadcastState = {
  programId: null, programTitle: null, videoUrl: null, videoKey: null,
  state: "stopped", startedAt: null, updatedAt: new Date(),
};

// Persist state to platform_settings (non-blocking, best-effort)
async function saveBroadcastState() {
  try {
    const value = JSON.stringify(broadcast);
    await db.insert(platformSettingsTable)
      .values({ key: "tv_broadcast_state", value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
  } catch { /* non-fatal */ }
}

// Restore state on server startup
(async () => {
  try {
    const [row] = await db.select().from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "tv_broadcast_state"));
    if (row) {
      const saved = JSON.parse(row.value) as Partial<BroadcastState>;
      if (saved.state === "playing" || saved.state === "paused") {
        Object.assign(broadcast, {
          ...saved,
          startedAt: saved.startedAt ? new Date(saved.startedAt) : null,
          updatedAt: new Date(),
        });
      }
    }
  } catch { /* ignore — defaults to stopped */ }
})();

// Send push notification to all users with tokens (non-blocking, fire-and-forget)
async function pushBroadcastStarted(title: string | null) {
  try {
    const rows = await db
      .selectDistinct({ userId: expoPushTokensTable.userId })
      .from(expoPushTokensTable);
    for (const { userId } of rows) {
      sendExpoPushToUser(userId, {
        title: "🔴 Flexa TV — LIVE kounye a!",
        body: title ? `${title} k'ap difize kounye a. Peze pou gade!` : "Flexa TV k'ap difize LIVE. Peze pou gade!",
        data: { screen: "tv" },
        sound: "default",
        channelId: "flexa-tv",
      }).catch(() => {});
    }
  } catch { /* non-fatal */ }
}

// Viewer heartbeats: viewerId → last ping timestamp (ms)
const viewerHeartbeats = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [id, ts] of viewerHeartbeats) if (ts < cutoff) viewerHeartbeats.delete(id);
}, 60_000);
function activeViewers() {
  const cutoff = Date.now() - 45_000;
  let n = 0;
  for (const ts of viewerHeartbeats.values()) if (ts >= cutoff) n++;
  return n;
}

// ── GET /api/tv/broadcast ── public — viewers poll this ───────────────────────
router.get("/tv/broadcast", (_req, res): void => {
  res.json({ broadcast: { ...broadcast, viewerCount: activeViewers() } });
});

// ── POST /api/tv/broadcast/heartbeat ── viewers send every 30s ────────────────
router.post("/tv/broadcast/heartbeat", (req, res): void => {
  const { viewerId } = req.body as { viewerId?: string };
  if (viewerId && typeof viewerId === "string" && viewerId.length < 64) {
    viewerHeartbeats.set(viewerId, Date.now());
  }
  res.json({ ok: true, state: broadcast.state, viewerCount: activeViewers() });
});

// ── POST /api/admin/tv/broadcast/play ─────────────────────────────────────────
router.post("/admin/tv/broadcast/play", requireAdmin, async (req, res): Promise<void> => {
  const { programId } = req.body as { programId?: number };
  if (programId) {
    try {
      const [p] = await db.select({
        title: tvProgramsTable.title, videoUrl: tvProgramsTable.videoUrl, videoKey: tvProgramsTable.videoKey,
      }).from(tvProgramsTable).where(eq(tvProgramsTable.id, programId)).limit(1);
      if (p) {
        broadcast.programId = programId;
        broadcast.programTitle = p.title;
        broadcast.videoUrl = p.videoUrl;
        broadcast.videoKey = p.videoKey;
      }
    } catch { /* ignore DB error, use existing */ }
  }
  const isFirstPlay = !broadcast.startedAt;
  broadcast.state = "playing";
  if (!broadcast.startedAt) broadcast.startedAt = new Date();
  broadcast.updatedAt = new Date();
  void saveBroadcastState();
  if (isFirstPlay) void pushBroadcastStarted(broadcast.programTitle); // notify only on first go-live
  res.json({ ok: true, broadcast: { ...broadcast, viewerCount: activeViewers() } });
});

// ── POST /api/admin/tv/broadcast/pause ────────────────────────────────────────
router.post("/admin/tv/broadcast/pause", requireAdmin, async (_req, res): Promise<void> => {
  broadcast.state = "paused";
  broadcast.updatedAt = new Date();
  void saveBroadcastState();
  res.json({ ok: true, broadcast: { ...broadcast, viewerCount: activeViewers() } });
});

// ── POST /api/admin/tv/broadcast/stop ─────────────────────────────────────────
router.post("/admin/tv/broadcast/stop", requireAdmin, async (_req, res): Promise<void> => {
  broadcast.state = "stopped";
  broadcast.startedAt = null;
  broadcast.updatedAt = new Date();
  viewerHeartbeats.clear();
  void saveBroadcastState();
  res.json({ ok: true, broadcast: { ...broadcast, viewerCount: 0 } });
});

// ── GET /api/admin/tv/broadcast/viewers ── admin only ─────────────────────────
router.get("/admin/tv/broadcast/viewers", requireAdmin, (_req, res): void => {
  res.json({ viewerCount: activeViewers(), state: broadcast.state });
});

// ── POST /api/admin/tv/upload-video ── direct video upload ────────────────────
router.post("/admin/tv/upload-video", requireAdmin, uploadMiddleware.single("video"), async (req: any, res): Promise<void> => {
  try {
    const file = req.file;
    if (!file) return void res.status(400).json({ error: "No file uploaded" });
    const objectId = `tv-videos/${randomUUID()}`;
    await objectStorage.uploadBufferById(objectId, file.buffer, file.mimetype);
    const videoKey = `uploads/${objectId}`;
    return void res.json({ videoKey, videoUrl: `/api/storage/objects/${videoKey}` });
  } catch (err) {
    return void res.status(500).json({ error: "Video upload failed" });
  }
});

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

// ── GET /api/admin/tv/import/archive ── search Internet Archive for free films ─
//    Queries archive.org's public search API (no key required).
//    Returns up to `rows` results with embed URL + metadata.
router.get("/admin/tv/import/archive", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q      = String(req.query.q ?? "feature film");
    const rows   = Math.min(Number(req.query.rows ?? 20), 50);
    const start  = Number(req.query.start ?? 0);
    const subject = String(req.query.subject ?? "");

    // Build query — always restrict to video mediatype
    let fullQ = `mediatype:movies AND (${q})`;
    if (subject) fullQ += ` AND subject:"${subject}"`;

    const fields = ["identifier","title","description","year","subject","creator","runtime","downloads"].join(",");
    const params = new URLSearchParams({
      q: fullQ, fl: fields,
      rows: String(rows), start: String(start),
      output: "json", sort: "downloads desc",
    });

    const url = `https://archive.org/advancedsearch.php?${params}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return void res.status(502).json({ error: "Archive.org unreachable" });

    const data = await resp.json() as {
      response: { numFound: number; docs: Array<Record<string, unknown>> };
    };
    const docs = data?.response?.docs ?? [];

    const results = docs.map((d) => {
      const id = String(d.identifier ?? "");
      // Archive.org thumbnail
      const thumbnailUrl = `https://archive.org/services/img/${id}`;
      // Embed URL (works in iframe)
      const videoUrl = `https://archive.org/embed/${id}`;
      // Duration: "HH:MM:SS" or "MM:SS" or plain number (minutes)
      let durationMinutes: number | null = null;
      if (d.runtime) {
        const rt = String(d.runtime);
        const parts = rt.split(":").map(Number);
        if (parts.length === 3) durationMinutes = Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
        else if (parts.length === 2) durationMinutes = Math.round(parts[0] + parts[1] / 60);
        else if (!isNaN(Number(rt))) durationMinutes = Math.round(Number(rt));
      }
      const subjects = Array.isArray(d.subject) ? d.subject : (d.subject ? [d.subject] : []);
      return {
        identifier: id,
        title: String(d.title ?? id),
        description: d.description ? String(d.description).replace(/<[^>]+>/g, "").slice(0, 400) : null,
        year: d.year ? Number(d.year) : null,
        creator: d.creator ? String(d.creator) : null,
        subjects,
        durationMinutes,
        thumbnailUrl,
        videoUrl,
        downloads: Number(d.downloads ?? 0),
      };
    });

    return void res.json({
      numFound: data?.response?.numFound ?? 0,
      start,
      results,
    });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search Archive.org", detail: String(err) });
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
