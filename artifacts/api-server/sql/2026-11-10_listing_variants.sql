-- Additive listing_variants table for multi-SKU support.
-- DO NOT apply to production without explicit approval.
-- Safe: creates empty table; does not mutate existing listings/transactions.

CREATE TABLE IF NOT EXISTS listing_variants (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  sku text,
  size text,
  color text,
  price real,
  stock_quantity integer NOT NULL DEFAULT 0,
  images text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_variants_listing_id_idx
  ON listing_variants (listing_id);

CREATE UNIQUE INDEX IF NOT EXISTS listing_variants_listing_sku_uidx
  ON listing_variants (listing_id, sku)
  WHERE sku IS NOT NULL;
