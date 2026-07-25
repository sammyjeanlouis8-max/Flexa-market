#!/bin/bash
set -e

# Install workspace dependencies to match the merged lockfile.
pnpm install --frozen-lockfile

# NOTE: Do NOT run `drizzle-kit push` here.
# The API server is the operational source of truth for the database schema:
# it applies idempotent `CREATE TABLE IF NOT EXISTS` migrations on startup via
# runStartupMigrations() (artifacts/api-server/src/lib/migrations.ts). Several
# live tables (e.g. bnpl_settings, loan_applications, chargebacks, order_returns)
# exist only in those migrations and are NOT in the drizzle schema, so a
# `drizzle-kit push` would try to DROP them and cause data loss.
# Schema changes are applied automatically when workflow reconciliation
# restarts the running api-server workflow after this script.
