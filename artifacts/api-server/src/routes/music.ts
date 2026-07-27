/**
 * Flexa Music API
 *
 * Impression pipeline:
 *   Client  →  POST /api/music/impression  →  in-memory buffer
 *           →  flush every 60 s  →  DB upsert + milestone auto-credit
 *
 * Fraud guards (in-memory; move to Redis for multi-process scale):
 *   • Require listeningSeconds ≥ 30
 *   • Dedup: sessionId+trackId blocked for DEDUP_WINDOW_MS (30 min)
 *   • IP rate-limit: MAX_IP_IMPRESSIONS_PER_HOUR across all tracks
 *   • Bot UA patterns rejected
 */

import { Router } from "express";
import { db, promoWalletTable, walletTransactionsTable, notificationsTable } from "@workspace/db";
import { sql as dsql, eq } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { logger } from "../lib/logger";

const router = Router();
const objectStorage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const CPM_USD           = 1.00;   // $1 per 1 000 valid impressions
const MIN_LISTEN_SEC    = 30;     // must listen ≥ 30 s for a valid impression
const DEDUP_WINDOW_MS   = 30 * 60_000;   // 30 min per session+track
const MAX_IP_IMPRESSIONS_PER_HOUR = 15;
const HOUR_MS           = 3_600_000;
const FLUSH_INTERVAL_MS = 60_000; // flush buffer every 60 s
const MIN_WITHDRAW_USD  = 10.00;  // artist must have ≥ $10 to withdraw

// ── In-memory guards ─────────────────────────────────────────────────────────
/** key: `${sessionId}:${trackId}` → expiry timestamp */
const sessionDedup  = new Map<string, number>();
/** key: ipHash → { count, resetAt } */
const ipRateLimit   = new Map<string, { count: number; resetAt: number }>();
/** key: trackId → pending valid impression count */
const impressionBuffer = new Map<number, number>();

const BOT_UA_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /headless/i, /phantom/i,
  /selenium/i, /puppeteer/i, /playwright/i, /curl/i, /wget/i,
];
function isBot(ua: string): boolean {
  if (!ua || ua.length < 10) return true;
  return BOT_UA_PATTERNS.some(p => p.test(ua));
}
function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "flexa-music-salt").digest("hex").slice(0, 16);
}
function cleanDedup() {
  const now = Date.now();
  for (const [k, exp] of sessionDedup) if (now > exp) sessionDedup.delete(k);
}

// ── Flush buffer to DB every 60 s ────────────────────────────────────────────
async function flushImpressions() {
  if (impressionBuffer.size === 0) return;
  const snapshot = new Map(impressionBuffer);
  impressionBuffer.clear();

  for (const [trackId, count] of snapshot) {
    try {
      // Get track + artist
      const rows = await q<{ id: number; artist_user_id: number | null; valid_impressions: number; title: string }>(
        `SELECT id, artist_user_id, valid_impressions, title
         FROM music_tracks WHERE id = ${trackId} AND is_active = TRUE`
      );
      if (!rows.length) continue;
      const track = rows[0];

      const prevValid  = track.valid_impressions ?? 0;
      const newValid   = prevValid + count;
      const revEstimate = parseFloat((count / 1000 * CPM_USD).toFixed(6));

      // Update track counters
      await q(`UPDATE music_tracks
               SET valid_impressions  = valid_impressions  + ${count},
                   total_impressions  = total_impressions  + ${count},
                   updated_at = NOW()
               WHERE id = ${trackId}`);

      // Upsert daily stats
      await q(`INSERT INTO music_ad_stats (track_id, date, raw_impressions, valid_impressions, estimated_revenue_usd, cpm)
               VALUES (${trackId}, CURRENT_DATE, ${count}, ${count}, ${revEstimate}, ${CPM_USD})
               ON CONFLICT (track_id, date) DO UPDATE SET
                 raw_impressions        = music_ad_stats.raw_impressions        + ${count},
                 valid_impressions      = music_ad_stats.valid_impressions      + ${count},
                 estimated_revenue_usd  = music_ad_stats.estimated_revenue_usd  + ${revEstimate},
                 updated_at = NOW()`);

      // ── Milestone crediting ───────────────────────────────────────────────
      if (track.artist_user_id) {
        const prevMilestone = Math.floor(prevValid / 1000);
        const newMilestone  = Math.floor(newValid  / 1000);
        const milestonesDue = newMilestone - prevMilestone;

        if (milestonesDue > 0) {
          const earnedUsd = parseFloat((milestonesDue * CPM_USD).toFixed(2));
          const impressionsCredited = milestonesDue * 1000;

          // Credit artist wallet atomically
          await db.update(promoWalletTable)
            .set({ balanceUsd: dsql`${promoWalletTable.balanceUsd} + ${earnedUsd}`, updatedAt: new Date() })
            .where(eq(promoWalletTable.userId, track.artist_user_id));

          // Wallet transaction log
          await db.insert(walletTransactionsTable).values({
            userId:     track.artist_user_id,
            type:       "music_earnings",
            amountUsd:  earnedUsd,
            status:     "completed",
            note:       `🎵 Revni mizik — ${impressionsCredited.toLocaleString()} impressions · "${track.title}"`,
          } as any);

          // Music earnings log
          await q(
            `INSERT INTO music_earnings (artist_id, track_id, amount_usd, impressions_credited, milestone, description)
             VALUES (${track.artist_user_id}, ${trackId}, ${earnedUsd}, ${impressionsCredited}, ${newMilestone},
                     'Milestone ${newMilestone} — ${impressionsCredited} impressions · ${track.title.replace(/'/g, "''")}' )`
          );

          // Update confirmed revenue in daily stats
          await q(`UPDATE music_ad_stats
                   SET confirmed_revenue_usd = confirmed_revenue_usd + ${earnedUsd}
                   WHERE track_id = ${trackId} AND date = CURRENT_DATE`);

          // Push notification to artist
          await db.insert(notificationsTable).values({
            userId: track.artist_user_id,
            type: "music_earning",
            isRead: false,
            meta: JSON.stringify({
              message: `🎵 Ou fèk touche $${earnedUsd.toFixed(2)} sou "${track.title}" — ${impressionsCredited.toLocaleString()} impressions!`,
              earnedUsd, impressionsCredited, trackId,
            }),
          } as any).catch(() => {});

          logger.info({ trackId, artistId: track.artist_user_id, earnedUsd, milestonesDue }, "Music milestone credited");
        }
      }
    } catch (err: any) {
      logger.warn({ trackId, err: err?.message }, "Music flush error");
    }
  }
}

