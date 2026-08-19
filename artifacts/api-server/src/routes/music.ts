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
import { db, promoWalletTable, walletTransactionsTable, notificationsTable, usersTable } from "@workspace/db";
import { sql as dsql, eq } from "drizzle-orm";
import { requireAdmin, requireAuth, optionalAuth, requireCardNotBlocked } from "../middlewares/auth";
import multer from "multer";
import {
  uploadMusicAudio,
  uploadMusicCover,
  deleteMusicFile,
  getStreamUrl,
  extractKey,
  isConfigured as wasabiConfigured,
  runPreflight,
} from "../lib/wasabi";
import { createHash, randomUUID } from "crypto";
import { convertAudioToMp3, needsConversion } from "../lib/audioConvert";
import { logger } from "../lib/logger";
import { validateMimeType } from "../lib/s3";
import {
  ARTIST_PLAN_DURATION_MS,
  ARTIST_PLAN_PRICE_CENTS,
  ARTIST_PLAN_PRICE_USD,
  allocateArtistPlanWallet,
  getArtistPlanState,
} from "../lib/artistPlan";
import { issueUploadProxyToken } from "../lib/uploadProxyTokens";
import { ensureMusicUploadClaimsTable } from "../lib/musicUploadClaims";

const router = Router();
// Support MP3, WAV, FLAC, AAC, M4A + images — up to 500 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1500 * 1024 * 1024 } }); // 1.5 GB — covers WAV ~2 h; ffmpeg then converts to MP3

const CPM_USD           = 1.00;   // $1 per 1 000 valid impressions

// ── Dynamic music platform fee (DB-backed, 30 s TTL, default 20%) ─────────────
let _musicFeeCacheEntry: { value: number; expiresAt: number } | null = null;
async function getMusicPlatformFeePct(): Promise<number> {
  if (_musicFeeCacheEntry && Date.now() < _musicFeeCacheEntry.expiresAt) return _musicFeeCacheEntry.value;
  try {
    const [row] = await q<{ value: string }>(`SELECT value FROM platform_settings WHERE key = 'music_platform_fee_pct' LIMIT 1`);
    const parsed = row ? parseFloat(row.value) : NaN;
    const value = Number.isFinite(parsed) && parsed >= 0 && parsed <= 0.99 ? parsed : 0.20;
    _musicFeeCacheEntry = { value, expiresAt: Date.now() + 30_000 };
    return value;
  } catch { return 0.20; }
}
const MIN_LISTEN_SEC    = 30;     // must listen ≥ 30 s for a valid impression
const DEDUP_WINDOW_MS   = 30 * 60_000;   // 30 min per session+track
const MAX_IP_IMPRESSIONS_PER_HOUR = 15;
const HOUR_MS           = 3_600_000;
const FLUSH_INTERVAL_MS = 60_000; // flush buffer every 60 s
const MIN_WITHDRAW_USD  = 1.00;   // artist must have ≥ $1 to withdraw
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

        // ── 500-subscriber gate: artist must have ≥ 500 followers to earn ──
        const [artistRow] = await q<{ follower_count: number }>(
          `SELECT follower_count FROM users WHERE id = ${track.artist_user_id}`
        );
        const hasEnoughFollowers = (artistRow?.follower_count ?? 0) >= 500;

        if (milestonesDue > 0 && hasEnoughFollowers) {
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

          // Push notification to artist (actorId = artist themselves for system events)
          await db.insert(notificationsTable).values({
            userId:  track.artist_user_id!,
            actorId: track.artist_user_id!,
            type:    "music_earning",
            message: `🎵 Ou fèk touche $${earnedUsd.toFixed(2)} sou "${track.title}" — ${impressionsCredited.toLocaleString()} impressions!`,
            isRead:  false,
          }).catch(() => {});

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

type SqlExecutor = { execute: (query: any) => Promise<any> };

async function readArtistPlanState(userId: number, executor: SqlExecutor = db): Promise<ReturnType<typeof getArtistPlanState>> {
  const result = await executor.execute(dsql`
    SELECT
      u.subscription_plan,
      u.subscription_expires_at,
      (
        SELECT COUNT(*)::int
        FROM music_tracks mt
        WHERE mt.artist_user_id = u.id
      ) AS song_count
    FROM users u
    WHERE u.id = ${userId}
    LIMIT 1
  `);
  const row = ((result as any).rows ?? result)?.[0];
  if (!row) throw new Error("User not found");
  return getArtistPlanState({
    subscriptionPlan: row.subscription_plan,
    subscriptionExpiresAt: row.subscription_expires_at,
    songCount: Number(row.song_count ?? 0),
  });
}

function checkoutFrontendBase(): string {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.PUBLIC_BASE_URL,
    "https://flexamarket.com",
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Try the next server-controlled candidate.
    }
  }
  return "https://flexamarket.com";
}

class ArtistPlanRequiredError extends Error {
  constructor(
    readonly songCount: number,
    readonly freeSongLimit: number,
  ) {
    super("ARTIST_PLAN_REQUIRED");
    this.name = "ArtistPlanRequiredError";
  }
}

class InvalidMusicUploadClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMusicUploadClaimError";
  }
}

