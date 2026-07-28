---
name: Flexa music schema migrations
description: music_tracks columns added post-initial-schema need explicit ADD COLUMN migrations or SELECT queries 500 on production
---

## The rule
Any column added to `music_tracks` (or any other table) after its initial `CREATE TABLE IF NOT EXISTS` migration **must** have its own `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migration entry. Relying solely on the CREATE TABLE statement means existing production tables never get the column.

**Why:** Production DB already has the table from the initial migration. `CREATE TABLE IF NOT EXISTS` is a no-op when the table exists, so new columns declared there are never added to live databases. The missing column causes every SELECT that references it to throw a PG "column does not exist" 500 error, which the frontend catches silently and treats as an empty result set.

**How to apply:** When adding a new column anywhere in the codebase, immediately add a corresponding migration line:
```ts
migrations.push({ name: "table_name.column_name", sql: "ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE NOT NULL DEFAULT value" });
```
Place it after the CREATE TABLE block for that table, before any logic that SELECTs the column.

**Known example:** `music_tracks.estimated_revenue_usd` was declared in the CREATE TABLE block but had no ADD COLUMN migration. `GET /api/music` selected it, production returned 500 on every call, and the FlexaMusic home screen showed "Pa gen chante disponib ankò" even though tracks existed in the DB.
