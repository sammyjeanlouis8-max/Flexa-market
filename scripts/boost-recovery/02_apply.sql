-- Phase 3Q — APPLY Advantage+ geo recovery (REQUIRES EXPLICIT WRITTEN APPROVAL).
-- Clears only unintended department/commune on Advantage+ campaigns.
-- Does NOT modify: country, ownership, moderation, payment, budget, impressions,
-- starts_at, expires_at, analytics events.
-- Does NOT reactivate expired/rejected/unpaid/suspended campaigns.
-- Idempotent: re-running is a no-op when geo columns are already NULL.
--
-- BEFORE RUNNING:
--   1. Run 01_preview.sql and export campaign_id list approved for geo clear.
--   2. Exclude rows with business_review_required_no_silent_extend = true
--      (expired + zero impressions → authorized business review, not silent extend).
--   3. Replace the IN (...) lists below with approved IDs.
--   4. Take a backup snapshot of the selected rows (see 03_rollback.sql).

BEGIN;

-- Snapshot for rollback (session temp tables)
CREATE TEMP TABLE IF NOT EXISTS boost_geo_recovery_listings AS
SELECT id, boost_audience_state, boost_audience_city, boost_audience_cities
FROM listings
WHERE false;

CREATE TEMP TABLE IF NOT EXISTS boost_geo_recovery_boosts AS
SELECT id, audience_state, audience_city, audience_cities
FROM boosts
WHERE false;

-- Replace these IDs with the approved set from preview/export.
-- Example placeholders must be edited before execution.
WITH approved_boosts AS (
  SELECT id, listing_id
  FROM boosts
  WHERE id IN (
    -- APPROVED_BOOST_IDS_HERE
    -1
  )
  AND payment_status = 'paid'
  AND COALESCE(audience_type, 'advantage_plus') = 'advantage_plus'
  AND expires_at > NOW()
),
snap_listings AS (
  INSERT INTO boost_geo_recovery_listings (id, boost_audience_state, boost_audience_city, boost_audience_cities)
  SELECT l.id, l.boost_audience_state, l.boost_audience_city, l.boost_audience_cities
  FROM listings l
  JOIN approved_boosts ab ON ab.listing_id = l.id
  WHERE COALESCE(l.boost_audience_type, 'advantage_plus') = 'advantage_plus'
  RETURNING id
),
snap_boosts AS (
  INSERT INTO boost_geo_recovery_boosts (id, audience_state, audience_city, audience_cities)
  SELECT b.id, b.audience_state, b.audience_city, b.audience_cities
  FROM boosts b
  JOIN approved_boosts ab ON ab.id = b.id
  RETURNING id
)
SELECT
  (SELECT COUNT(*) FROM snap_listings) AS listings_snapshotted,
  (SELECT COUNT(*) FROM snap_boosts) AS boosts_snapshotted;

UPDATE listings l
SET
  boost_audience_state = NULL,
  boost_audience_city = NULL,
  boost_audience_cities = NULL
FROM boosts b
WHERE l.id = b.listing_id
  AND b.id IN (SELECT id FROM boost_geo_recovery_boosts)
  AND COALESCE(l.boost_audience_type, 'advantage_plus') = 'advantage_plus'
  AND COALESCE(b.audience_type, 'advantage_plus') = 'advantage_plus'
  AND b.payment_status = 'paid'
  AND b.expires_at > NOW()
  AND (
    l.boost_audience_state IS NOT NULL
    OR l.boost_audience_city IS NOT NULL
    OR COALESCE(cardinality(l.boost_audience_cities), 0) > 0
  );

UPDATE boosts b
SET
  audience_state = NULL,
  audience_city = NULL,
  audience_cities = NULL
WHERE b.id IN (SELECT id FROM boost_geo_recovery_boosts)
  AND COALESCE(b.audience_type, 'advantage_plus') = 'advantage_plus'
  AND b.payment_status = 'paid'
  AND b.expires_at > NOW()
  AND (
    b.audience_state IS NOT NULL
    OR b.audience_city IS NOT NULL
    OR COALESCE(cardinality(b.audience_cities), 0) > 0
  );

-- Audit log (application may also write admin_logs via API; this is DB-visible).
-- Optional: INSERT into admin_logs if schema available in this environment.

-- STOP: review row counts, then COMMIT; or ROLLBACK to abort.
-- COMMIT;
ROLLBACK;