-- Phase 3Q — READ ONLY preview of Advantage+ campaigns with unintended dept/commune geo.
-- Safe to run against production. Does not mutate rows.
-- Protects advertiser PII: only advertiser_id is selected (no name/email/phone).

BEGIN READ ONLY;

SELECT
  b.id AS campaign_id,
  b.user_id AS advertiser_id,
  COALESCE(b.audience_type, l.boost_audience_type, 'advantage_plus') AS targeting_mode,
  COALESCE(l.boost_audience_country, b.audience_country) AS country,
  COALESCE(l.boost_audience_state, b.audience_state) AS department,
  COALESCE(l.boost_audience_city, b.audience_city) AS commune,
  b.payment_status,
  b.campaign_status,
  l.is_boosted,
  l.moderation_status,
  b.starts_at,
  l.boost_start_at,
  b.expires_at,
  l.boost_expires_at,
  COALESCE(b.impressions, 0) AS impressions,
  CASE
    WHEN l.boost_expires_at IS NULL OR l.boost_expires_at <= NOW() OR b.expires_at <= NOW()
      THEN 'boost_expired'
    WHEN l.boost_start_at IS NOT NULL AND l.boost_start_at > NOW()
      THEN 'boost_not_started'
    ELSE 'advantage_plus_geo_overconstrained'
  END AS exclusion_reason,
  CASE
    WHEN (l.boost_expires_at IS NULL OR l.boost_expires_at <= NOW() OR b.expires_at <= NOW())
      AND COALESCE(b.impressions, 0) = 0
      THEN true
    ELSE false
  END AS business_review_required_no_silent_extend
FROM boosts b
JOIN listings l ON l.id = b.listing_id
WHERE b.payment_status = 'paid'
  AND COALESCE(b.audience_type, l.boost_audience_type, 'advantage_plus') = 'advantage_plus'
  AND (
    NULLIF(BTRIM(COALESCE(l.boost_audience_state, b.audience_state, '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(l.boost_audience_city, b.audience_city, '')), '') IS NOT NULL
    OR COALESCE(cardinality(COALESCE(l.boost_audience_cities, b.audience_cities)), 0) > 0
  )
ORDER BY b.id;

ROLLBACK;