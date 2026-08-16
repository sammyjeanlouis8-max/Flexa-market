import { Router } from "express";
import { db, tvSeriesTable, tvProgramsTable, platformSettingsTable, expoPushTokensTable } from "@workspace/db";
import { eq, and, lte, gte, gt, desc, asc, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import multer from "multer";
import { randomUUID } from "crypto";
import { uploadToStorage } from "../lib/storage";
import { sendExpoPushToUser } from "../lib/expo-push";

const router = Router();

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
// If admin has an active broadcast with a video → serve it.
// Otherwise fall back to any program marked type="live" in the DB so that
// FlexaTV "Live" programs automatically appear in the mini-player without
// the admin needing to manually trigger a broadcast.
// Facebook/Instagram block iframe embedding via X-Frame-Options — skip those URLs
function isBlockedEmbedHost(url: string | null): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.includes("facebook.com") || h.includes("instagram.com") ||
      h.includes("fb.watch") || h.includes("fb.com")
    );
  } catch { return false; }
}

router.get("/tv/broadcast", async (_req, res): Promise<void> => {
  const adminActive =
    (broadcast.state === "playing" || broadcast.state === "paused") &&
    (broadcast.videoUrl || broadcast.videoKey) &&
    !isBlockedEmbedHost(broadcast.videoUrl); // skip Facebook/Instagram — they block iframes

  if (adminActive) {
    res.json({ broadcast: { ...broadcast, viewerCount: activeViewers() } });
    return;
  }

  // Auto-detect: first active "live" program in the DB
  try {
    const [live] = await db
      .select({
        id: tvProgramsTable.id,
        title: tvProgramsTable.title,
        videoUrl: tvProgramsTable.videoUrl,
        videoKey: tvProgramsTable.videoKey,
      })
      .from(tvProgramsTable)
      .where(
        and(
          eq(tvProgramsTable.type, "live"),
          eq(tvProgramsTable.isActive, true),
        ),
      )
      .orderBy(desc(tvProgramsTable.isFeatured), asc(tvProgramsTable.id))
      .limit(1);

    if (live && (live.videoUrl || live.videoKey) && !isBlockedEmbedHost(live.videoUrl)) {
      res.json({
        broadcast: {
          state: "playing",
          programId: live.id,
          programTitle: live.title,
          videoUrl: live.videoUrl,
          videoKey: live.videoKey,
          viewerCount: activeViewers(),
          startedAt: null,
        },
      });
      return;
    }
  } catch { /* fall through to stopped state */ }

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
    const { url: videoUrl } = await uploadToStorage(file.buffer, file.mimetype, "tv-videos");
    return void res.json({ videoUrl });
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
    const rawPrograms = await db
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
    // Strip live programs whose videoUrl is a blocked embed host (Facebook/Instagram
    // block iframes — returning them causes "Ce contenu n'est plus disponible" error)
    const programs = rawPrograms.map(p => {
      if (p.type === "live" && p.videoUrl && isBlockedEmbedHost(p.videoUrl)) {
        return { ...p, videoUrl: null }; // clear the URL so VideoPlayer shows "no video"
      }
      return p;
    });
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

// ── GET /api/admin/tv/import/tvmaze — proxy to TVMaze API (no key needed) ────
router.get("/admin/tv/import/tvmaze", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q = String(req.query.q ?? "").trim() || "popular";
    const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`;
    const resp = await fetch(url);
    if (!resp.ok) return void res.status(502).json({ error: "TVMaze unreachable" });

    const data = await resp.json() as Array<{ score: number; show: Record<string, unknown> }>;

    const stripHtml = (s: unknown) =>
      s ? String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").trim() : null;

    const results = data.map(({ show: s }) => ({
      identifier : `tvmaze-${s.id}`,
      title      : String(s.name ?? ""),
      description: stripHtml(s.summary),
      thumbnailUrl: ((s.image as Record<string, string> | null)?.original ?? (s.image as Record<string, string> | null)?.medium ?? "") as string,
      genres     : (s.genres as string[] | undefined) ?? [],
      network    : ((s.network as Record<string, string> | null)?.name ?? (s.webChannel as Record<string, string> | null)?.name ?? null) as string | null,
      year       : s.premiered ? String(s.premiered).slice(0, 4) : null,
      status     : s.status as string | null,
    }));

    return void res.json({ results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search TVMaze", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/dailymotion — proxy to Dailymotion public API ───
router.get("/admin/tv/import/dailymotion", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q        = String(req.query.q        ?? "").trim() || "full movie";
    const category = String(req.query.category ?? "").trim();

    const params = new URLSearchParams({
      search : category ? `${q} ${category}` : q,
      fields : "id,title,thumbnail_url,duration,description",
      limit  : "24",
      sort   : "recent",
    });

    const resp = await fetch(`https://api.dailymotion.com/videos?${params.toString()}`);
    if (!resp.ok) return void res.status(502).json({ error: "Dailymotion unreachable" });

    const data = await resp.json() as {
      list: Array<Record<string, unknown>>;
      total: number;
    };

    const results = (data?.list ?? []).map((v) => {
      const id        = String(v.id ?? "");
      const durSec    = v.duration ? Number(v.duration) : null;
      const rawDesc   = v.description ? String(v.description) : null;
      return {
        identifier    : `dm-${id}`,
        title         : String(v.title ?? id),
        description   : rawDesc ? rawDesc.replace(/<[^>]+>/g, "").slice(0, 400) : null,
        year          : null as number | null,
        creator       : null as string | null,
        subjects      : [] as string[],
        durationMinutes: durSec ? Math.round(durSec / 60) : null,
        thumbnailUrl  : String(v.thumbnail_url ?? ""),
        videoUrl      : `https://www.dailymotion.com/embed/video/${id}?autoplay=1&queue-enable=false`,
        downloads     : 0,
      };
    });

    return void res.json({ numFound: data?.total ?? results.length, results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search Dailymotion", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/seriesepisodes — Dailymotion episodes for a series ─
// Searches Dailymotion for full-length episodes (longer_than=10 min) of a
// specific series name. No API key required.
router.get("/admin/tv/import/seriesepisodes", requireAdmin, async (req, res): Promise<void> => {
  try {
    const title = String(req.query.title ?? "").trim();
    if (!title) return void res.status(400).json({ error: "title required" });

    // Try multiple search terms to maximise results
    const queries = [
      `${title} épisode complet`,
      `${title} episode saison`,
      `${title} série complet`,
    ];

    const seen = new Map<string, Record<string, unknown>>();
    await Promise.all(queries.map(async (q) => {
      try {
        const params = new URLSearchParams({
          search      : q,
          longer_than : "10",   // only full episodes (>10 min)
          fields      : "id,title,thumbnail_url,duration,description",
          limit       : "12",
          sort        : "relevance",
        });
        const r = await fetch(`https://api.dailymotion.com/videos?${params}`);
        if (!r.ok) return;
        const data = await r.json() as { list: Array<Record<string, unknown>> };
        for (const v of data.list ?? []) {
          const id = String(v.id ?? "");
          if (id && !seen.has(id)) seen.set(id, v);
        }
      } catch { /* ignore per-query failures */ }
    }));

    const results = [...seen.values()].map((v) => {
      const id     = String(v.id ?? "");
      const durSec = v.duration ? Number(v.duration) : null;
      const rawDesc = v.description ? String(v.description) : null;
      return {
        identifier     : `dm-${id}`,
        title          : String(v.title ?? id),
        description    : rawDesc ? rawDesc.replace(/<[^>]+>/g, "").slice(0, 400) : null,
        year           : null as number | null,
        creator        : null as string | null,
        subjects       : [] as string[],
        durationMinutes: durSec ? Math.round(durSec / 60) : null,
        thumbnailUrl   : String(v.thumbnail_url ?? ""),
        videoUrl       : `https://www.dailymotion.com/embed/video/${id}?autoplay=1&queue-enable=false`,
        downloads      : 0,
      };
    });

    return void res.json({ results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search episodes", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/cinemafr — Dailymotion filtered to French content ─
// language=fr + country=fr returns modern French films, no API key required.
router.get("/admin/tv/import/cinemafr", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q       = String(req.query.q       ?? "").trim();
    const genre   = String(req.query.genre   ?? "").trim();

    // Build search term: genre + query, always in French context
    const searchTerm = [genre, q, "film complet"].filter(Boolean).join(" ");

    const params = new URLSearchParams({
      search   : searchTerm,
      language : "fr",
      country  : "fr",          // ← origin France only → fewer dubbed Hindi films
      fields   : "id,title,thumbnail_url,duration,description",
      limit    : "24",
      sort     : "recent",
    });

    const resp = await fetch(`https://api.dailymotion.com/videos?${params.toString()}`);
    if (!resp.ok) return void res.status(502).json({ error: "Dailymotion unreachable" });

    const data = await resp.json() as {
      list: Array<Record<string, unknown>>;
      total: number;
    };

    const results = (data?.list ?? []).map((v) => {
      const id     = String(v.id ?? "");
      const durSec = v.duration ? Number(v.duration) : null;
      const rawDesc = v.description ? String(v.description) : null;
      return {
        identifier      : `dmfr-${id}`,
        title           : String(v.title ?? id),
        description     : rawDesc ? rawDesc.replace(/<[^>]+>/g, "").slice(0, 400) : null,
        year            : null as number | null,
        creator         : null as string | null,
        subjects        : [] as string[],
        durationMinutes : durSec ? Math.round(durSec / 60) : null,
        thumbnailUrl    : String(v.thumbnail_url ?? ""),
        videoUrl        : `https://www.dailymotion.com/embed/video/${id}?autoplay=1&queue-enable=false`,
        downloads       : 0,
      };
    });

    return void res.json({ numFound: data?.total ?? results.length, results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search Ciné FR", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/archivefr — Archive.org language:French ─────────
// 33,000+ French-language films; public domain, no API key needed.
router.get("/admin/tv/import/archivefr", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q    = String(req.query.q    ?? "").trim();
    const year = String(req.query.year ?? "").trim();   // e.g. "2000-2025"
    const sort = String(req.query.sort ?? "").trim() || "downloads desc";

    let query = "language:French mediatype:movies";
    if (q) query += ` (title:(${q}) OR creator:(${q}))`;
    if (year) {
      const [from, to] = year.split("-");
      if (from && to) query += ` year:[${from} TO ${to}]`;
    }

    const params = new URLSearchParams({
      q     : query,
      "fl[]": "identifier,title,description,year,creator,runtime,downloads,subject",
      sort  : sort,
      rows  : "24",
      output: "json",
    });

    const resp = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`);
    if (!resp.ok) return void res.status(502).json({ error: "Archive.org unreachable" });

    const data = await resp.json() as { response?: { numFound?: number; docs?: Array<Record<string, unknown>> } };
    const docs  = data?.response?.docs ?? [];

    const results = docs.map((d) => {
      const id      = String(d.identifier ?? "");
      const rawMin  = d.runtime ? String(d.runtime).replace(/[^0-9:]/g, "") : null;
      const durMin  = rawMin
        ? rawMin.includes(":") ? Math.round(Number(rawMin.split(":")[0]) * 60 + Number(rawMin.split(":")[1]))
          : Number(rawMin) || null
        : null;
      const subj = Array.isArray(d.subject) ? (d.subject as string[]).slice(0, 5) : [];
      return {
        identifier      : `archivefr-${id}`,
        title           : String(d.title ?? id),
        description     : d.description ? String(d.description).replace(/<[^>]+>/g, "").slice(0, 400) : null,
        year            : d.year ? Number(String(d.year).slice(0, 4)) : null,
        creator         : d.creator ? String(d.creator) : null,
        subjects        : subj,
        durationMinutes : durMin,
        thumbnailUrl    : `https://archive.org/services/img/${id}`,
        videoUrl        : `https://archive.org/embed/${id}?autoplay=1&start=0`,
        downloads       : d.downloads ? Number(d.downloads) : 0,
      };
    });

    return void res.json({ numFound: data?.response?.numFound ?? results.length, results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search Archive.org FR", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/seriesfr — TVMaze French-language series ────────
// Searches TVMaze with multiple French-related terms, merges + deduplicates,
// filters for language === "French". No API key required.
router.get("/admin/tv/import/seriesfr", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q = String(req.query.q ?? "").trim();

    const stripHtml = (s: unknown) =>
      s ? String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim() : null;

    // Search terms that reliably surface French content when no user query
    const queries = q
      ? [q]
      : ["france", "Lupin", "Paris", "french", "Marseille", "comédie française", "Canal+", "TF1"];

    const seen = new Map<number, Record<string, unknown>>();
    await Promise.all(queries.map(async (term) => {
      try {
        const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`);
        if (!r.ok) return;
        const data = await r.json() as Array<{ show: Record<string, unknown> }>;
        for (const { show } of data) {
          if (show.language === "French" && typeof show.id === "number" && !seen.has(show.id)) {
            seen.set(show.id, show);
          }
        }
      } catch { /* ignore per-query failures */ }
    }));

    const results = [...seen.values()].map((s) => ({
      identifier  : `tvmaze-${s.id}`,
      title       : String(s.name ?? ""),
      description : stripHtml(s.summary),
      thumbnailUrl: ((s.image as Record<string, string> | null)?.original ?? (s.image as Record<string, string> | null)?.medium ?? "") as string,
      genres      : (s.genres as string[] | undefined) ?? [],
      network     : ((s.network as Record<string, string> | null)?.name ?? (s.webChannel as Record<string, string> | null)?.name ?? null) as string | null,
      year        : s.premiered ? String(s.premiered).slice(0, 4) : null,
      status      : s.status as string | null,
    }));

    return void res.json({ results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search French series", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/anime — Jikan/MyAnimeList (no API key needed) ────
// Jikan is a free unofficial MyAnimeList API. Returns current-airing or searched anime.
router.get("/admin/tv/import/anime", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q     = String(req.query.q     ?? "").trim();
    const genre = String(req.query.genre ?? "").trim();

    let url: string;
    if (q) {
      const p = new URLSearchParams({ order_by: "popularity", sort: "asc", limit: "24", sfw: "true" });
      p.set("q", q);
      if (genre) p.set("genres", genre);
      url = `https://api.jikan.moe/v4/anime?${p}`;
    } else {
      const p = new URLSearchParams({ filter: "airing", limit: "24" });
      if (genre) p.set("genres", genre);
      url = `https://api.jikan.moe/v4/top/anime?${p}`;
    }

    const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return void res.status(502).json({ error: "Jikan unreachable" });
    const data = await resp.json() as { data?: Array<Record<string, unknown>> };
    const items = data?.data ?? [];

    const results = items.map((a) => {
      const images  = a.images  as Record<string, Record<string, string>> | null;
      const studios = a.studios as Array<{ name: string }> | undefined;
      const genres  = a.genres  as Array<{ name: string }> | undefined;
      const aired   = a.aired   as Record<string, unknown> | null;
      const prop    = (aired?.prop as Record<string, unknown> | null);
      const fromYear = (prop?.from as Record<string, unknown> | null)?.year;
      return {
        identifier  : `anime-${a.mal_id}`,
        title       : String(a.title_english ?? a.title ?? ""),
        description : a.synopsis ? String(a.synopsis).replace(/\[Written by MAL Rewrite\]/g, "").replace(/\[Written.*?\]/g, "").trim().slice(0, 500) : null,
        thumbnailUrl: images?.jpg?.large_image_url ?? images?.jpg?.image_url ?? "",
        genres      : (genres ?? []).map(g => g.name),
        network     : studios?.[0]?.name ?? null,
        year        : a.year ? String(a.year) : (fromYear ? String(fromYear) : null),
        status      : a.status ? String(a.status) : null,
      };
    });

    return void res.json({ results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search anime", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/seriesen — TVMaze popular English series ─────────
// Uses TVMaze public API. No key required. Default shows popular shows by title search.
router.get("/admin/tv/import/seriesen", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q = String(req.query.q ?? "").trim();

    const stripHtml = (s: unknown) =>
      s ? String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim() : null;

    let shows: Record<string, unknown>[] = [];

    if (q) {
      const resp = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8_000) });
      if (!resp.ok) return void res.status(502).json({ error: "TVMaze unreachable" });
      const data = await resp.json() as Array<{ show: Record<string, unknown> }>;
      shows = data.map(d => d.show);
    } else {
      const terms = ["breaking bad", "stranger things", "game of thrones", "the office", "friends", "house md", "suits", "prison break", "dexter", "24", "lost", "walking dead"];
      const seen = new Map<number, Record<string, unknown>>();
      await Promise.all(terms.map(async (term) => {
        try {
          const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(5_000) });
          if (!r.ok) return;
          const data = await r.json() as Array<{ show: Record<string, unknown> }>;
          for (const { show } of data) {
            if (typeof show.id === "number" && !seen.has(show.id)) seen.set(show.id, show);
          }
        } catch { /* ignore per-term errors */ }
      }));
      shows = [...seen.values()];
    }

    const results = shows.map((s) => ({
      identifier  : `tvmaze-${s.id}`,
      title       : String(s.name ?? ""),
      description : stripHtml(s.summary),
      thumbnailUrl: ((s.image as Record<string, string> | null)?.original ?? (s.image as Record<string, string> | null)?.medium ?? "") as string,
      genres      : (s.genres as string[] | undefined) ?? [],
      network     : ((s.network as Record<string, string> | null)?.name ?? (s.webChannel as Record<string, string> | null)?.name ?? null) as string | null,
      year        : s.premiered ? String(s.premiered).slice(0, 4) : null,
      status      : s.status as string | null,
    }));

    return void res.json({ results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search English series", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/tvarchi — Archive.org TV shows/series ───────────
// Searches Archive.org for TV content (classic shows, episodes, collections).
router.get("/admin/tv/import/tvarchi", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q = String(req.query.q ?? "").trim();

    const baseQuery = q
      ? `(${q}) AND (subject:television OR subject:"TV series" OR subject:"TV show" OR collection:classic_tv) AND mediatype:movies`
      : `(subject:television OR subject:"TV series" OR collection:classic_tv) AND mediatype:movies`;

    const params = new URLSearchParams({
      q     : baseQuery,
      fl    : "identifier,title,description,year,creator,subject,downloads",
      rows  : "24",
      sort  : "downloads desc",
      output: "json",
    });

    const resp = await fetch(`https://archive.org/advancedsearch.php?${params}`, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return void res.status(502).json({ error: "Archive.org unreachable" });

    const data = await resp.json() as { response?: { docs?: Array<Record<string, unknown>>; numFound?: number } };
    const docs = data?.response?.docs ?? [];

    const results = docs.map((d) => {
      const id = String(d.identifier ?? "");
      const subjects = Array.isArray(d.subject) ? (d.subject as string[]) : d.subject ? [String(d.subject)] : [];
      const rawDesc  = Array.isArray(d.description) ? (d.description as string[])[0] : d.description;
      return {
        identifier     : `tvarchi-${id}`,
        title          : String(d.title ?? id),
        description    : rawDesc ? String(rawDesc).replace(/<[^>]+>/g, "").slice(0, 400) : null,
        year           : d.year ? Number(d.year) : null,
        creator        : d.creator ? String(Array.isArray(d.creator) ? (d.creator as string[])[0] : d.creator) : null,
        subjects,
        durationMinutes: null as number | null,
        thumbnailUrl   : `https://archive.org/services/img/${id}`,
        videoUrl       : `https://archive.org/embed/${id}`,
        downloads      : d.downloads ? Number(d.downloads) : 0,
      };
    });

    return void res.json({ numFound: data?.response?.numFound ?? results.length, results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search TV archive", detail: String(err) });
  }
});

// ── GET /api/tv/movies — public YTS proxy for the Films tab (no auth needed) ─
// Returns real HD films from YTS (40,000+). Players use vidsrc.to embed by IMDB ID.
router.get("/tv/movies", async (req, res): Promise<void> => {
  try {
    const q     = String(req.query.q     ?? "").trim();
    const genre = String(req.query.genre ?? "").trim();
    const page  = Math.max(1, Number(req.query.page ?? 1));

    const params = new URLSearchParams({
      limit         : "24",
      page          : String(page),
      sort_by       : q ? "rating" : "download_count",
      order_by      : "desc",
      minimum_rating: "5",
    });
    if (q)     params.set("query_term", q);
    if (genre && genre !== "All") params.set("genre", genre);

    const resp = await fetch(`https://yts.mx/api/v2/list_movies.json?${params}`, {
      headers: { "User-Agent": "FlexaMarket/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return void res.status(502).json({ error: "YTS unreachable" });

    const data = await resp.json() as {
      data?: { movie_count?: number; movies?: Array<Record<string, unknown>> };
    };
    const movies = data?.data?.movies ?? [];

    const results = movies.map((m) => {
      const imdbCode = String(m.imdb_code ?? "");
      return {
        imdbCode,
        title          : String(m.title_long ?? m.title ?? ""),
        description    : String(m.summary ?? "").replace(/<[^>]+>/g, "").slice(0, 500),
        year           : m.year ? Number(m.year) : null,
        durationMinutes: m.runtime ? Number(m.runtime) : null,
        rating         : m.rating ? Number(m.rating) : null,
        genres         : Array.isArray(m.genres) ? (m.genres as string[]) : [],
        thumbnailUrl   : String(m.large_cover_image ?? m.medium_cover_image ?? ""),
        videoUrl       : imdbCode ? `https://vidsrc.to/embed/movie/${imdbCode}` : null,
      };
    });

    return void res.json({ numFound: data?.data?.movie_count ?? results.length, page, results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to fetch movies", detail: String(err) });
  }
});

// ── GET /api/admin/tv/import/yts — proxy to YTS public API (no key needed) ───
// YTS has 40,000+ HD films (720p / 1080p / 4K). Embed via vidsrc.me using IMDb ID.
router.get("/admin/tv/import/yts", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q       = String(req.query.q       ?? "").trim();
    const genre   = String(req.query.genre   ?? "").trim();
    const quality = String(req.query.quality ?? "").trim() || "1080p";

    const params = new URLSearchParams({
      limit    : "24",
      sort_by  : "year",
      order_by : "desc",
    });
    if (q)       params.set("query_term", q);
    if (genre)   params.set("genre", genre);
    if (quality && quality !== "all") params.set("quality", quality);

    const resp = await fetch(`https://yts.mx/api/v2/list_movies.json?${params.toString()}`, {
      headers: { "User-Agent": "FlexaMarket/1.0" },
    });
    if (!resp.ok) return void res.status(502).json({ error: "YTS unreachable" });

    const data = await resp.json() as {
      data?: {
        movie_count?: number;
        movies?: Array<Record<string, unknown>>;
      };
    };

    const movies = data?.data?.movies ?? [];

    const results = movies.map((m) => {
      const imdbCode = String(m.imdb_code ?? "");
      const runtime  = m.runtime ? Number(m.runtime) : null;
      const genres   = Array.isArray(m.genres) ? (m.genres as string[]) : [];
      return {
        identifier      : `yts-${imdbCode || m.id}`,
        title           : String(m.title_long ?? m.title ?? ""),
        description     : String(m.summary ?? m.description_intro ?? "").replace(/<[^>]+>/g, "").slice(0, 500),
        year            : m.year ? Number(m.year) : null,
        creator         : null as string | null,
        subjects        : genres,
        durationMinutes : runtime,
        thumbnailUrl    : String(m.large_cover_image ?? m.medium_cover_image ?? ""),
        videoUrl        : imdbCode
          ? `https://vidsrc.me/embed/movie?imdb=${imdbCode}`
          : `https://vidsrc.me/embed/movie?tmdb=${m.id}`,
        downloads       : m.download_count ? Number(m.download_count) : 0,
        rating          : m.rating ? Number(m.rating) : null,
        quality         : String(m.torrents ? ((m.torrents as any[])[0]?.quality ?? "") : ""),
      };
    });

    return void res.json({ numFound: data?.data?.movie_count ?? results.length, results });
  } catch (err) {
    return void res.status(500).json({ error: "Failed to search YTS", detail: String(err) });
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
