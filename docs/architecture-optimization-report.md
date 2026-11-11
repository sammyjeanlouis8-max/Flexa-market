# Flexa Market — Enterprise Architecture Optimization Report

**Date:** 2026-11-04 (America/New_York)  
**Branch:** `cursor/enterprise-architecture-optimization-9bdb`  
**Constraint:** No production deploy. No payment secret changes. No DO upgrades without approval.

---

## 1. Current architecture overview

Monorepo (pnpm): Express 5 API (`artifacts/api-server`) + Vite React SPA (`artifacts/marketplace`) + Drizzle/Postgres (`lib/db`).

| Layer | Stack |
|---|---|
| API | Node 22, Express 5, Socket.IO, Pino |
| DB | PostgreSQL via `pg` Pool + Drizzle ORM |
| Auth | JWT (`SESSION_SECRET`), bcrypt |
| Payments | Stripe, MonCash/Haiti, wallet/promo ledger |
| Deploy | DigitalOcean App Platform (GitHub `deploy.yml` on `main`), Docker multi-stage |
| Cache | In-process Maps only — **no Redis** |
| Jobs | In-process `setInterval` (escrow, boosts, AfterShip, AI guardian, etc.) |

```
[SPA / PWA shell] → CDN/nginx static
        ↓ /api
[Express API + Socket.IO] ⇄ [Postgres]
        ↓
[Stripe / MonCash / S3 / push]
```

---

## 2. Identified bottlenecks (verified in code)

1. **Cart wallet debit** lacked CAS / hybrid atomic debit → overdraft race under concurrency.  
2. **Missing `transactions` indexes** for buyer history, escrow auto-release scan, Stripe session lookup.  
3. **Double user SELECT** on nearly every authenticated request (`profileCompletionGuard` + `requireAuth`).  
4. **Pool max=10** tight under jobs + sockets + request handlers.  
5. **`/healthz`** did not check DB readiness.  
6. **Frontend 5s polling** on Messages + global TV broadcast + Wallet 15s.  
7. Listings search `ILIKE '%q%'` without trigram/FTS (documented; not changed this pass — higher risk to PROMAX).  
8. In-memory rate limits / fraud maps — not multi-instance safe (documented; Redis deferred pending cost approval).

---

## 3. Performance baseline

| Metric | Result |
|---|---|
| Production LCP / INP / CLS | **Not measured this run** (no prod load test) |
| Staging k6 smoke/browse | **Not executed against live hosts** (scripts prepared only) |
| Engineering goals (targets, not guarantees) | Cached API p95 &lt;100ms; standard p95 &lt;300ms; mobile LCP &lt;2.5s |

---

## 4. Improvements completed (this PR)

| Area | Change |
|---|---|
| DB | Added operational indexes on `transactions` (schema + startup migration) |
| Pool | Default `max` 10→15, overridable via `PG_POOL_MAX` |
| Health | `/api/healthz` runs `SELECT 1`; 503 if DB down |
| Auth | 8s in-process user cache; guard attaches `req.user` so `requireAuth` skips second SELECT |
| Cart | Wallet debit uses existing `deductWalletHybrid` (CAS promo+real) |
| FE polling | Messages 30s; MessageThread conv poll disabled; broadcast 10s/30s adaptive; Wallet 60s/90s; Offers 45s |
| Images | ListingDetail uses `listingImageProps` (LCP eager + lazy thumbs) |
| Load tests | k6 scripts under `scripts/load-tests/` |

---

## 5. Files modified

- `lib/db/src/schema/transactions.ts`
- `lib/db/src/index.ts`
- `artifacts/api-server/src/lib/migrations.ts`
- `artifacts/api-server/src/routes/health.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/middlewares/auth.ts`
- `artifacts/api-server/src/routes/transactions.ts`
- `artifacts/marketplace/src/pages/Messages.tsx`
- `artifacts/marketplace/src/pages/messages/MessageThread.tsx`
- `artifacts/marketplace/src/contexts/broadcast.tsx`
- `artifacts/marketplace/src/pages/Wallet.tsx`
- `artifacts/marketplace/src/pages/Offers.tsx`
- `artifacts/marketplace/src/pages/ListingDetail.tsx`
- `scripts/load-tests/*`

---

## 6. Security / financial integrity

**Preserved:** Stripe webhook idempotency, escrow `FOR UPDATE`, P2P locks, Haiti/Stripe country rules, payment secrets.  
**Hardened:** Cart checkout debit now uses hybrid CAS (same path as boosts/subscriptions).  
**Still open:** Multi-instance Redis rate limits; socket `presence:join` should require JWT (recommended follow-up).

---

## 7. Scalability assessment (honest)

| Concurrent users | Claim |
|---|---|
| Hundreds | Plausible on current DO single-instance with indexes + less polling |
| 1k–10k concurrent | Needs Redis rate-limits, job singleton, larger PG, horizontal API — **unverified** |
| 100k–1M concurrent | Not supported by current architecture without major infra — **unverified** |

Distinguish: registered users ≠ DAU ≠ concurrent. No load-test numbers claimed without execution.

---

## 8. Estimated infrastructure costs (order-of-magnitude, USD/mo)

| Tier | Sketch | Est. |
|---|---|---|
| Current / low | 1 API + managed PG + Spaces | ~$50–150 |
| Growth | 2 API + Valkey + larger PG | ~$200–500 |
| Scale | Autoscaled API + read replica + CDN | $1k+ |

**Do not upgrade without owner approval.**

---

## 9. Monitoring recommendations

- Keep Pino + crash emails  
- Add: Sentry/OTel (errors + latency), PG connection/CPU alerts, payment failure rate, `/healthz` 503 alerts  
- Avoid logging tokens / card data / PII

---

## 10. Disaster recovery (recommendations)

- RPO: rely on DO managed PG automated backups (confirm retention)  
- RTO: redeploy Docker image from last known good `main` tag  
- Document rollback: DO App Platform previous deployment  
- Escrow recovery job already present — keep

---

## 11. Automated tests

See PR CI / local vitest output in commit notes. Never claim unrun suites passed.

---

## 12. Outstanding risks

- Listings full-candidate PROMAX path still memory-heavy  
- ILIKE search without FTS  
- No Redis → rate limits / presence not cluster-safe  
- Interval jobs duplicate if &gt;1 API instance  
- Legacy Vercel GitHub App still posts three failing status checks (`Vercel – flexa-market-api-server-{2jmn,fihd,g97n}`); disconnect Vercel for this repo only (not a code/workflow issue — DigitalOcean is the deploy target)

---

## 13. Production readiness

**Ready for coordinated staging verification.**  
**Not cleared for production deploy** without owner approval, staging load tests, and merge coordination with UI PRs #40/#42/#43/#44.