async function insertArtistTrackWithAdmission(
  user: any,
  insertSql: string,
  claims?: { audioStorageKey: string; coverStorageKey?: string | null },
): Promise<any> {
  if (claims) await ensureMusicUploadClaimsTable();
  return db.transaction(async (tx) => {
    const isAdmin = Boolean(user?.isAdmin || user?.isSuperAdmin || user?.role === "admin");
    if (!isAdmin) {
      await tx.execute(dsql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
      const state = await readArtistPlanState(user.id, tx as unknown as SqlExecutor);
      if (!state.canUpload) {
        throw new ArtistPlanRequiredError(state.songCount, state.freeSongLimit);
      }
    }

    const claimIds: number[] = [];
    if (claims) {
      const lockClaim = async (
        storageKey: string,
        expectedKind: "audio" | "cover",
        expectedPrefix: string,
      ) => {
        const result = await tx.execute(dsql`
          SELECT id, owner_user_id, storage_key, kind, content_type, consumed_at, expires_at
          FROM music_upload_claims
          WHERE storage_key = ${storageKey}
          FOR UPDATE
        `);
        const claim = result.rows[0] as {
          id: number;
          owner_user_id: number;
          storage_key: string;
          kind: string;
          content_type: string;
          consumed_at: Date | null;
          expires_at: Date;
        } | undefined;
        if (
          !claim ||
          claim.owner_user_id !== user.id ||
          claim.kind !== expectedKind ||
          claim.consumed_at ||
          new Date(claim.expires_at).getTime() <= Date.now() ||
          !claim.storage_key.startsWith(expectedPrefix) ||
          (expectedKind === "audio"
            ? !claim.content_type.startsWith("audio/")
            : !claim.content_type.startsWith("image/"))
        ) {
          throw new InvalidMusicUploadClaimError(
            `${expectedKind === "audio" ? "Audio" : "Cover"} upload is invalid, expired, already used, or belongs to another account.`,
          );
        }
        claimIds.push(claim.id);
      };

      await lockClaim(claims.audioStorageKey, "audio", "uploads/audio/");
      if (claims.coverStorageKey) {
        await lockClaim(claims.coverStorageKey, "cover", "uploads/images/");
      }
    }

    const result = await tx.execute(dsql.raw(insertSql));
    for (const claimId of claimIds) {
      await tx.execute(dsql`
        UPDATE music_upload_claims
        SET consumed_at = NOW()
        WHERE id = ${claimId} AND consumed_at IS NULL
      `);
    }
    return (((result as any).rows ?? result) as any[])?.[0];
  });
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
  // Legacy Cloudinary records retain their saved URL so existing published tracks
  // can keep playing. Every new upload is Wasabi-only.
  const isCld = key?.startsWith("cld:");
  // Always show the uploader's real account name (uploader_name) instead of
  // the manually-typed artist field so listeners see who actually uploaded the track.
  const displayArtist = (row.uploader_name as string | null) || (row.artist as string);
  return {
    ...row,
    artist: displayArtist,
    audio_url: key && !isCld ? `/api/music/stream/${key}` : row.audio_url,
    storage_key: undefined,
    uploader_name: undefined, // don't expose separately — already merged into artist
  };
}

// GET /api/music — list tracks
router.get("/music", async (req, res) => {
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
      `SELECT mt.id, mt.title, mt.artist, mt.album, mt.genre, mt.cover_url, mt.audio_url, mt.storage_key,
              mt.duration_seconds, mt.type, mt.monetization_type, mt.price_usd,
              mt.is_featured, mt.play_count, mt.valid_impressions, mt.is_artist_verified,
              mt.total_impressions, mt.estimated_revenue_usd, mt.artist_user_id, mt.created_at,
              mt.lyrics,
              u.name AS uploader_name
       FROM music_tracks mt
       LEFT JOIN users u ON u.id = mt.artist_user_id
       ${where}
       ORDER BY mt.is_featured DESC, mt.play_count DESC, mt.created_at DESC
       LIMIT ${Math.min(Number(limit)||50, 200)} OFFSET ${Number(offset)||0}`
    );
    res.json({ tracks: rows.map(toClientTrack) });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/music/purchased — list track IDs the authenticated user has bought
// ⚠️ Named route — MUST be before /music/:id wildcard
router.get("/music/purchased", requireAuth, async (req: any, res) => {
  try {
    const rows = await q<{ track_id: number }>(
      `SELECT track_id FROM music_purchases WHERE user_id = ${req.user.id}`
    );
    res.json({ purchasedIds: rows.map(r => r.track_id) });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/music/artist/plan — authoritative upload eligibility and plan state.
// Named route must stay before /music/:id.
router.get("/music/artist/plan", requireAuth, async (req: any, res) => {
  try {
    const state = await readArtistPlanState(req.user.id);
    res.json({
      ...state,
      canUpload: req.user.isAdmin || req.user.isSuperAdmin || state.canUpload,
      priceUsd: ARTIST_PLAN_PRICE_USD,
    });
  } catch (err: any) {
    req.log.error({ err, userId: req.user?.id }, "Artist Plan status failed");
    res.status(500).json({ error: "Nou pa ka verifye Plan Artis la kounye a. Eseye ankò." });
  }
});

// POST /api/music/artist/subscribe — create a server-priced Stripe checkout.
router.post("/music/artist/subscribe", requireAuth, async (req: any, res) => {
  try {
    const state = await readArtistPlanState(req.user.id);
    if (state.isArtistPlan) {
      return res.json({ alreadyActive: true, isArtistPlan: true, expiresAt: state.expiresAt });
    }

    const { getStripeClient } = await import("../lib/stripeClient");
    const stripe = await getStripeClient();
    const baseUrl = checkoutFrontendBase();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: String(req.user.id),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: ARTIST_PLAN_PRICE_CENTS,
          product_data: {
            name: "Flexa Music — Plan Artis",
            description: "Telechaje mizik san limit pandan 1 an",
          },
        },
      }],
      metadata: {
        type: "artist_plan",
        userId: String(req.user.id),
        priceUsd: String(ARTIST_PLAN_PRICE_USD),
      },
      success_url: `${baseUrl}/music?plan=activated&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/music?plan=cancelled`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }
    const checkoutUrl = new URL(session.url);
    if (checkoutUrl.protocol !== "https:" || !(
      checkoutUrl.hostname === "checkout.stripe.com" ||
      checkoutUrl.hostname.endsWith(".checkout.stripe.com")
    )) {
      throw new Error("Stripe returned an invalid checkout URL");
    }
    res.json({ url: checkoutUrl.toString(), sessionId: session.id });
  } catch (err: any) {
    req.log.error({ err, userId: req.user?.id }, "Artist Plan Stripe checkout failed");
    res.status(500).json({ error: "Nou pa ka louvri peman kat la kounye a. Eseye ankò." });
  }
});

// POST /api/music/artist/subscribe/wallet — deduct and activate atomically.
router.post("/music/artist/subscribe/wallet", requireAuth, requireCardNotBlocked, async (req: any, res) => {
  const userId = req.user.id as number;
  try {
    const paymentRef = `artist-plan-wallet-${userId}-${randomUUID()}`;
    const outcome = await db.transaction(async (tx) => {
      const userResult = await tx.execute(dsql`
        SELECT subscription_plan, subscription_expires_at
        FROM users
        WHERE id = ${userId}
        FOR UPDATE
      `);
      const userRow = ((userResult as any).rows ?? userResult)?.[0];
      if (!userRow) return { code: "not_found" as const };

      const current = getArtistPlanState({
        subscriptionPlan: userRow.subscription_plan,
        subscriptionExpiresAt: userRow.subscription_expires_at,
        songCount: 0,
      });
      if (current.isArtistPlan) {
        return { code: "already_active" as const, expiresAt: current.expiresAt };
      }

      const walletResult = await tx.execute(dsql`
        SELECT balance_usd, promo_balance, first_recharge_done
        FROM promo_wallets
        WHERE user_id = ${userId}
        FOR UPDATE
      `);
      const wallet = ((walletResult as any).rows ?? walletResult)?.[0];
      const allocation = allocateArtistPlanWallet({
        balanceUsd: Number(wallet?.balance_usd ?? 0),
        promoBalance: Number(wallet?.promo_balance ?? 0),
        firstRechargeDone: Boolean(wallet?.first_recharge_done),
      });
      if (!allocation.ok) {
        return {
          code: "insufficient" as const,
          promoBalance: allocation.promoAvailable,
          realBalance: allocation.realAvailable,
        };
      }

      await tx.update(promoWalletTable)
        .set({
          promoBalance: dsql`${promoWalletTable.promoBalance} - ${allocation.promoUsed}`,
          balanceUsd: dsql`${promoWalletTable.balanceUsd} - ${allocation.realUsed}`,
          updatedAt: new Date(),
        })
        .where(eq(promoWalletTable.userId, userId));

      if (allocation.promoUsed > 0) {
        await tx.insert(walletTransactionsTable).values({
          userId,
          type: "promo_subscription_debit",
          amountUsd: -allocation.promoUsed,
          status: "completed",
          paymentRef: `${paymentRef}:promo`,
          note: "[Promo] Plan Artis Flexa Music — 1 an",
        });
      }
      if (allocation.realUsed > 0) {
        await tx.insert(walletTransactionsTable).values({
          userId,
          type: "artist_plan_debit",
          amountUsd: -allocation.realUsed,
          status: "completed",
          paymentRef: `${paymentRef}:real`,
          note: "[Real] Plan Artis Flexa Music — 1 an",
        });
      }

      const expiresAt = new Date(Date.now() + ARTIST_PLAN_DURATION_MS);
      await tx.update(usersTable)
        .set({ subscriptionPlan: "artist", subscriptionExpiresAt: expiresAt, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      await tx.insert(notificationsTable).values({
        userId,
        actorId: userId,
        type: "system_alert",
        message: "🎵 Plan Artis ou aktive! Ou ka telechaje chante san limit pou 1 an.",
      });

      return {
        code: "activated" as const,
        expiresAt: expiresAt.toISOString(),
        promoUsed: allocation.promoUsed,
        realUsed: allocation.realUsed,
      };
    });

    if (outcome.code === "not_found") return res.status(404).json({ error: "User not found" });
    if (outcome.code === "insufficient") {
      return res.status(402).json({
        error: "Balans FM pa ase",
        promoBalance: outcome.promoBalance,
        realBalance: outcome.realBalance,
        required: ARTIST_PLAN_PRICE_USD,
      });
    }
    res.json({
      ok: true,
      alreadyActive: outcome.code === "already_active",
      isArtistPlan: true,
      expiresAt: outcome.expiresAt,
      ...(outcome.code === "activated"
        ? { promoUsed: outcome.promoUsed, realUsed: outcome.realUsed }
        : {}),
    });
  } catch (err: any) {
    req.log.error({ err, userId }, "Artist Plan wallet payment failed");
    res.status(500).json({ error: "Peman FM Wallet la pa pase. Okenn lajan pa retire; eseye ankò." });
  }
});

// POST /api/music/:id/buy — create Stripe checkout to purchase a song
// ⚠️ Named path segment — placed before generic /:id GET so it's never swallowed
router.post("/music/:id/buy", requireAuth, async (req: any, res) => {
  const trackId = Number(req.params.id);
  if (!trackId || isNaN(trackId)) return res.status(400).json({ error: "Invalid track id" });

  try {
    const [track] = await q<{
      id: number; title: string; artist: string; cover_url: string | null;
      monetization_type: string; price_usd: string | null; artist_user_id: number | null;
    }>(`SELECT id, title, artist, cover_url, monetization_type, price_usd, artist_user_id
        FROM music_tracks WHERE id = ${trackId} AND is_active = TRUE LIMIT 1`);
    if (!track) return res.status(404).json({ error: "Track not found" });
    if (track.monetization_type !== "sale") return res.status(400).json({ error: "Track is not for sale" });
    const price = Number(track.price_usd ?? 0);
    if (price <= 0) return res.status(400).json({ error: "Track has no price set" });

    // Check already purchased
    const [existing] = await q(
      `SELECT id FROM music_purchases WHERE user_id = ${req.user.id} AND track_id = ${trackId} LIMIT 1`
    );
    if (existing) return res.json({ alreadyPurchased: true });

    const { getStripeClient } = await import("../lib/stripeClient");
    const stripe = await getStripeClient();

    const BASE_URL = (() => {
      if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
      const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
      return domain ? `https://${domain}` : "https://flexamarket.com";
    })();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: `${track.title} — ${track.artist}`,
            description: "Achte mizik sa pou koute san limit",
            ...(track.cover_url ? { images: [track.cover_url] } : {}),
          },
        },
        quantity: 1,
      }],
      metadata: {
        type:      "music_purchase",
        trackId:   String(trackId),
        buyerId:   String(req.user.id),
        artistId:  String(track.artist_user_id ?? ""),
        priceUsd:  String(price),
      },
      success_url: `${BASE_URL}/music?purchased=${trackId}`,
      cancel_url:  `${BASE_URL}/music`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    logger.error({ err: err?.message, trackId }, "[music] buy checkout error");
    res.status(500).json({ error: err?.message });
  }
});

