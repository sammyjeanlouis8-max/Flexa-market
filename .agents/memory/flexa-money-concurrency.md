---
name: Flexa money-flow concurrency
description: How to make wallet/debt money operations race-safe in the Flexa Market backend.
---

The Flexa `@workspace/db` client is built on node-postgres `Pool` (or neon-serverless WebSocket `Pool` when DATABASE_URL is neon) — both support real transactions and `SELECT ... FOR UPDATE`. So `db.transaction(async (tx) => { ... })` with `.for("update")` works and is the correct tool for money flows.

**Rule:** any operation that reads a balance/debt and then mutates money (repay, transfer, cashout, debt block/adjust/unblock) must serialize. Wrap the read+mutate in `db.transaction` and lock the rows you read with `.for("update")` (lock debt row first, then wallet row — keep this order everywhere to avoid deadlocks).

**Why:** the original Flex Card repay used separate statements with only an atomic `WHERE balance >= amount` guard on the wallet deduct. That guard alone fails for partial payments: two concurrent $50 payments on a $100 debt both pass the guard, both debit the wallet, but both compute `outstandingAfter` from the same stale $100 → wallet loses $50 while debt only drops to $50. Row-locking the debt+wallet inside one transaction is the fix.

**How to apply:** run notify()/logAdminAction() AFTER the transaction commits (they must never roll back money). For one-row-per-state invariants (e.g. one active debt per user) add a partial unique index (`... WHERE status='active'`) as the hard guard and catch the unique violation in the handler. Brand-new tables created in the same migration batch start empty, so such a unique index can't fail on legacy duplicates.
