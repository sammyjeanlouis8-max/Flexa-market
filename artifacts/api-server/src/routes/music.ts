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
import {
  uploadMusicAudio,
  uploadMusicCover,
  deleteMusicFile,
  getStreamUrl,
  extractKey,
  isConfigured as wasabiConfigured,
} from "../lib/wasabi";
import { createHash } from "crypto";
import { logger } from "../lib/logger";

const router = Router();
// Support MP3, WAV, FLAC, AAC, M4A + images — up to 500 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

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

/**
 * Transform a raw DB row so the client always gets a playable URL.
 *
 * Wasabi bucket is PRIVATE — direct URLs require auth the browser can't add.
 * For any track that was uploaded to Wasabi (storage_key IS NOT NULL) we
 * replace audio_url with our signing proxy: GET /api/music/stream/{key}
 * which issues a 307 redirect to a 1-hour signed Wasabi URL.
 *
 * Legacy tracks (Replit Object Storage, storage_key IS NULL) keep their
 * /api/storage/objects/… path unchanged so they continue working.
 */
function toClientTrack(row: Record<string, unknown>) {
  const key = row.storage_key as string | null;
  return {
    ...row,
    audio_url: key ? `/api/music/stream/${key}` : row.audio_url,
    storage_key: undefined, // never expose storage key to client
  };
}

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
      `SELECT id, title, artist, album, genre, cover_url, audio_url, storage_key,
              duration_seconds, type, is_featured, play_count, valid_impressions,
              total_impressions, estimated_revenue_usd, artist_user_id, created_at
       FROM music_tracks ${where}
       ORDER BY is_featured DESC, play_count DESC, created_at DESC
       LIMIT ${Math.min(Number(limit)||50, 200)} OFFSET ${Number(offset)||0}`
    );
    res.json({ tracks: rows.map(toClientTrack) });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/music/:id