// POST /api/music/:id/buy/wallet — purchase a song directly from FM wallet (instant, no Stripe)
// ⚠️ MUST stay before generic /:id routes
router.post("/music/:id/buy/wallet", requireAuth, async (req: any, res) => {
  const trackId = Number(req.params.id);
  if (!trackId || isNaN(trackId)) return res.status(400).json({ error: "Invalid track id" });

  const buyerId: number = req.user.id;
  try {
    const [track] = await q<{
      id: number; title: string; artist: string;
      monetization_type: string; price_usd: string | null; artist_user_id: number | null;
    }>(`SELECT id, title, artist, monetization_type, price_usd, artist_user_id
        FROM music_tracks WHERE id = ${trackId} AND is_active = TRUE LIMIT 1`);
    if (!track) return res.status(404).json({ error: "Track not found" });
    if (track.monetization_type !== "sale") return res.status(400).json({ error: "Track is not for sale" });
    const price = Number(track.price_usd ?? 0);
    if (price <= 0) return res.status(400).json({ error: "Track has no price set" });

    // Idempotency: already purchased?
    const [existing] = await q(
      `SELECT id FROM music_purchases WHERE user_id = ${buyerId} AND track_id = ${trackId} LIMIT 1`
    );
    if (existing) return res.json({ alreadyPurchased: true });

    // Deduct from FM wallet (promo-first, then real balance)
    const { deductWalletHybrid } = await import("./wallet");
    const deduct = await deductWalletHybrid(
      buyerId, price,
      `Achte chante: ${track.title} — ${track.artist}`,
      "purchase_debit",
      buyerId,
    );

    if (!deduct.ok) {
      return res.status(402).json({
        error: deduct.error,
        promoBalance: deduct.promoBalance,
        realBalance: deduct.realBalance,
        required: price,
      });
    }

    const feePct       = await getMusicPlatformFeePct();
    const platformFee  = parseFloat((price * feePct).toFixed(2));
    const artistAmount = parseFloat((price - platformFee).toFixed(2));
    const artistId     = track.artist_user_id;

    // Record purchase (idempotent — wallet was already charged above)
    await db.execute(dsql`
      INSERT INTO music_purchases (user_id, track_id, amount_usd, artist_amount_usd, platform_fee_usd)
      VALUES (${buyerId}, ${trackId}, ${price}, ${artistAmount}, ${platformFee})
      ON CONFLICT (user_id, track_id) DO NOTHING
    `);

    // Credit artist 80% into music_earnings
    if (artistId) {
      await db.execute(dsql`
        INSERT INTO music_earnings (artist_id, track_id, amount_usd, impressions_credited, milestone, description)
        VALUES (${artistId}, ${trackId}, ${artistAmount}, 0, 'purchase', 'Vann chante — 80% komisyon (Kart FM)')
      `);
      await db.insert(notificationsTable).values({
        userId: artistId, actorId: buyerId, type: "system_alert",
        message: `🎵 Yon moun achte chante ou via Kart FM! Ou touche $${artistAmount.toFixed(2)} (80%).`,
      }).catch(() => {});
    }

    logger.info({ trackId, buyerId, artistId, price, artistAmount, platformFee }, "[music] track purchased via FM wallet");
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message, trackId }, "[music] buy/wallet error");
    res.status(500).json({ error: err?.message });
  }
});

// GET /api/music/diagnose — Wasabi preflight + env check (no auth, safe — redacts secrets)
// ⚠️ MUST be registered before /:id or Express routes "diagnose" as an id
router.get("/music/diagnose", async (_req, res) => {
  const start = Date.now();
  const env: Record<string, string> = {};
  // Check primary name + common DO/AWS aliases
  const checkVar = (primary: string, aliases: string[]): string => {
    const match = [primary, ...aliases].find(n => process.env[n]);
    if (!match) return `❌ MISSING (tried: ${[primary,...aliases].join(", ")})`;
    const v = process.env[match]!;
    return match === primary
      ? (primary.includes("KEY") || primary.includes("SECRET") ? `✅ SET (${v.length} chars)` : `✅ ${v}`)
      : `✅ found as "${match}" (${v.length} chars) — rename to "${primary}"`;
  };
  env["WASABI_ACCESS_KEY"]  = checkVar("WASABI_ACCESS_KEY",  ["WASABI_ACCESS_KEY_ID"]);
  env["WASABI_SECRET_KEY"]  = checkVar("WASABI_SECRET_KEY",  ["WASABI_SECRET_ACCESS_KEY","WASABI_SECRET_KEY_ID"]);
  for (const v of ["WASABI_BUCKET_NAME","WASABI_REGION","WASABI_ENDPOINT","WASABI_PUBLIC"]) {
    const val = process.env[v];
    if (!val) { env[v] = "❌ MISSING"; }
    else { env[v] = `✅ ${val}`; }
  }
  const preflight = await runPreflight();
  res.json({ timestamp: new Date().toISOString(), durationMs: Date.now() - start, env, wasabi: preflight });
});

