import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage";
import { randomUUID } from "crypto";

const router = Router();
const objectStorage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ── Helper: run raw query ─────────────────────────────────────────────────────
async function q(text: string, values: unknown[] = []) {
  const result = await db.execute(sql.raw(
    text.replace(/\$(\d+)/g, (_, i) => {
      const v = values[Number(i) - 1];
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      if (typeof v === "number") return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    })
  ));
  return (result as any).rows ?? result;
}

// ── GET /api/music — public list ─────────────────────────────────────────────
router.get("/api/music", async (req, res) => {
  try {
    const { genre, artist, search, limit = "50", offset = "0" } = req.query as Record<string, string>;
    let where = "WHERE is_active = TRUE";
    if (genre)  where += ` AND genre = '${genre.replace(/'/g,"''")}'`;
    if (artist) where += ` AND artist ILIKE '%${artist.replace(/'/g,"''").replace(/%/g,"\\%")}%'`;
    if (search) {
      const s = search.replace(/'/g,"''").replace(/%/g,"\\%");
      where += ` AND (title ILIKE '%${s}%' OR artist ILIKE '%${s}%' OR album ILIKE '%${s}%')`;
    }
    const rows = await q(
      `SELECT id, title, artist, album, genre, cover_url, audio_url, duration_seconds,
              type, is_featured, play_count, created_at
       FROM music_tracks ${where}
       ORDER BY is_featured DESC, play_count DESC, created_at DESC
       LIMIT ${Math.min(Number(limit)||50, 200)} OFFSET ${Number(offset)||0}`
    );
    res.json({ tracks: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/music/:id ───────────────────────────────────────────────────────
router.get("/api/music/:id", async (req, res) => {
  try {
    const [track] = await q(`SELECT * FROM music_tracks WHERE id = ${Number(req.params.id)}`);
    if (!track) return res.status(404).json({ error: "Not found" });
    // Increment play count
    await q(`UPDATE music_tracks SET play_count = play_count + 1 WHERE id = ${Number(req.params.id)}`);
    res.json({ track });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── POST /api/admin/music — create track ─────────────────────────────────────
router.post("/api/admin/music", requireAdmin, upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]), async (req: any, res) => {
  try {
    const { title, artist, album, genre, duration_seconds, type = "free", is_featured = "false", audio_url, cover_url } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "title required" });
    if (!artist?.trim()) return res.status(400).json({ error: "artist required" });

    let finalAudioUrl = audio_url ?? null;
    let finalCoverUrl = cover_url ?? null;

    // Upload audio file if provided
    if (req.files?.audio?.[0]) {
      const file = req.files.audio[0];
      const key = `music/audio/${randomUUID()}-${file.originalname}`;
      await objectStorage.uploadBuffer(file.buffer, key, file.mimetype);
      finalAudioUrl = `/api/storage/objects/${key}`;
    }

    // Upload cover image if provided
    if (req.files?.cover?.[0]) {
      const file = req.files.cover[0];
      const key = `music/covers/${randomUUID()}-${file.originalname}`;
      await objectStorage.uploadBuffer(file.buffer, key, file.mimetype);
      finalCoverUrl = `/api/storage/objects/${key}`;
    }

    const dur = duration_seconds ? Number(duration_seconds) : null;
    const featured = is_featured === "true" || is_featured === true;
    const createdBy = req.user?.id ?? null;

    const [track] = await q(
      `INSERT INTO music_tracks (title, artist, album, genre, audio_url, cover_url, duration_seconds, type, is_featured, created_by)
       VALUES ('${title.replace(/'/g,"''")}', '${artist.replace(/'/g,"''")}',
               ${album ? `'${album.replace(/'/g,"''")}` + "'" : "NULL"},
               ${genre ? `'${genre.replace(/'/g,"''")}` + "'" : "NULL"},
               ${finalAudioUrl ? `'${finalAudioUrl}'` : "NULL"},
               ${finalCoverUrl ? `'${finalCoverUrl}'` : "NULL"},
               ${dur ?? "NULL"}, '${type}', ${featured}, ${createdBy ?? "NULL"})
       RETURNING *`
    );
    res.status(201).json({ track });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── PUT /api/admin/music/:id — update ────────────────────────────────────────
router.put("/api/admin/music/:id", requireAdmin, upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await q(`SELECT * FROM music_tracks WHERE id = ${id}`);
    if (!existing.length) return res.status(404).json({ error: "Not found" });

    const { title, artist, album, genre, duration_seconds, type, is_featured, is_active, audio_url, cover_url } = req.body;

    let finalAudioUrl = audio_url ?? existing[0].audio_url;
    let finalCoverUrl = cover_url ?? existing[0].cover_url;

    if (req.files?.audio?.[0]) {
      const file = req.files.audio[0];
      const key = `music/audio/${randomUUID()}-${file.originalname}`;
      await objectStorage.uploadBuffer(file.buffer, key, file.mimetype);
      finalAudioUrl = `/api/storage/objects/${key}`;
    }
    if (req.files?.cover?.[0]) {
      const file = req.files.cover[0];
      const key = `music/covers/${randomUUID()}-${file.originalname}`;
      await objectStorage.uploadBuffer(file.buffer, key, file.mimetype);
      finalCoverUrl = `/api/storage/objects/${key}`;
    }

    const sets: string[] = [];
    if (title)              sets.push(`title = '${String(title).replace(/'/g,"''")}'`);
    if (artist)             sets.push(`artist = '${String(artist).replace(/'/g,"''")}'`);
    if (album !== undefined) sets.push(album ? `album = '${String(album).replace(/'/g,"''")}'` : "album = NULL");
    if (genre !== undefined) sets.push(genre ? `genre = '${String(genre).replace(/'/g,"''")}'` : "genre = NULL");
    if (duration_seconds)   sets.push(`duration_seconds = ${Number(duration_seconds)}`);
    if (type)               sets.push(`type = '${type}'`);
    if (is_featured !== undefined) sets.push(`is_featured = ${is_featured === "true" || is_featured === true}`);
    if (is_active !== undefined)   sets.push(`is_active = ${is_active === "true" || is_active === true}`);
    sets.push(`audio_url = ${finalAudioUrl ? `'${finalAudioUrl}'` : "NULL"}`);
    sets.push(`cover_url = ${finalCoverUrl ? `'${finalCoverUrl}'` : "NULL"}`);
    sets.push("updated_at = NOW()");

    const [track] = await q(`UPDATE music_tracks SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`);
    res.json({ track });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── DELETE /api/admin/music/:id ───────────────────────────────────────────────
router.delete("/api/admin/music/:id", requireAdmin, async (req, res) => {
  try {
    await q(`DELETE FROM music_tracks WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/admin/music — all tracks (admin) ─────────────────────────────────
router.get("/api/admin/music", requireAdmin, async (_req, res) => {
  try {
    const rows = await q(
      `SELECT * FROM music_tracks ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ tracks: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