router.get("/api/music/:id", async (req, res) => {
  try {
    const [row] = await q(`SELECT * FROM music_tracks WHERE id = ${Number(req.params.id)}`);
    if (!row) return res.status(404).json({ error: "Not found" });
    await q(`UPDATE music_tracks SET play_count = play_count + 1 WHERE id = ${Number(req.params.id)}`);
    res.json({ track: toClientTrack(row) });
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
    if (!req.files?.audio?.[0]) return res.status(400).json({ error: "Fichye odyo obligatwa" });
    if (!wasabiConfigured()) return res.status(503).json({ error: "Sèvis stockaj pa konfigiré" });

    // Upload audio → Wasabi
    const audioFile = req.files.audio[0];
    const audioResult = await uploadMusicAudio(audioFile.buffer, audioFile.mimetype, audioFile.originalname);

    // Upload cover → Wasabi (optional)
    let coverResult: { key: string; url: string } | null = null;
    if (req.files?.cover?.[0]) {
      const coverFile = req.files.cover[0];
      coverResult = await uploadMusicCover(coverFile.buffer, coverFile.mimetype, coverFile.originalname);
    }

    const [track] = await q(
      `INSERT INTO music_tracks
         (title, artist, album, genre, audio_url, cover_url, storage_key, cover_storage_key,
          type, is_active, is_featured, created_by, artist_user_id)
       VALUES
         (${nullOr(title.trim())}, ${nullOr(artist.trim())},
          ${nullOr(album?.trim() || null)}, ${nullOr(genre?.trim() || null)},
          ${nullOr(audioResult.url)}, ${nullOr(coverResult?.url || null)},
          ${nullOr(audioResult.key)}, ${nullOr(coverResult?.key || null)},
          ${nullOr(type)}, FALSE, FALSE,
          ${nullOr(req.user?.id)}, ${nullOr(req.user?.id)})
       RETURNING *`
    );

    logger.info({ trackId: track.id, userId: req.user?.id, title, storageKey: audioResult.key }, "Artist track uploaded to Wasabi — pending review");
    // Return stream URL so client can play immediately from local state
    res.status(201).json({ track: toClientTrack(track), message: "Track soumèt — admin ap revize li anvan li parèt" });
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
            is_featured = "false", audio_url, cover_url, artist_user_id,
            license, monetization_type, price_usd, copyright_status, tags } = req.body;
    if (!title?.trim())  return res.status(400).json({ error: "title required" });
    if (!artist?.trim()) return res.status(400).json({ error: "artist required" });

    let finalAudio = audio_url ?? null;
    let finalCover = cover_url ?? null;
    let audioKey:  string | null = null;
    let coverKey:  string | null = null;

    if (req.files?.audio?.[0]) {
      const file   = req.files.audio[0];
      const result = await uploadMusicAudio(file.buffer, file.mimetype, file.originalname);
      finalAudio   = result.url;
      audioKey     = result.key;
    }
    if (req.files?.cover?.[0]) {
      const file   = req.files.cover[0];
      const result = await uploadMusicCover(file.buffer, file.mimetype, file.originalname);
      finalCover   = result.url;
      coverKey     = result.key;
    }

    const dur       = duration_seconds ? Number(duration_seconds) : null;
    const featured  = is_featured === "true" || is_featured === true;
    const artUserId = artist_user_id ? Number(artist_user_id) : null;

    const [track] = await q(
      `INSERT INTO music_tracks
         (title, artist, album, genre, audio_url, cover_url, storage_key, cover_storage_key,
          duration_seconds, type, is_featured, created_by, artist_user_id,
          license, monetization_type, price_usd, copyright_status, tags)
       VALUES
         (${nullOr(title)}, ${nullOr(artist)}, ${nullOr(album)}, ${nullOr(genre)},
          ${nullOr(finalAudio)}, ${nullOr(finalCover)},
          ${nullOr(audioKey)}, ${nullOr(coverKey)},
          ${nullOr(dur)}, '${esc(type)}', ${featured},
          ${nullOr(req.user?.id)}, ${nullOr(artUserId)},
          ${nullOr(license||null)}, ${nullOr(monetization_type||'free')},
          ${nullOr(price_usd ? Number(price_usd) : null)},
          ${nullOr(copyright_status||'verified')}, ${nullOr(tags||null)})
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
            audio_url, cover_url, artist_user_id,
            license, monetization_type, price_usd, copyright_status, tags } = req.body;

    let finalAudio  = audio_url  !== undefined ? audio_url  : existing.audio_url;
    let finalCover  = cover_url  !== undefined ? cover_url  : existing.cover_url;
    let newAudioKey: string | null = existing.storage_key       ?? null;
    let newCoverKey: string | null = existing.cover_storage_key ?? null;

    if (req.files?.audio?.[0]) {
      // Upload new audio to Wasabi then delete the old object
      const file   = req.files.audio[0];
      const result = await uploadMusicAudio(file.buffer, file.mimetype, file.originalname);
      finalAudio   = result.url;
      const oldKey = existing.storage_key ?? extractKey(existing.audio_url);
      await deleteMusicFile(oldKey);
      newAudioKey  = result.key;
    }
    if (req.files?.cover?.[0]) {
      // Upload new cover to Wasabi then delete the old object
      const file   = req.files.cover[0];
      const result = await uploadMusicCover(file.buffer, file.mimetype, file.originalname);
      finalCover   = result.url;
      const oldKey = existing.cover_storage_key ?? extractKey(existing.cover_url);
      await deleteMusicFile(oldKey);
      newCoverKey  = result.key;
    }

    const sets: string[] = [];
    if (title !== undefined)            sets.push(`title = ${nullOr(title)}`);
    if (artist !== undefined)           sets.push(`artist = ${nullOr(artist)}`);
    if (album !== undefined)            sets.push(`album = ${nullOr(album || null)}`);
    if (genre !== undefined)            sets.push(`genre = ${nullOr(genre || null)}`);
    if (duration_seconds !== undefined) sets.push(`duration_seconds = ${nullOr(Number(duration_seconds) || null)}`);
    if (type !== undefined)             sets.push(`type = ${nullOr(type)}`);
    if (is_featured !== undefined)      sets.push(`is_featured = ${is_featured === "true" || is_featured === true}`);
    if (is_active !== undefined)        sets.push(`is_active = ${is_active === "true" || is_active === true}`);
    if (artist_user_id !== undefined)   sets.push(`artist_user_id = ${nullOr(artist_user_id ? Number(artist_user_id) : null)}`);
    if (license !== undefined)          sets.push(`license = ${nullOr(license || null)}`);
    if (monetization_type !== undefined) sets.push(`monetization_type = ${nullOr(monetization_type)}`);
    if (price_usd !== undefined)        sets.push(`price_usd = ${nullOr(price_usd ? Number(price_usd) : null)}`);
    if (copyright_status !== undefined) sets.push(`copyright_status = ${nullOr(copyright_status)}`);
    if (tags !== undefined)             sets.push(`tags = ${nullOr(tags || null)}`);
    sets.push(`audio_url = ${nullOr(finalAudio)}`);
    sets.push(`cover_url = ${nullOr(finalCover)}`);
    sets.push(`storage_key = ${nullOr(newAudioKey)}`);
    sets.push(`cover_storage_key = ${nullOr(newCoverKey)}`);
    sets.push("updated_at = NOW()");

    const [track] = await q(`UPDATE music_tracks SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`);
    res.json({ track });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// DELETE /api/admin/music/:id — removes DB row and Wasabi objects
router.delete("/api/admin/music/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await q(`SELECT storage_key, cover_storage_key, audio_url, cover_url FROM music_tracks WHERE id = ${id}`);
    await q(`DELETE FROM music_tracks WHERE id = ${id}`);
    if (row) {
      await Promise.all([
        deleteMusicFile(row.storage_key       ?? extractKey(row.audio_url as string)),
        deleteMusicFile(row.cover_storage_key ?? extractKey(row.cover_url as string)),
      ]);
    }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/admin/music/storage-stats
router.get("/api/admin/music/storage-stats", requireAdmin, async (_req, res) => {
  try {
    const [stats] = await q<{
      track_count: string; total_duration: string; avg_duration: string; pending_count: string;
    }>(`
      SELECT
        COUNT(*)::text                                              AS track_count,
        COALESCE(SUM(duration_seconds),0)::text                   AS total_duration,
        COALESCE(AVG(duration_seconds),0)::text                   AS avg_duration,
        COUNT(*) FILTER (WHERE is_active = FALSE)::text           AS pending_count
      FROM music_tracks
    `);
    // Estimate: avg 128kbps MP3 = 16 KB/s; cover ~150 KB each
    const trackCount  = Number(stats?.track_count ?? 0);
    const totalDurSec = Number(stats?.total_duration ?? 0);
    const avgDurSec   = Number(stats?.avg_duration ?? 0);
    const audioBytes  = totalDurSec * 16 * 1024;
    const coverBytes  = trackCount  * 150 * 1024;
    const totalBytes  = audioBytes + coverBytes;
    res.json({
      track_count:    trackCount,
      pending_count:  Number(stats?.pending_count ?? 0),
      total_duration: totalDurSec,
      avg_duration:   avgDurSec,
      estimated_storage_bytes: totalBytes,
      audio_bytes:    audioBytes,
      cover_bytes:    coverBytes,
    });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/admin/music/bulk-action
router.post("/api/admin/music/bulk-action", requireAdmin, async (req, res) => {
  try {
    const { action, ids } = req.body as { action: string; ids: number[] };
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "ids required" });
    const safeIds = ids.map(Number).filter(n => n > 0).join(",");
    if (!safeIds) return res.status(400).json({ error: "invalid ids" });
    switch (action) {
      case "approve":   await q(`UPDATE music_tracks SET is_active = TRUE,  updated_at = NOW() WHERE id IN (${safeIds})`); break;
      case "reject":    await q(`UPDATE music_tracks SET is_active = FALSE, updated_at = NOW() WHERE id IN (${safeIds})`); break;
      case "feature":   await q(`UPDATE music_tracks SET is_featured = TRUE, updated_at = NOW() WHERE id IN (${safeIds})`); break;
      case "unfeature": await q(`UPDATE music_tracks SET is_featured = FALSE, updated_at = NOW() WHERE id IN (${safeIds})`); break;
      case "delete": {
        // Fetch storage keys before deleting so we can clean Wasabi
        const rows = await q<{ storage_key: string; cover_storage_key: string; audio_url: string; cover_url: string }>(
          `SELECT storage_key, cover_storage_key, audio_url, cover_url FROM music_tracks WHERE id IN (${safeIds})`
        );
        await q(`DELETE FROM music_tracks WHERE id IN (${safeIds})`);
        await Promise.all(rows.flatMap(r => [
          deleteMusicFile(r.storage_key       ?? extractKey(r.audio_url)),
          deleteMusicFile(r.cover_storage_key ?? extractKey(r.cover_url)),
        ]));
        break;
      }
      default: return res.status(400).json({ error: "unknown action" });
    }
    res.json({ ok: true, affected: ids.length });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/admin/music/import — save track imported from a free music API
router.post("/api/admin/music/import", requireAdmin, async (req: any, res) => {
  try {
    const {
      title, artist, album, genre, audio_url, cover_url,
      duration_seconds, license, tags, source,
    } = req.body as Record<string, string>;
    if (!title?.trim())  return res.status(400).json({ error: "title required" });
    if (!artist?.trim()) return res.status(400).json({ error: "artist required" });
    if (!audio_url)      return res.status(400).json({ error: "audio_url required" });

    const [track] = await q(
      `INSERT INTO music_tracks
         (title, artist, album, genre, audio_url, cover_url, duration_seconds,
          type, is_active, is_featured, license, tags, copyright_status, created_by)
       VALUES
         (${nullOr(title.trim())}, ${nullOr(artist.trim())}, ${nullOr(album||null)},
          ${nullOr(genre||null)}, ${nullOr(audio_url)}, ${nullOr(cover_url||null)},
          ${nullOr(duration_seconds ? Number(duration_seconds) : null)},
          'free', TRUE, FALSE,
          ${nullOr(license||'creative_commons')},
          ${nullOr(tags||null)},
          'creative_commons',
          ${nullOr(req.user?.id)})
       RETURNING *`
    );
    logger.info({ trackId: track.id, source, title }, "Music track imported from free API");
    res.status(201).json({ track });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// PUT /api/admin/music/:id/monetization
router.put("/api/admin/music/:id/monetization", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { monetization_type, price_usd } = req.body as { monetization_type: string; price_usd?: number };
    await q(`UPDATE music_tracks SET monetization_type = ${nullOr(monetization_type)}, price_usd = ${nullOr(price_usd ?? null)}, updated_at = NOW() WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// PUT /api/admin/music/:id/copyright
router.put("/api/admin/music/:id/copyright", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { copyright_status } = req.body as { copyright_status: string };
    await q(`UPDATE music_tracks SET copyright_status = ${nullOr(copyright_status)}, updated_at = NOW() WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ── Playlists CRUD ─────────────────────────────────────────────────────────────

// GET /api/admin/music/playlists
router.get("/api/admin/music/playlists", requireAdmin, async (_req, res) => {
  try {
    const playlists = await q(`
      SELECT p.*, COUNT(pt.track_id)::int AS track_count
      FROM music_playlists p
      LEFT JOIN music_playlist_tracks pt ON pt.playlist_id = p.id
      GROUP BY p.id ORDER BY p.created_at DESC
    `);
    res.json({ playlists });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/admin/music/playlists
router.post("/api/admin/music/playlists", requireAdmin, upload.fields([{ name: "cover", maxCount: 1 }]), async (req: any, res) => {
  try {
    const { title, description, is_featured = "false", is_trending = "false" } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "title required" });
    let coverUrl: string | null = null;
    let coverKey: string | null = null;
    if (req.files?.cover?.[0]) {
      const file   = req.files.cover[0];
      const result = await uploadMusicCover(file.buffer, file.mimetype, file.originalname);
      coverUrl = result.url;
      coverKey = result.key;
    }
    const [pl] = await q(`
      INSERT INTO music_playlists (title, description, cover_url, is_featured, is_trending, created_by)
      VALUES (${nullOr(title.trim())}, ${nullOr(description||null)}, ${nullOr(coverUrl)},
              ${is_featured==="true"}, ${is_trending==="true"}, ${nullOr(req.user?.id)})
      RETURNING *`);
    res.status(201).json({ playlist: pl });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// PUT /api/admin/music/playlists/:id
router.put("/api/admin/music/playlists/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, is_featured, is_trending, track_ids } = req.body as {
      title?: string; description?: string; is_featured?: boolean; is_trending?: boolean; track_ids?: number[];
    };
    const sets: string[] = ["updated_at = NOW()"];
    if (title !== undefined)       sets.push(`title = ${nullOr(title)}`);
    if (description !== undefined) sets.push(`description = ${nullOr(description || null)}`);
    if (is_featured !== undefined) sets.push(`is_featured = ${!!is_featured}`);
    if (is_trending !== undefined) sets.push(`is_trending = ${!!is_trending}`);
    await q(`UPDATE music_playlists SET ${sets.join(", ")} WHERE id = ${id}`);
    // Sync tracks if provided
    if (Array.isArray(track_ids)) {
      await q(`DELETE FROM music_playlist_tracks WHERE playlist_id = ${id}`);
      if (track_ids.length > 0) {
        const vals = track_ids.map((tid, pos) => `(${id}, ${Number(tid)}, ${pos})`).join(", ");
        await q(`INSERT INTO music_playlist_tracks (playlist_id, track_id, position) VALUES ${vals} ON CONFLICT DO NOTHING`);
      }
    }
    const [pl] = await q(`SELECT p.*, COUNT(pt.track_id)::int AS track_count FROM music_playlists p LEFT JOIN music_playlist_tracks pt ON pt.playlist_id = p.id WHERE p.id = ${id} GROUP BY p.id`);
    res.json({ playlist: pl });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// DELETE /api/admin/music/playlists/:id
router.delete("/api/admin/music/playlists/:id", requireAdmin, async (req, res) => {
  try {
    await q(`DELETE FROM music_playlists WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/admin/music/artists — aggregate artist stats
router.get("/api/admin/music/artists", requireAdmin, async (_req, res) => {
  try {
    const artists = await q(`
      SELECT
        mt.artist                              AS name,
        mt.artist_user_id                      AS user_id,
        u.name                                 AS user_name,
        u.email                                AS user_email,
        BOOL_OR(mt.is_artist_verified)         AS is_verified,
        COUNT(mt.id)::int                      AS track_count,
        SUM(mt.play_count)::int                AS total_plays,
        SUM(mt.valid_impressions)::int         AS total_impressions,
        SUM(mt.download_count)::int            AS total_downloads,
        COALESCE(SUM(s.confirmed_revenue_usd),0)::numeric AS total_revenue
      FROM music_tracks mt
      LEFT JOIN users u ON u.id = mt.artist_user_id
      LEFT JOIN music_ad_stats s ON s.track_id = mt.id
      GROUP BY mt.artist, mt.artist_user_id, u.name, u.email
      ORDER BY total_plays DESC NULLS LAST
      LIMIT 200
    `);
    res.json({ artists });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// PUT /api/admin/music/artists/:artistName/verify
router.put("/api/admin/music/artists/verify", requireAdmin, async (req, res) => {
  try {
    const { artist, is_verified } = req.body as { artist: string; is_verified: boolean };
    await q(`UPDATE music_tracks SET is_artist_verified = ${!!is_verified} WHERE artist = ${nullOr(artist)}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// WASABI STREAMING PROXY
// ══════════════════════════════════════════════════════════════════════════════
//
// GET /api/music/stream/*key
//
// Redirects the client directly to the Wasabi object URL so all audio data
// flows client ↔ Wasabi (zero server bandwidth).
//
//   Public bucket  → 302 to direct Wasabi URL  (browser caches freely)
//   Private bucket → 307 to 1-hour signed URL  (browser must re-request)
//
// HTTP Range requests for seeking work natively because the browser follows
// the redirect and sends Range headers directly to Wasabi.
//
// The key is everything after /api/music/stream/, e.g.:
//   /api/music/stream/music/audio/abc123.mp3
//   → https://s3.us-east-1.wasabisys.com/flexa-music/music/audio/abc123.mp3
//
router.get("/api/music/stream/*key", async (req, res) => {
  try {
    const key = (req.params as any).key as string;
    if (!key) return res.status(400).json({ error: "Missing storage key" });

    const streamUrl = await getStreamUrl(key);

    // Preserve any Range header the client sent — the redirect carries it naturally.
    // We add Accept-Ranges so clients know range requests are supported.
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control",  "private, max-age=3600");

    // 302 for public (cacheable), 307 for signed (must not cache the redirect itself)
    res.redirect(streamUrl.includes("X-Amz-Signature") ? 307 : 302, streamUrl);
  } catch (err: any) {
    logger.error({ err }, "Music stream redirect failed");
    res.status(500).json({ error: err?.message ?? "Stream unavailable" });
  }
});

// GET /api/music/stream-url/:trackId — returns the current stream URL for a track
// Useful for mobile/native players that need to set the URL before playback.
router.get("/api/music/stream-url/:trackId", async (req, res) => {
  try {
    const [track] = await q(`SELECT storage_key, audio_url FROM music_tracks WHERE id = ${Number(req.params.trackId)} AND is_active = TRUE`);
    if (!track) return res.status(404).json({ error: "Track not found" });
    const key = (track.storage_key as string | null) ?? extractKey(track.audio_url as string);
    if (!key) return res.status(404).json({ error: "No storage key for this track" });
    const url = await getStreamUrl(key);
    res.json({ url, key });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

export default router;