// POST /api/music/upload-signature — one-use Wasabi proxy tokens for eligible artists.
router.post("/music/upload-signature", requireAuth, async (req: any, res) => {
  try {
    if (!wasabiConfigured()) {
      return res.status(503).json({
        error: "Wasabi storage is not configured. Set WASABI_ACCESS_KEY, WASABI_SECRET_KEY, and WASABI_BUCKET_NAME.",
      });
    }

    const isAdmin = Boolean(req.user?.isAdmin || req.user?.isSuperAdmin || req.user?.role === "admin");
    if (!isAdmin) {
      const state = await readArtistPlanState(req.user.id);
      if (!state.canUpload) {
        return res.status(403).json({
          error: "ARTIST_PLAN_REQUIRED",
          count: state.songCount,
          limit: state.freeSongLimit,
        });
      }
    }

    const audio = req.body?.audio as { size?: number; contentType?: string } | undefined;
    const cover = req.body?.cover as { size?: number; contentType?: string } | undefined;
    const makeToken = (
      file: { size?: number; contentType?: string },
      maxBytes: number,
      musicKind: "audio" | "cover",
    ) => {
      const expectedBytes = Number(file.size);
      const contentType = String(file.contentType || "application/octet-stream").split(";")[0].trim();
      validateMimeType(contentType);
      if (
        (musicKind === "audio" && !contentType.startsWith("audio/")) ||
        (musicKind === "cover" && !contentType.startsWith("image/"))
      ) {
        throw new Error(musicKind === "audio" ? "Audio file type required." : "Image file type required for cover.");
      }
      if (!Number.isFinite(expectedBytes) || expectedBytes <= 0 || expectedBytes > maxBytes) {
        throw new Error(`Invalid file size. Maximum is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      }
      const token = issueUploadProxyToken({
        contentType,
        expectedBytes,
        maxBytes,
        purpose: "music",
        ownerId: req.user.id,
        musicKind,
      });
      return { uploadUrl: `/api/storage/uploads/put-proxy/${token.token}` };
    };

    if (!audio) return res.status(400).json({ error: "Audio metadata required" });
    res.json({
      backend: "wasabi",
      audio: makeToken(audio, 1500 * 1024 * 1024, "audio"),
      cover: cover ? makeToken(cover, 25 * 1024 * 1024, "cover") : null,
    });
  } catch (err: any) {
    req.log.error({ err, userId: req.user?.id }, "Music upload token creation failed");
    res.status(400).json({ error: err?.message ?? "Could not create upload link" });
  }
});


/**
 * POST /api/music/register
 * Lightweight DB-insert-only endpoint called after the browser has already
 * uploaded files to Wasabi. No file processing — just metadata.
 */
router.post("/music/register", requireAuth, async (req, res) => {
  const {
    title, artist, album, genre, type = "free",
    audioUrl, coverUrl, lyrics,
    storageKey, coverStorageKey,
  } = req.body as Record<string, string | undefined>;

  if (!title?.trim())   return res.status(400).json({ error: "Title required" });
  if (!artist?.trim())  return res.status(400).json({ error: "Artist required" });
  if (!storageKey?.trim()) return res.status(400).json({ error: "Wasabi storageKey required" });

  // Duration guard: max 60 minutes (3600 s) for non-admin uploads
  const durationSeconds = req.body.duration_seconds ? Number(req.body.duration_seconds) : null;
  if (durationSeconds !== null && durationSeconds > 10800) {
    return res.status(400).json({ error: "DURATION_TOO_LONG", maxSeconds: 10800, got: durationSeconds });
  }

  const {
    monetization_type = "stream",
    price_usd: priceUsdRaw,
  } = req.body as Record<string, string | undefined>;
  const priceUsd = priceUsdRaw ? Number(priceUsdRaw) : null;

  const isAdmin = Boolean(req.user?.isAdmin || req.user?.isSuperAdmin || req.user?.role === "admin");
  try {
    const row = await insertArtistTrackWithAdmission(req.user,
      `INSERT INTO music_tracks
         (title, artist, album, genre, audio_url, cover_url, storage_key, cover_storage_key,
          type, monetization_type, price_usd, lyrics,
          is_active, is_featured, created_by, artist_user_id)
       VALUES
         (${nullOr(title.trim())}, ${nullOr(artist.trim())},
          ${nullOr(album?.trim() || null)}, ${nullOr(genre?.trim() || null)},
           NULL, NULL,
          ${nullOr(storageKey)}, ${nullOr(coverStorageKey || null)},
          ${nullOr(type)}, ${nullOr(monetization_type)}, ${priceUsd !== null ? priceUsd : "NULL"},
          ${nullOr(lyrics?.trim() || null)},
          TRUE, FALSE,
          ${nullOr(req.user?.id)}, ${nullOr(req.user?.id)})
       RETURNING *`,
      {
        audioStorageKey: storageKey,
        coverStorageKey: coverStorageKey || null,
      },
    );
    res.status(201).json({ track: toClientTrack(row) });
  } catch (err: any) {
    if (err instanceof ArtistPlanRequiredError) {
      return res.status(403).json({
        error: "ARTIST_PLAN_REQUIRED",
        count: err.songCount,
        limit: err.freeSongLimit,
      });
    }
    if (err instanceof InvalidMusicUploadClaimError) {
      return res.status(400).json({ error: "INVALID_MUSIC_UPLOAD", message: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ARTIST SELF-UPLOAD  (authenticated users — track goes pending review)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/music/upload — any logged-in user can submit a track for review
router.post("/music/upload", requireAuth, upload.fields([
  { name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 },
]), async (req: any, res) => {
  const uploadId = `upload-${Date.now()}-${req.user?.id ?? "anon"}`;
  const log = (step: number, name: string, data?: object) =>
    logger.info({ uploadId, step, stepName: name, ...data }, `[upload] step ${step}: ${name}`);
  const fail = (step: number, name: string, err: any, status = 500) => {
    const message = err?.message ?? String(err ?? "unknown error");
    const code    = err?.Code ?? err?.name ?? undefined;
    const http    = err?.$metadata?.httpStatusCode ?? undefined;
    logger.error({ uploadId, step, stepName: name, message, code, httpStatus: http, err },
      `[upload] FAILED at step ${step}: ${name} — ${message}`);
    return res.status(status).json({
      error:    message,
      step:     step,
      stepName: name,
      uploadId,
    });
  };

  // ── Step 2: Request received ──────────────────────────────────────────────
  log(2, "request_received", {
    userId:      req.user?.id,
    contentType: req.headers["content-type"]?.slice(0, 80),
    bodyKeys:    Object.keys(req.body ?? {}),
    fileKeys:    Object.keys(req.files ?? {}),
  });

  // ── Step 3: Authentication ────────────────────────────────────────────────
  if (!req.user?.id) return fail(3, "authentication", new Error("Non authentifye — konekte anvan ou telechaje"), 401);
  log(3, "authentication", { userId: req.user.id, role: req.user.role });

  // ── Step 3b: Artist Plan upload limit (non-admin only) ───────────────────
  if (!req.user.isAdmin && !req.user.isSuperAdmin && req.user.role !== "admin") {
    const planState = await readArtistPlanState(req.user.id);
    if (!planState.canUpload) {
      return res.status(403).json({
        error: "ARTIST_PLAN_REQUIRED",
        count: planState.songCount,
        limit: planState.freeSongLimit,
        step: 3,
        stepName: "upload_limit",
        uploadId,
      });
    }
  }

  // ── Step 4: Validation ────────────────────────────────────────────────────
  const { title, artist, album, genre, type = "free", lyrics } = req.body;
  if (!title?.trim())       return fail(4, "validation", new Error("Titre obligatwa"), 400);
  if (!artist?.trim())      return fail(4, "validation", new Error("Non atis obligatwa"), 400);
  if (!req.files?.audio?.[0]) return fail(4, "validation", new Error("Fichye odyo obligatwa — multipart field 'audio' manke"), 400);
  const audioFile = (req.files as any).audio[0];
  log(4, "validation", {
    title: title.trim(), artist: artist.trim(), type,
    audioName: audioFile.originalname, audioMime: audioFile.mimetype,
    audioBytes: audioFile.size ?? audioFile.buffer?.byteLength,
    hasCover: !!(req.files as any).cover?.[0],
  });

  // ── Step 5: Storage configuration check ──────────────────────────────────
  if (!wasabiConfigured()) {
    return fail(5, "storage_config", new Error("Wasabi pa konfigiré — manke WASABI_ACCESS_KEY_ID / WASABI_SECRET_ACCESS_KEY / WASABI_BUCKET_NAME"), 503);
  }
  log(5, "storage_config", { provider: "wasabi" });

  // ── Step 6: Audio upload (Wasabi — with optional ffmpeg conversion) ───────
  let uploadBuffer = audioFile.buffer as Buffer;
  let uploadMime   = audioFile.mimetype as string;
  let uploadName   = audioFile.originalname as string;

  if (needsConversion(audioFile.mimetype)) {
    log(6, "audio_convert_start", { mime: audioFile.mimetype, bytes: uploadBuffer?.byteLength });
    const converted = await convertAudioToMp3(uploadBuffer, audioFile.mimetype, audioFile.originalname);
    if (converted) {
      uploadBuffer = converted.buffer;
      uploadMime   = converted.mime;
      uploadName   = uploadName.replace(/\.[^.]+$/, "") + ".mp3";
      log(6, "audio_convert_done", { newBytes: uploadBuffer.byteLength });
    } else {
      log(6, "audio_convert_skip", { reason: "ffmpeg unavailable or failed — uploading original" });
    }
  }

  log(6, "audio_upload_start", { mime: uploadMime, bytes: uploadBuffer?.byteLength });
  let audioResult: { key: string; url: string };
  try {
    audioResult = await uploadMusicAudio(uploadBuffer, uploadMime, uploadName);
  } catch (err: any) {
    return fail(6, "audio_upload", err);
  }
  log(7, "audio_upload_complete", { key: audioResult.key, url: audioResult.url });

  // ── Step 6b: Cover upload — Wasabi (optional) ──────────────────────────
  let coverResult: { key: string; url: string } | null = null;
  if ((req.files as any).cover?.[0]) {
    const coverFile = (req.files as any).cover[0];
    log(6, "cover_upload_start", { mime: coverFile.mimetype, bytes: coverFile.buffer?.byteLength });
    try {
      coverResult = await uploadMusicCover(coverFile.buffer, coverFile.mimetype, coverFile.originalname);
      log(7, "cover_upload_complete", { key: coverResult.key });
    } catch (err: any) {
      // Cover failure is non-fatal — log and continue without cover
      logger.warn({ uploadId, err: err.message }, "[upload] cover upload failed — continuing without cover");
    }
  }

  // ── Step 9: Database insert ───────────────────────────────────────────────
  log(9, "db_insert_start", { audioKey: audioResult.key });
  let track: any;
  try {
    const row = await insertArtistTrackWithAdmission(req.user,
      `INSERT INTO music_tracks
         (title, artist, album, genre, audio_url, cover_url, storage_key, cover_storage_key,
          type, lyrics, is_active, is_featured, created_by, artist_user_id)
       VALUES
         (${nullOr(title.trim())}, ${nullOr(artist.trim())},
          ${nullOr(album?.trim() || null)}, ${nullOr(genre?.trim() || null)},
          ${nullOr(audioResult.url)}, ${nullOr(coverResult?.url || null)},
          ${nullOr(audioResult.key)}, ${nullOr(coverResult?.key || null)},
          ${nullOr(type)}, ${nullOr(lyrics?.trim() || null)}, TRUE, FALSE,
          ${nullOr(req.user?.id)}, ${nullOr(req.user?.id)})
       RETURNING *`,
    );
    track = row;
  } catch (err: any) {
    // Audio was already uploaded — log the orphan key so admin can clean it up
    logger.error({ uploadId, orphanKey: audioResult.key, err: err.message },
      "[upload] DB insert failed — Wasabi object uploaded but not recorded in DB");
    if (err instanceof ArtistPlanRequiredError) {
      return res.status(403).json({
        error: "ARTIST_PLAN_REQUIRED",
        count: err.songCount,
        limit: err.freeSongLimit,
        step: 9,
        stepName: "db_insert_admission",
        uploadId,
      });
    }
    return fail(9, "db_insert", err);
  }
  log(9, "db_insert_complete", { trackId: track.id, storageKey: track.storage_key });

  // ── Step 10: Success ──────────────────────────────────────────────────────
  log(10, "success_response", { trackId: track.id, uploadId });
  res.status(201).json({
    track:   toClientTrack(track),
    message: "Track soumèt — admin ap revize li anvan li parèt",
    uploadId,
  });
});

// POST /api/admin/music — create track
router.post("/admin/music", requireAdmin, upload.fields([
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

// PUT /api/music/:id — artist updates their OWN track (title, artist, album, genre, cover, lyrics)
router.put("/music/:id", requireAuth, upload.single("cover"), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.userId;
    const [existing] = await q<{ id: number; artist_user_id: number | null }>(
      `SELECT id, artist_user_id FROM music_tracks WHERE id = ${id}`
    );
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!existing.artist_user_id || existing.artist_user_id !== userId) {
      return res.status(403).json({ error: "You can only edit your own tracks" });
    }
    const { title, artist, album, genre, cover_url, lyrics } = req.body;
    let coverResult: { key: string; url: string } | null = null;
    if (req.file) {
      coverResult = await uploadMusicCover(req.file.buffer, req.file.mimetype, req.file.originalname);
    }
    const sets: string[] = [];
    if (title   !== undefined) sets.push(`title   = ${nullOr(title)}`);
    if (artist  !== undefined) sets.push(`artist  = ${nullOr(artist)}`);
    if (album   !== undefined) sets.push(`album   = ${nullOr(album  || null)}`);
    if (genre   !== undefined) sets.push(`genre   = ${nullOr(genre  || null)}`);
    if (coverResult) {
      sets.push(`cover_url = ${nullOr(coverResult.url)}`);
      sets.push(`cover_storage_key = ${nullOr(coverResult.key)}`);
    } else if (cover_url !== undefined) {
      sets.push(`cover_url = ${nullOr(cover_url)}`);
    }
    if (lyrics  !== undefined) sets.push(`lyrics  = ${nullOr(lyrics || null)}`);
    sets.push("updated_at = NOW()");
    const [track] = await q(`UPDATE music_tracks SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`);
    if (coverResult) {
      const oldCoverKey = (existing as any).cover_storage_key ?? extractKey((existing as any).cover_url);
      if (oldCoverKey && !oldCoverKey.startsWith("cld:")) await deleteMusicFile(oldCoverKey);
    }
    res.json({ track });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// DELETE /api/music/:id — artist deletes their OWN track
router.delete("/music/:id", requireAuth, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.userId;
    const [row] = await q<{ artist_user_id: number | null; storage_key: string | null; cover_storage_key: string | null; audio_url: string | null; cover_url: string | null }>(
      `SELECT artist_user_id, storage_key, cover_storage_key, audio_url, cover_url FROM music_tracks WHERE id = ${id}`
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    if (!row.artist_user_id || row.artist_user_id !== userId) {
      return res.status(403).json({ error: "You can only delete your own tracks" });
    }
    await q(`DELETE FROM music_tracks WHERE id = ${id}`);
    // Best-effort cleanup of stored files
    await Promise.allSettled([
      deleteMusicFile(row.storage_key       ?? extractKey(row.audio_url)),
      deleteMusicFile(row.cover_storage_key ?? extractKey(row.cover_url)),
    ]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// PUT /api/admin/music/:id — update
router.put("/admin/music/:id", requireAdmin, upload.fields([
  { name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 },
]), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await q(`SELECT * FROM music_tracks WHERE id = ${id}`);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const { title, artist, album, genre, duration_seconds, type, is_featured, is_active,
            audio_url, cover_url, artist_user_id,
            license, monetization_type, price_usd, copyright_status, tags, lyrics } = req.body;

    let finalAudio  = audio_url  !== undefined ? audio_url  : existing.audio_url;
    let finalCover  = cover_url  !== undefined ? cover_url  : existing.cover_url;
    let newAudioKey: string | null = (existing.storage_key       as string | null) ?? null;
    let newCoverKey: string | null = (existing.cover_storage_key as string | null) ?? null;

    if (req.files?.audio?.[0]) {
      // Upload new audio to Wasabi then clean up the old Wasabi object.
      const file   = req.files.audio[0];
      const result = await uploadMusicAudio(file.buffer, file.mimetype, file.originalname);
      finalAudio   = result.url;
      const oldKey = (existing.storage_key as string | null) ?? extractKey(existing.audio_url as string | null);
      // Legacy Cloudinary records have no Wasabi object to delete.
      if (oldKey && !oldKey.startsWith("cld:")) await deleteMusicFile(oldKey);
      newAudioKey  = result.key;
    }
    if (req.files?.cover?.[0]) {
      // Upload new cover to Wasabi then clean up the old Wasabi object.
      const file   = req.files.cover[0];
      const result = await uploadMusicCover(file.buffer, file.mimetype, file.originalname);
      finalCover   = result.url;
      const oldKey = (existing.cover_storage_key as string | null) ?? extractKey(existing.cover_url as string | null);
      if (oldKey && !oldKey.startsWith("cld:")) await deleteMusicFile(oldKey);
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
    if (lyrics !== undefined)           sets.push(`lyrics = ${nullOr(lyrics || null)}`);
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
router.delete("/admin/music/:id", requireAdmin, async (req, res) => {
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
router.get("/admin/music/storage-stats", requireAdmin, async (_req, res) => {
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
router.post("/admin/music/bulk-action", requireAdmin, async (req, res) => {
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

// ── Provider API-key management ───────────────────────────────────────────────

// GET /api/admin/music/providers — which providers have a saved key
router.get("/admin/music/providers", requireAdmin, async (_req, res) => {
  try {
    const rows = await q<{ key: string; value: string }>(
      `SELECT key, value FROM platform_settings WHERE key LIKE 'music_api_%'`
    );
    const connected: Record<string, boolean> = {};
    for (const r of rows) connected[r.key.replace("music_api_", "")] = !!r.value;
    res.json({ connected });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/admin/music/providers/connect — save or update an API key
router.post("/admin/music/providers/connect", requireAdmin, async (req: any, res) => {
  try {
    const { provider, apiKey } = req.body as { provider: string; apiKey: string };
    if (!provider || !apiKey?.trim()) return res.status(400).json({ error: "provider and apiKey required" });
    const safeId = provider.replace(/[^a-z0-9_]/gi, "");
    await q(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ('music_api_${safeId}', ${nullOr(apiKey.trim())}, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
    );
    logger.info({ provider: safeId }, "Music provider API key saved");
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/admin/music/providers/disconnect — remove a saved key
router.post("/admin/music/providers/disconnect", requireAdmin, async (req: any, res) => {
  try {
    const { provider } = req.body as { provider: string };
    const safeId = (provider ?? "").replace(/[^a-z0-9_]/gi, "");
    await q(`DELETE FROM platform_settings WHERE key = 'music_api_${safeId}'`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/admin/music/providers/test — validate an API key with a live request
router.post("/admin/music/providers/test", requireAdmin, async (req: any, res) => {
  const { provider, apiKey } = req.body as { provider: string; apiKey: string };
  try {
    let ok = false;
    let message = "";
    const key = apiKey?.trim() || (
      await q<{ value: string }>(`SELECT value FROM platform_settings WHERE key = 'music_api_${provider}' LIMIT 1`)
        .then(r => r[0]?.value ?? "").catch(() => "")
    );
    switch (provider) {
      case "pixabay": {
        // Try music endpoint first; fall back to image API to at least validate the key
        let pxOk = false;
        let pxMsg = "";
        try {
          const r = await fetch(`https://pixabay.com/api/music/?key=${encodeURIComponent(key)}&q=music&per_page=3`, { signal: AbortSignal.timeout(8000) });
          const d = await r.json().catch(() => ({}));
          pxOk = r.ok && !d.error && d.hits !== undefined;
          pxMsg = pxOk ? `✅ Pixabay Music — ${d.totalHits ?? 0} chante disponib` : (d.error ?? "");
        } catch { /* music endpoint unavailable */ }
        if (!pxOk) {
          // Validate key via standard image API
          const r2 = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=music&per_page=3`, { signal: AbortSignal.timeout(8000) });
          const d2 = await r2.json().catch(() => ({}));
          pxOk = r2.ok && !d2.error;
          pxMsg = pxOk ? `✅ Kle Pixabay valab (API mizik limite — chèche aktif)` : (d2.error ?? "Kle invalid");
        }
        ok = pxOk;
        message = pxMsg || (ok ? "✅ Pixabay konekte" : "❌ Kle Pixabay invalid");
        break;
      }
      case "fma": {
        const r = await fetch(`https://freemusicarchive.org/api/get/tracks.json?api_key=${encodeURIComponent(key)}&limit=1`);
        ok = r.ok;
        message = ok ? "✅ Free Music Archive konekte" : "Kle FMA invalid";
        break;
      }
      case "archive": {
        const r = await fetch("https://archive.org/advancedsearch.php?q=subject:music&output=json&rows=1&fl[]=identifier");
        ok = r.ok;
        message = ok ? "✅ Internet Archive aksesib (pa bezwen kle)" : "Koneksyon Internet Archive echwe";
        break;
      }
      case "ccmixter": {
        const r = await fetch("https://ccmixter.org/api/query?f=json&limit=1");
        ok = r.ok;
        message = ok ? "✅ ccMixter aksesib (pa bezwen kle)" : "Koneksyon ccMixter echwe";
        break;
      }
      default:
        return res.status(400).json({ error: "Pwovide enkoni" });
    }
    res.json({ ok, message });
  } catch (err: any) { res.json({ ok: false, message: err?.message ?? "Koneksyon echwe" }); }
});

// GET /api/admin/music/pixabay/search?q=...&limit=20 — Pixabay Music search proxy
router.get("/admin/music/pixabay/search", requireAdmin, async (req: any, res) => {
  try {
    const rows = await q<{ value: string }>(`SELECT value FROM platform_settings WHERE key = 'music_api_pixabay' LIMIT 1`);
    const apiKey = rows[0]?.value;
    if (!apiKey) return res.status(400).json({ error: "Kle API Pixabay pa konfigiré. Konekte Pixabay anvan." });
    const q2  = String(req.query.q ?? "music").trim() || "music";
    const lim = Math.min(Number(req.query.limit ?? 20), 100);
    // Try music endpoint first
    let hits: Record<string, unknown>[] = [];
    let tried = false;
    try {
      const r = await fetch(`https://pixabay.com/api/music/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q2)}&per_page=${lim}`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && !d.error && Array.isArray(d.hits)) { hits = d.hits; tried = true; }
    } catch { /* music endpoint unavailable */ }
    if (!tried) {
      // Fall back to image API (same key, returns images related to query — limited but validates key)
      const r2 = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q2)}&per_page=${lim}`, { signal: AbortSignal.timeout(10000) });
      const d2 = await r2.json().catch(() => ({}));
      if (d2.error) return res.status(502).json({ error: d2.error });
      // No actual music tracks from image API — return empty with a note
      return res.json({ results: [], note: "API mizik Pixabay limite — itilize Jamendo pou mizik gratis." });
    }
    res.json({
      results: hits.map((h: Record<string, unknown>) => ({
        id:           h.id,
        name:         h.tags ?? h.title ?? "Untitled",
        artist_name:  h.user  ?? "Pixabay",
        duration:     h.duration ?? 0,
        audio:        h.audio ?? h.previewURL,
        image:        h.image ?? null,
        tags:         h.tags  ?? "",
        license_ccurl: "pixabay_license",
      })),
    });
  } catch (err: any) { res.status(502).json({ error: err?.message }); }
});

// GET /api/admin/music/jamendo/search?q=...&limit=20 — server-side Jamendo search proxy (avoids browser CORS)
router.get("/admin/music/jamendo/search", requireAdmin, async (req, res) => {
  try {
    const q2   = String(req.query.q   ?? "music").trim() || "music";
    const lim  = Math.min(Number(req.query.limit ?? 20), 50);
    const url  = `https://api.jamendo.com/v3.0/tracks/?client_id=b6747d04&limit=${lim}&offset=0&search=${encodeURIComponent(q2)}&audioformat=mp31&include=musicinfo&imagesize=200`;
    const resp = await fetch(url);
    if (!resp.ok) return res.status(502).json({ error: "Jamendo API error" });
    const data = await resp.json();
    res.json({ results: data.results ?? [] });
  } catch (err: any) { res.status(502).json({ error: err?.message ?? "Jamendo unreachable" }); }
});

