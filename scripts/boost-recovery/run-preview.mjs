#!/usr/bin/env node
/**
 * Phase 3Q — READ-ONLY Advantage+ geo overconstraint audit.
 * Requires DATABASE_URL (or FLEXA_READONLY_DATABASE_URL) in the environment.
 * Never mutates rows. Prints advertiser_id only (no email/phone).
 *
 * Usage:
 *   DATABASE_URL=... node scripts/boost-recovery/run-preview.mjs
 */
import pg from "pg";

const url = process.env.FLEXA_READONLY_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "NO_DATABASE_URL",
      message:
        "Set FLEXA_READONLY_DATABASE_URL or DATABASE_URL for a read-only production audit.",
      affectedCampaignCount: null,
    }),
  );
  process.exit(2);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  statement_timeout: 30_000,
});

await client.connect();
await client.query("BEGIN READ ONLY");

const summary = await client.query(`
  SELECT
    COUNT(*) FILTER (WHERE b.payment_status = 'paid')::int AS paid_total,
    COUNT(*) FILTER (
      WHERE b.payment_status = 'paid'
        AND COALESCE(b.audience_type, l.boost_audience_type, 'advantage_plus') = 'advantage_plus'
        AND (
          NULLIF(BTRIM(COALESCE(l.boost_audience_state, b.audience_state, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(l.boost_audience_city, b.audience_city, '')), '') IS NOT NULL
          OR COALESCE(cardinality(COALESCE(l.boost_audience_cities, b.audience_cities)), 0) > 0
        )
    )::int AS advantage_plus_geo_overconstrained,
    COUNT(*) FILTER (
      WHERE b.payment_status = 'paid'
        AND COALESCE(b.audience_type, l.boost_audience_type, 'advantage_plus') = 'advantage_plus'
        AND (
          NULLIF(BTRIM(COALESCE(l.boost_audience_state, b.audience_state, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(l.boost_audience_city, b.audience_city, '')), '') IS NOT NULL
          OR COALESCE(cardinality(COALESCE(l.boost_audience_cities, b.audience_cities)), 0) > 0
        )
        AND l.boost_expires_at > NOW()
        AND b.expires_at > NOW()
    )::int AS overconstrained_still_in_window,
    COUNT(*) FILTER (
      WHERE b.payment_status = 'paid'
        AND COALESCE(b.audience_type, l.boost_audience_type, 'advantage_plus') = 'advantage_plus'
        AND (
          NULLIF(BTRIM(COALESCE(l.boost_audience_state, b.audience_state, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(l.boost_audience_city, b.audience_city, '')), '') IS NOT NULL
          OR COALESCE(cardinality(COALESCE(l.boost_audience_cities, b.audience_cities)), 0) > 0
        )
        AND (l.boost_expires_at IS NULL OR l.boost_expires_at <= NOW() OR b.expires_at <= NOW())
        AND COALESCE(b.impressions, 0) = 0
    )::int AS expired_zero_impression_business_review,
    COUNT(*) FILTER (
      WHERE b.payment_status = 'paid'
        AND l.is_boosted = true
        AND l.boost_expires_at > NOW()
        AND (l.boost_start_at IS NULL OR l.boost_start_at <= NOW())
        AND COALESCE(b.impressions, 0) = 0
    )::int AS paid_active_zero_impressions
  FROM boosts b
  JOIN listings l ON l.id = b.listing_id
`);

const rows = await client.query(`
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
    COALESCE(b.impressions, 0) AS impressions,
    b.starts_at,
    b.expires_at,
    CASE
      WHEN COALESCE(b.audience_type, l.boost_audience_type, 'advantage_plus') = 'advantage_plus'
        AND (
          NULLIF(BTRIM(COALESCE(l.boost_audience_state, b.audience_state, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(l.boost_audience_city, b.audience_city, '')), '') IS NOT NULL
          OR COALESCE(cardinality(COALESCE(l.boost_audience_cities, b.audience_cities)), 0) > 0
        ) THEN 'advantage_plus_geo_overconstrained'
      ELSE 'other'
    END AS exclusion_reason
  FROM boosts b
  JOIN listings l ON l.id = b.listing_id
  WHERE b.payment_status = 'paid'
    AND COALESCE(b.audience_type, l.boost_audience_type, 'advantage_plus') = 'advantage_plus'
    AND (
      NULLIF(BTRIM(COALESCE(l.boost_audience_state, b.audience_state, '')), '') IS NOT NULL
      OR NULLIF(BTRIM(COALESCE(l.boost_audience_city, b.audience_city, '')), '') IS NOT NULL
      OR COALESCE(cardinality(COALESCE(l.boost_audience_cities, b.audience_cities)), 0) > 0
    )
  ORDER BY b.id DESC
  LIMIT 500
`);

await client.query("ROLLBACK");
await client.end();

const out = {
  ok: true,
  mode: "read_only",
  generatedAt: new Date().toISOString(),
  summary: summary.rows[0],
  affectedCampaignCount: Number(summary.rows[0].advantage_plus_geo_overconstrained),
  campaigns: rows.rows,
};
console.log(JSON.stringify(out, null, 2));
