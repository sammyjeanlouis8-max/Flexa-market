-- Phase 3Q — ROLLBACK for Advantage+ geo recovery.
-- Restores department/commune from the temp snapshot tables created in 02_apply.sql
-- within the SAME database session (temp tables are session-scoped).
--
-- If the apply transaction already committed and the session ended, restore from
-- the CSV/JSON export taken before apply instead (re-INSERT prior values by id).

BEGIN;

UPDATE listings l
SET
  boost_audience_state = s.boost_audience_state,
  boost_audience_city = s.boost_audience_city,
  boost_audience_cities = s.boost_audience_cities
FROM boost_geo_recovery_listings s
WHERE l.id = s.id;

UPDATE boosts b
SET
  audience_state = s.audience_state,
  audience_city = s.audience_city,
  audience_cities = s.audience_cities
FROM boost_geo_recovery_boosts s
WHERE b.id = s.id;

-- COMMIT only after verifying restored row counts match the snapshot.
-- COMMIT;
ROLLBACK;