// POST /api/admin/music/jamendo/bulk — server-side bulk import from Jamendo (fetch + insert, no browser CORS)
// body: { count: number }
router.post("/admin/music/jamendo/bulk", requireAdmin, async (req: any, res) => {
  const count   = Math.min(Number(req.body?.count ?? 100), 10000);
  const perPage = 20;
  const pages   = Math.ceil(count / perPage);
  let   imported2 = 0;
  let   skipped   = 0;
  try {
    for (let p = 0; p < pages; p++) {
      const url  = `https://api.jamendo.com/v3.0/tracks/?client_id=b6747d04&limit=${perPage}&offset=${p * perPage}&orderby=popularity_total&audioformat=mp31&imagesize=200`;
      const resp = await fetch(url);
      if (!resp.ok) break;
      const data  = await resp.json();
      const tracks: Array<Record<string, unknown>> = data.results ?? [];
      if (!tracks.length) break;
      for (const t of tracks) {
        if (imported2 >= count) break;
        if (!t.audio) { skipped++; continue; }
        try {
          await q(
            `INSERT INTO music_tracks
               (title, artist, album, audio_url, cover_url, duration_seconds,
                type, is_active, is_featured, license, tags, copyright_status, created_by)
             VALUES
               (${nullOr(String(t.name ?? "").trim())}, ${nullOr(String(t.artist_name ?? "").trim())},
                ${nullOr(t.album_name ? String(t.album_name) : null)},
                ${nullOr(String(t.audio))}, ${nullOr(t.image ? String(t.image) : null)},
                ${nullOr(t.duration ? Number(t.duration) : null)},
                'free', TRUE, FALSE,
                ${nullOr(t.license_ccurl ? String(t.license_ccurl) : "creative_commons")},
                ${nullOr(t.tags ? String(t.tags) : null)},
                'creative_commons', ${nullOr(req.user?.id)})
             ON CONFLICT DO NOTHING`
          );
          imported2++;
        } catch { skipped++; }
      }
      if (tracks.length < perPage) break;
    }
    logger.info({ imported2, skipped }, "Jamendo bulk import complete");
    res.json({ imported: imported2, skipped });
  } catch (err: any) { res.status(500).json({ error: err?.message, imported: imported2 }); }
});

