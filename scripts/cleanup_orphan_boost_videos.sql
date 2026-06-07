-- ============================================================================
-- Flexa-Market — Cleanup: orphaned promo-video boost rows
-- Author: priority-fix release, June 2026
-- ============================================================================
--
-- Context
-- -------
-- Before commit `4a7edd3` the `BoostWizard.chunkedUpload()` client code
-- discarded the server's response body from `/api/storage/uploads/chunk-finalize`.
-- In Cloudinary-mode deployments the server response contains the real
-- Cloudinary `secure_url` (e.g. https://res.cloudinary.com/...) of the saved
-- video, but the client wrote the LOCAL `objectPath` placeholder
-- (`/objects/uploads/<uuid>`) into `listings.boost_video_url` instead.
--
-- Effect: Cloudinary actually saved the file, but the listing row points at a
-- non-existent GCS path → every playback returns 404 → the user reports
-- "video disappears after refresh".
--
-- Scope of this cleanup
-- ---------------------
-- Identify and NULL-out only the affected rows:
--   - boost_video_url matches the pattern `/objects/uploads/<uuid>` AND
--   - the GCS object backing that path does NOT exist (in Cloudinary-mode
--     deployments NONE of them do; in GCS deployments NONE will match this
--     pattern because the affected codepath was Cloudinary-only).
--
-- The cleanup is SAFE to run in Cloudinary-mode production (the only known
-- affected environment). DO NOT run on a deployment that uses GCS exclusively
-- without first confirming there are no rows matching this pattern via the
-- DRY-RUN query in §1 below.
--
-- Order of operations
-- ===========================================================================
-- §1.  DRY-RUN audit (no writes)            — required
-- §2.  Backup affected rows                 — required
-- §3.  Clear boost_video_url on listings    — destructive write
-- §4.  Clear boost_video_url on boosts log  — optional
-- §5.  Verify zero remaining orphan rows    — required
-- §6.  Rollback (if needed)                 — optional
-- ============================================================================


-- ── §1. DRY-RUN AUDIT — read-only, run this FIRST ───────────────────────────

-- 1.a — How many listings are affected?
SELECT COUNT(*) AS affected_listing_count
FROM listings
WHERE boost_video_url LIKE '/objects/uploads/%';

-- 1.b — What do they look like? Sample 10 rows so a human can sanity-check.
SELECT id, title, country, seller_id, boost_video_url, created_at
FROM listings
WHERE boost_video_url LIKE '/objects/uploads/%'
ORDER BY created_at DESC
LIMIT 10;

-- 1.c — How many boosts have orphan video URLs in their own log column?
-- (Only relevant if your schema mirrors the column on `boosts`. Skip the
-- query if you only store it on `listings`.)
-- SELECT COUNT(*) FROM boosts WHERE video_url LIKE '/objects/uploads/%';


-- ── §2. BACKUP AFFECTED ROWS BEFORE WRITES ──────────────────────────────────

-- Snapshot to a quarantine table so the rollback in §6 is one statement.
CREATE TABLE IF NOT EXISTS _backup_orphan_boost_videos_20260607 (
  listing_id        INTEGER PRIMARY KEY,
  boost_video_url   TEXT NOT NULL,
  snapshotted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO _backup_orphan_boost_videos_20260607 (listing_id, boost_video_url)
SELECT id, boost_video_url
FROM listings
WHERE boost_video_url LIKE '/objects/uploads/%'
ON CONFLICT (listing_id) DO NOTHING;

-- Confirm the snapshot count matches the audit count from §1.a:
SELECT COUNT(*) AS backed_up_count FROM _backup_orphan_boost_videos_20260607;


-- ── §3. CLEAR boost_video_url ON LISTINGS (DESTRUCTIVE WRITE) ───────────────

-- Wrap in a transaction so you can ROLLBACK before COMMIT if anything looks
-- wrong in the row-count message.
BEGIN;

UPDATE listings
   SET boost_video_url = NULL
 WHERE boost_video_url LIKE '/objects/uploads/%';

-- The update count printed by psql should equal the §1.a audit count.
-- If they do not match, ROLLBACK and investigate before re-running.

-- COMMIT or ROLLBACK depending on the row count printed above:
-- COMMIT;
-- ROLLBACK;


-- ── §4. (OPTIONAL) MIRROR THE CLEANUP ON `boosts` TABLE ─────────────────────

-- Only run if your schema also stores the URL on individual boost rows.
-- BEGIN;
-- UPDATE boosts
--    SET video_url = NULL
--  WHERE video_url LIKE '/objects/uploads/%';
-- COMMIT;


-- ── §5. VERIFY ZERO REMAINING ORPHAN ROWS ───────────────────────────────────

SELECT COUNT(*) AS remaining_orphans
FROM listings
WHERE boost_video_url LIKE '/objects/uploads/%';
-- Expected: 0


-- ── §6. ROLLBACK (only if the cleanup turned out to be wrong) ───────────────

-- BEGIN;
-- UPDATE listings l
--    SET boost_video_url = b.boost_video_url
--   FROM _backup_orphan_boost_videos_20260607 b
--  WHERE l.id = b.listing_id;
-- COMMIT;