setInterval(flushImpressions, FLUSH_INTERVAL_MS);
// Clean dedup map every 5 min
setInterval(cleanDedup, 5 * 60_000);

// ── Raw SQL helper ────────────────────────────────────────────────────────────
async function q<T = Record<string, unknown>>(text: string): Promise<T[]> {
  const result = await db.execute(dsql.raw(text));
  return ((result as any).rows ?? result) as T[];
}
function esc(s: string): string { return s.replace(/'/g, "''"); }
function nullOr(v: unknown): string {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${esc(String(v))}'`;
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/music — list tracks
router.get("/api/music", async (req, res) => {
  try {
    const { genre, artist, search, featured, limit = "50", offset = "0" } = req.query as Record<string, string>;
    let where = "WHERE is_active = TRUE";
    if (genre)    where += ` AND genre = '${esc(genre)}'`;
    if (featured === "1") where += " AND is_featured = TRUE";
    if (artist)   where += ` AND artist ILIKE '%${esc(artist)}%'`;
    if (search) {
      const s = esc(search);
      where += ` AND (title ILIKE '%${s}%' OR artist ILIKE '%${s}%' OR album ILIKE '%${s}%')`;
    }
    const rows = await q(
      `SELECT id, title, artist, album, genre, cover_url, audio_url, duration_seconds,
              type, is_featured, play_count, valid_impressions, total_impressions,
              estimated_revenue_usd, artist_user_id, created_at
       FROM music_tracks ${where}
       ORDER BY is_featured DESC, play_count DESC, created_at DESC
       LIMIT ${Math.min(Number(limit)||50, 200)} OFFSET ${Number(offset)||0}`
    );
    res.json({ tracks: rows });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/music/:id
router.get("/api/music/:id", async (req, res) => {
  try {
    const [track] = await q(`SELECT * FROM music_tracks WHERE id = ${Number(req.params.id)}`);
    if (!track) return res.status(404).json({ error: "Not found" });
    await q(`UPDATE music_tracks SET play_count = play_count + 1 WHERE id = ${Number(req.params.id)}`);
    res.json({ track });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/music/impression — log ad impression (fraud-filtered)
router.post("/api/music/impression", async (req, res) => {
  try {
    const { trackId, sessionId, listeningSeconds } = req.body as {
      trackId: number; sessionId: string; listeningSeconds: number;
    };

    // Basic validation
    if (!trackId || !sessionId || typeof listeningSeconds !== "number") {
      return res.status(400).json({ error: "Invalid payload" });
    }
    if (listeningSeconds < MIN_LISTEN_SEC) {
      return res.json({ ok: false, reason: "min_listen" });
    }

    // Bot detection
    const ua = req.headers["user-agent"] ?? "";
    if (isBot(ua)) return res.json({ ok: false, reason: "bot" });

    // Session dedup
    const dedupKey = `${sessionId}:${trackId}`;
    const now = Date.now();
    if (sessionDedup.has(dedupKey) && sessionDedup.get(dedupKey)! > now) {
      return res.json({ ok: false, reason: "duplicate" });
    }

    // IP rate limit
    const ipHash = hashIp(req.ip ?? "unknown");
    const ipEntry = ipRateLimit.get(ipHash);
    if (ipEntry && ipEntry.resetAt > now) {
      if (ipEntry.count >= MAX_IP_IMPRESSIONS_PER_HOUR) {
        return res.json({ ok: false, reason: "rate_limited" });
      }
      ipEntry.count++;
    } else {
      ipRateLimit.set(ipHash, { count: 1, resetAt: now + HOUR_MS });
    }

    // Check track exists
    const [track] = await q(`SELECT id FROM music_tracks WHERE id = ${Number(trackId)} AND is_active = TRUE`);
    if (!track) return res.status(404).json({ error: "Track not found" });

    // Mark dedup
    sessionDedup.set(dedupKey, now + DEDUP_WINDOW_MS);

    // Buffer the impression
    impressionBuffer.set(trackId, (impressionBuffer.get(trackId) ?? 0) + 1);

    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ARTIST ENDPOINTS (require auth)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/music/artist/stats — per-track stats for authenticated artist
router.get("/api/music/artist/stats", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // All tracks owned by this artist
    const tracks = await q<{
      id: number; title: string; artist: string; cover_url: string | null;
      genre: string | null; valid_impressions: number; total_impressions: number;
      play_count: number; is_active: boolean; created_at: string;
    }>(
      `SELECT id, title, artist, cover_url, genre, valid_impressions, total_impressions,
              play_count, is_active, created_at
       FROM music_tracks WHERE artist_user_id = ${userId} ORDER BY valid_impressions DESC`
    );

    // Daily stats for the last 30 days
    const daily = await q(
      `SELECT s.track_id, s.date, s.valid_impressions, s.estimated_revenue_usd, s.confirmed_revenue_usd
       FROM music_ad_stats s
       JOIN music_tracks t ON t.id = s.track_id
       WHERE t.artist_user_id = ${userId} AND s.date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY s.date DESC`
    );

    // Totals
    const [totals] = await q<{
      total_impressions: string; total_estimated: string; total_confirmed: string;
    }>(
      `SELECT
         COALESCE(SUM(s.valid_impressions),0)::text       AS total_impressions,
         COALESCE(SUM(s.estimated_revenue_usd),0)::text   AS total_estimated,
         COALESCE(SUM(s.confirmed_revenue_usd),0)::text   AS total_confirmed
       FROM music_ad_stats s
       JOIN music_tracks t ON t.id = s.track_id
       WHERE t.artist_user_id = ${userId}`
    );

    // Pending (buffered but not yet flushed)
    let pendingImpressions = 0;
    for (const track of tracks) {
      pendingImpressions += impressionBuffer.get(track.id) ?? 0;
    }

    res.json({
      tracks,
      daily,
      totals: {
        impressions:  Number(totals?.total_impressions ?? 0) + pendingImpressions,
        estimated:    Number(totals?.total_estimated ?? 0),
        confirmed:    Number(totals?.total_confirmed ?? 0),
        cpm:          CPM_USD,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/music/artist/earnings — payout history
router.get("/api/music/artist/earnings", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const rows = await q(
      `SELECT e.id, e.amount_usd, e.impressions_credited, e.milestone, e.description,
              e.created_at, t.title AS track_title, t.artist AS track_artist, t.cover_url
       FROM music_earnings e
       LEFT JOIN music_tracks t ON t.id = e.track_id
       WHERE e.artist_id = ${userId}
       ORDER BY e.created_at DESC
       LIMIT 200`
    );

    // Monthly summary
    const monthly = await q(
      `SELECT DATE_TRUNC('month', e.created_at)::date AS month,
              SUM(e.amount_usd)::text AS total_usd,
              SUM(e.impressions_credited)::text AS total_impressions
       FROM music_earnings e
       WHERE e.artist_id = ${userId}
       GROUP BY 1 ORDER BY 1 DESC`
    );

    // Wallet balance
    const [wallet] = await q(`SELECT balance_usd FROM promo_wallets WHERE user_id = ${userId}`);

    res.json({
      earnings: rows,
      monthly,
      walletBalance: wallet ? Number(wallet.balance_usd) : 0,
      minWithdraw: MIN_WITHDRAW_USD,
    });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/music — all tracks (with impression stats)
router.get("/api/admin/music", requireAdmin, async (_req, res) => {
  try {
    const rows = await q(
      `SELECT mt.*,
              COALESCE(SUM(s.valid_impressions),0)::int   AS stats_impressions,
              COALESCE(SUM(s.estimated_revenue_usd),0)    AS stats_estimated,
              COALESCE(SUM(s.confirmed_revenue_usd),0)    AS stats_confirmed,
              u.name AS artist_name
       FROM music_tracks mt
       LEFT JOIN music_ad_stats s ON s.track_id = mt.id
       LEFT JOIN users u ON u.id = mt.artist_user_id
       GROUP BY mt.id, u.name
       ORDER BY mt.created_at DESC
       LIMIT 200`
    );
    res.json({ tracks: rows });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/admin/music/stats — platform-wide impression stats
router.get("/api/admin/music/stats", requireAdmin, async (_req, res) => {
  try {
    const [summary] = await q(
      `SELECT
         COUNT(DISTINCT mt.id)::int                              AS total_tracks,
         COALESCE(SUM(mt.valid_impressions),0)::int             AS total_valid_impressions,
         COALESCE(SUM(mt.total_impressions),0)::int             AS total_raw_impressions,
         COALESCE(SUM(s.confirmed_revenue_usd),0)::text         AS total_paid_out,
         COALESCE(SUM(s.estimated_revenue_usd),0)::text         AS total_estimated
       FROM music_tracks mt
       LEFT JOIN music_ad_stats s ON s.track_id = mt.id`
    );
    const daily = await q(
      `SELECT date, SUM(valid_impressions)::int AS impressions, SUM(confirmed_revenue_usd) AS paid_out
       FROM music_ad_stats GROUP BY date ORDER BY date DESC LIMIT 30`
    );
    const pending = Array.from(impressionBuffer.entries()).map(([id, cnt]) => ({ trackId: id, pending: cnt }));
    res.json({ summary, daily, pending });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ARTIST SELF-UPLOAD  (authenticated users — track goes pending review)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/music/upload — any logged-in user can submit a track for review
router.post("/api/music/upload", requireAuth, upload.fields([
  { name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 },
]), async (req: any, res) => {
  try {
    const { title, artist, album, genre, type = "free" } = req.body;
    if (!title?.trim())  return res.status(400).json({ error: "Titre obligatwa" });
    if (!artist?.trim()) return res.status(400).json({ error: "Non atis obligatwa" });

    if (!req.files?.audio?.[0]) {
      return res.status(400).json({ error: "Fichye odyo obligatwa" });
    }

    let audioUrl: string | null = null;
    let coverUrl: string | null = null;

    // Upload audio
    const audioFile = req.files.audio[0];
    const audioKey  = `music/audio/${randomUUID()}-${audioFile.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await objectStorage.uploadBuffer(audioFile.buffer, audioKey, audioFile.mimetype);
    audioUrl = `/api/storage/objects/${audioKey}`;

    // Upload cover if provided
    if (req.files?.cover?.[0]) {
      const coverFile = req.files.cover[0];
      const coverKey  = `music/covers/${randomUUID()}-${coverFile.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await objectStorage.uploadBuffer(coverFile.buffer, coverKey, coverFile.mimetype);
      coverUrl = `/api/storage/objects/${coverKey}`;
    }

    const [track] = await q(
      `INSERT INTO music_tracks
         (title, artist, album, genre, audio_url, cover_url, type,
          is_active, is_featured, created_by, artist_user_id)
       VALUES
         (${nullOr(title.trim())}, ${nullOr(artist.trim())},
          ${nullOr(album?.trim() || null)}, ${nullOr(genre?.trim() || null)},
          ${nullOr(audioUrl)}, ${nullOr(coverUrl)},
          ${nullOr(type)}, FALSE, FALSE,
          ${nullOr(req.user?.id)}, ${nullOr(req.user?.id)})
       RETURNING *`
    );

    logger.info({ trackId: track.id, userId: req.user?.id, title }, "Artist track uploaded — pending review");
    res.status(201).json({ track, message: "Track soumèt — admin ap revize li anvan li parèt" });
  } catch (err: any) {
    logger.error({ err }, "Artist music upload error");
    res.status(500).json({ error: err?.message ?? "Upload echwe" });
  }
});

// POST /api/admin/music — create track
router.post("/api/admin/music", requireAdmin, upload.fields([
  { name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 },
]), async (req: any, res) => {
  try {
    const { title, artist, album, genre, duration_seconds, type = "free",
            is_featured = "false", audio_url, cover_url, artist_user_id } = req.body;
    if (!title?.trim())  return res.status(400).json({ error: "title required" });
    if (!artist?.trim()) return res.status(400).json({ error: "artist required" });

    let finalAudio = audio_url ?? null;
    let finalCover = cover_url ?? null;

    if (req.files?.audio?.[0]) {
      const file = req.files.audio[0];
      const key = `music/audio/${randomUUID()}-${file.originalname}`;
      await objectStorage.uploadBuffer(file.buffer, key, file.mimetype);
      finalAudio = `/api/storage/objects/${key}`;
    }
    if (req.files?.cover?.[0]) {
      const file = req.files.cover[0];
      const key = `music/covers/${randomUUID()}-${file.originalname}`;
      await objectStorage.uploadBuffer(file.buffer, key, file.mimetype);
      finalCover = `/api/storage/objects/${key}`;
    }

    const dur      = duration_seconds ? Number(duration_seconds) : null;
    const featured = is_featured === "true" || is_featured === true;
    const artUserId = artist_user_id ? Number(artist_user_id) : null;

    const [track] = await q(
      `INSERT INTO music_tracks (title, artist, album, genre, audio_url, cover_url,
                                  duration_seconds, type, is_featured, created_by, artist_user_id)
       VALUES (${nullOr(title)}, ${nullOr(artist)}, ${nullOr(album)}, ${nullOr(genre)},
               ${nullOr(finalAudio)}, ${nullOr(finalCover)}, ${nullOr(dur)},
               '${type}', ${featured}, ${nullOr(req.user?.id)}, ${nullOr(artUserId)})
       RETURNING *`
    );
    res.status(201).json({ track });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// PUT /api/admin/music/:id — update
router.put("/api/admin/music/:id", requireAdmin, upload.fields([
  { name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 },
]), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await q(`SELECT * FROM music_tracks WHERE id = ${id}`);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const { title, artist, album, genre, duration_seconds, type, is_featured, is_active,
            audio_url, cover_url, artist_user_id } = req.body;

    let finalAudio = audio_url !== undefined ? audio_url : existing.audio_url;
    let finalCover = cover_url !== undefined ? cover_url : existing.cover_url;

    if (req.files?.audio?.[0]) {
      const file = req.files.audio[0];
      const key = `music/audio/${randomUUID()}-${file.originalname}`;
      await objectStorage.uploadBuffer(file.buffer, key, file.mimetype);
      finalAudio = `/api/storage/objects/${key}`;
    }
    if (req.files?.cover?.[0]) {
      const file = req.files.cover[0];
      const key = `music/covers/${randomUUID()}-${file.originalname}`;
      await objectStorage.uploadBuffer(file.buffer, key, file.mimetype);
      finalCover = `/api/storage/objects/${key}`;
    }

    const sets: string[] = [];
    if (title !== undefined)           sets.push(`title = ${nullOr(title)}`);
    if (artist !== undefined)          sets.push(`artist = ${nullOr(artist)}`);
    if (album !== undefined)           sets.push(`album = ${nullOr(album || null)}`);
    if (genre !== undefined)           sets.push(`genre = ${nullOr(genre || null)}`);
    if (duration_seconds !== undefined) sets.push(`duration_seconds = ${nullOr(Number(duration_seconds) || null)}`);
    if (type !== undefined)            sets.push(`type = ${nullOr(type)}`);
    if (is_featured !== undefined)     sets.push(`is_featured = ${is_featured === "true" || is_featured === true}`);
    if (is_active !== undefined)       sets.push(`is_active = ${is_active === "true" || is_active === true}`);
    if (artist_user_id !== undefined)  sets.push(`artist_user_id = ${nullOr(artist_user_id ? Number(artist_user_id) : null)}`);
    sets.push(`audio_url = ${nullOr(finalAudio)}`);
    sets.push(`cover_url = ${nullOr(finalCover)}`);
    sets.push("updated_at = NOW()");

    const [track] = await q(`UPDATE music_tracks SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`);
    res.json({ track });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// DELETE /api/admin/music/:id
router.delete("/api/admin/music/:id", requireAdmin, async (req, res) => {
  try {
    await q(`DELETE FROM music_tracks WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

export default router;