// POST /api/admin/music/import — save track imported from a free music API
router.post("/admin/music/import", requireAdmin, async (req: any, res) => {
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
router.put("/admin/music/:id/monetization", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { monetization_type, price_usd } = req.body as { monetization_type: string; price_usd?: number };
    await q(`UPDATE music_tracks SET monetization_type = ${nullOr(monetization_type)}, price_usd = ${nullOr(price_usd ?? null)}, updated_at = NOW() WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// PUT /api/admin/music/:id/copyright
router.put("/admin/music/:id/copyright", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { copyright_status } = req.body as { copyright_status: string };
    await q(`UPDATE music_tracks SET copyright_status = ${nullOr(copyright_status)}, updated_at = NOW() WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ── Playlists CRUD ─────────────────────────────────────────────────────────────

// GET /api/admin/music/playlists
router.get("/admin/music/playlists", requireAdmin, async (_req, res) => {
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
router.post("/admin/music/playlists", requireAdmin, upload.fields([{ name: "cover", maxCount: 1 }]), async (req: any, res) => {
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
router.put("/admin/music/playlists/:id", requireAdmin, async (req, res) => {
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
router.delete("/admin/music/playlists/:id", requireAdmin, async (req, res) => {
  try {
    await q(`DELETE FROM music_playlists WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// GET /api/admin/music/artists — aggregate artist stats
router.get("/admin/music/artists", requireAdmin, async (_req, res) => {
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
router.put("/admin/music/artists/verify", requireAdmin, async (req, res) => {
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
router.get("/music/stream/*key", async (req, res) => {
  try {
    const key = (req.params as any).key as string;
    if (!key) return res.status(400).json({ error: "Missing storage key" });

    // Cloudinary assets — look up the stored URL and redirect directly
    if (key.startsWith("cld:")) {
      const rows = await q(`SELECT audio_url FROM music_tracks WHERE storage_key = '${esc(key)}' LIMIT 1`);
      const url  = rows[0]?.audio_url as string | null;
      if (!url) return res.status(404).json({ error: "Track not found" });
      return res.redirect(302, url);
    }

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
router.get("/music/stream-url/:trackId", async (req, res) => {
  try {
    const [track] = await q(`SELECT storage_key, audio_url FROM music_tracks WHERE id = ${Number(req.params.trackId)} AND is_active = TRUE`);
    if (!track) return res.status(404).json({ error: "Track not found" });
    const key = (track.storage_key as string | null) ?? extractKey(track.audio_url as string);
    if (!key) return res.status(404).json({ error: "No storage key for this track" });
    const url = await getStreamUrl(key);
    res.json({ url, key });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ── Music Activity Feed (notifications drawer) ────────────────────────────────
// GET /api/music/activity — artist's recent comments, likes, and earnings
router.get("/music/activity", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    // Comments on the artist's tracks (by others)
    const comments = await q(`
      SELECT 'comment' AS type,
             mc.id, mc.created_at,
             u.name  AS actor_name, u.avatar AS actor_avatar,
             mt.title AS track_title, mt.id AS track_id,
             mc.content AS detail
      FROM music_comments mc
      JOIN music_tracks mt ON mt.id = mc.track_id
      JOIN users u          ON u.id  = mc.user_id
      WHERE mt.artist_user_id = ${userId} AND mc.user_id != ${userId}
      ORDER BY mc.created_at DESC LIMIT 20
    `);
    // Likes on the artist's tracks (by others)
    const likes = await q(`
      SELECT 'like' AS type,
             ml.id, ml.created_at,
             u.name  AS actor_name, u.avatar AS actor_avatar,
             mt.title AS track_title, mt.id AS track_id,
             NULL AS detail
      FROM music_likes ml
      JOIN music_tracks mt ON mt.id = ml.track_id
      JOIN users u          ON u.id  = ml.user_id
      WHERE mt.artist_user_id = ${userId} AND ml.user_id != ${userId}
      ORDER BY ml.created_at DESC LIMIT 20
    `);
    // Earnings milestones
    const earnings = await q(`
      SELECT 'earning' AS type,
             me.id, me.created_at,
             NULL AS actor_name, NULL AS actor_avatar,
             mt.title AS track_title, me.track_id,
             me.description AS detail
      FROM music_earnings me
      JOIN music_tracks mt ON mt.id = me.track_id
      WHERE me.artist_id = ${userId}
      ORDER BY me.created_at DESC LIMIT 10
    `);
    // Merge & sort newest-first
    const all = [...comments, ...likes, ...earnings].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 40);
    res.json({ activity: all });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ── Music Likes ───────────────────────────────────────────────────────────────

// GET /api/music/:id/likes  — public; optionalAuth fills req.userId for "liked" flag
router.get("/music/:id/likes", optionalAuth, async (req, res) => {
  const trackId = Number(req.params.id);
  if (!trackId) return res.status(400).json({ error: "Invalid track" });
  try {
    const [row] = await q(`SELECT COUNT(*)::int AS count FROM music_likes WHERE track_id = ${trackId}`);
    let liked = false;
    if (req.userId) {
      const [l] = await q(`SELECT 1 FROM music_likes WHERE track_id = ${trackId} AND user_id = ${req.userId}`);
      liked = !!l;
    }
    res.json({ count: row?.count ?? 0, liked });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/music/:id/like  — toggle (auth required)
router.post("/music/:id/like", requireAuth, async (req, res) => {
  const trackId = Number(req.params.id);
  if (!trackId) return res.status(400).json({ error: "Invalid track" });
  try {
    const [existing] = await q(
      `SELECT 1 FROM music_likes WHERE track_id = ${trackId} AND user_id = ${req.userId}`
    );
    if (existing) {
      await q(`DELETE FROM music_likes WHERE track_id = ${trackId} AND user_id = ${req.userId}`);
    } else {
      await q(
        `INSERT INTO music_likes (track_id, user_id) VALUES (${trackId}, ${req.userId}) ON CONFLICT DO NOTHING`
      );
    }
    const [row] = await q(`SELECT COUNT(*)::int AS count FROM music_likes WHERE track_id = ${trackId}`);
    res.json({ liked: !existing, count: row?.count ?? 0 });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ── Music Comments ────────────────────────────────────────────────────────────

// GET /api/music/:id/comments
router.get("/music/:id/comments", async (req, res) => {
  const trackId = Number(req.params.id);
  if (!trackId) return res.status(400).json({ error: "Invalid track" });
  try {
    const rows = await q(`
      SELECT mc.id, mc.content, mc.created_at,
             u.id          AS user_id,
             u.name        AS user_name,
             u.avatar      AS user_avatar,
             u.is_verified AS user_is_verified
      FROM music_comments mc
      JOIN users u ON u.id = mc.user_id
      WHERE mc.track_id = ${trackId}
      ORDER BY mc.created_at ASC
      LIMIT 100
    `);
    res.json({ comments: rows });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// POST /api/music/:id/comments
router.post("/music/:id/comments", requireAuth, async (req, res) => {
  const trackId = Number(req.params.id);
  if (!trackId) return res.status(400).json({ error: "Invalid track" });
  const { content } = req.body as { content?: string };
  if (!content?.trim())          return res.status(400).json({ error: "Comment cannot be empty" });
  if (content.trim().length > 500) return res.status(400).json({ error: "Comment too long (max 500)" });
  try {
    const [track] = await q(`SELECT id FROM music_tracks WHERE id = ${trackId} AND is_active = TRUE`);
    if (!track) return res.status(404).json({ error: "Track not found" });
    const [row] = await q(`
      INSERT INTO music_comments (track_id, user_id, content)
      VALUES (${trackId}, ${req.userId}, ${nullOr(content.trim())})
      RETURNING id, content, created_at
    `);
    const [actor] = await q(
      `SELECT name, avatar, is_verified FROM users WHERE id = ${req.userId}`
    );
    res.status(201).json({
      id: row.id, content: row.content, created_at: row.created_at,
      user_id: req.userId,
      user_name: actor?.name ?? "Utilisateur",
      user_avatar: actor?.avatar ?? null,
      user_is_verified: actor?.is_verified ?? false,
    });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// DELETE /api/music/comments/:commentId  — owner or admin only
router.delete("/music/comments/:commentId", requireAuth, async (req, res) => {
  const commentId = Number(req.params.commentId);
  if (!commentId) return res.status(400).json({ error: "Invalid comment" });
  try {
    const [comment] = await q(`SELECT user_id FROM music_comments WHERE id = ${commentId}`);
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    if (comment.user_id !== req.userId && !req.user?.isAdmin)
      return res.status(403).json({ error: "Not allowed" });
    await q(`DELETE FROM music_comments WHERE id = ${commentId}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MONTHLY EARNINGS REMINDER JOB
// Runs via setInterval every hour; fires on the 1st of each month (once only).
// Sends an Expo push to every artist who has unpaid music_earnings > 0.
// ══════════════════════════════════════════════════════════════════════════════
let _lastReminderMonth = "";   // "YYYY-MM" — prevents double-firing same month

export async function runMusicMonthlyReminder(): Promise<void> {
  const now   = new Date();
  const day   = now.getDate();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Only fire on the 1st, once per month
  if (day !== 1 || month === _lastReminderMonth) return;
  _lastReminderMonth = month;

  try {
    // All artists with unpaid earnings ≥ $1
    const artists = await q<{ artist_id: number; total: string }>(
      `SELECT artist_id, COALESCE(SUM(amount_usd), 0)::text AS total
       FROM music_earnings
       WHERE is_paid_out = FALSE
       GROUP BY artist_id
       HAVING SUM(amount_usd) >= 1`
    );

    if (!artists.length) {
      logger.info("[music-reminder] No artists with balance ≥ $1 — skipping");
      return;
    }

    const { sendExpoPushToUser } = await import("../lib/expo-push");

    let sent = 0;
    for (const row of artists) {
      const amount = Number(row.total).toFixed(2);
      await sendExpoPushToUser(row.artist_id, {
        title: "🎵 Balans mizik ou prèt pou retire",
        body:  `Ou gen $${amount} nan kont mizik ou. Yon klik pou transfere nan kart FM ou.`,
        data:  { screen: "MusicEarnings" },
      });
      sent++;
    }

    logger.info({ sent, month }, "[music-reminder] Monthly earnings reminder sent");
  } catch (err) {
    logger.error({ err }, "[music-reminder] Failed to send monthly reminders");
  }
}

// New uploads are Wasabi-only. Orphan cleanup is performed by the upload worker;
// this endpoint is intentionally retired rather than accepting arbitrary object keys.
router.post("/music/cleanup-orphan", requireAuth, (_req, res) => {
  res.status(410).json({ error: "Cloudinary cleanup is retired. Music uploads use Wasabi only." });
});

export default router;
