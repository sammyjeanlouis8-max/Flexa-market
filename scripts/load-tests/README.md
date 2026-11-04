# Flexa Market — Load Test Scenarios (k6)

**Status:** Scenarios prepared for authorized non-production environments only.  
**Do NOT** run destructive or high-concurrency tests against `flexamarket.com` / production without explicit owner approval.

## Prerequisites

```bash
# Install k6: https://k6.io/docs/get-started/installation/
k6 version
```

Set a staging base URL (never production unless approved):

```bash
export BASE_URL="https://staging.example.com"   # or http://localhost:8080
export K6_VUS=10
export K6_DURATION=2m
```

## Scenarios

| Script | Purpose | Default load |
|---|---|---|
| `smoke.js` | Health + public browse | 5 VUs × 1m |
| `browse.js` | Homepage listings + search + listing detail | 20 VUs × 3m |
| `mixed.js` | Browse + auth-gated stubs (requires `AUTH_TOKEN`) | 10 VUs × 3m |

## Run

```bash
cd scripts/load-tests
k6 run smoke.js
k6 run -e BASE_URL="$BASE_URL" browse.js
k6 run -e BASE_URL="$BASE_URL" -e AUTH_TOKEN="$AUTH_TOKEN" mixed.js
```

## Progressive plan (authorized staging only)

1. Smoke — 5 VUs  
2. Browse — 20 → 50 → 100 VUs  
3. Mixed — 50 VUs with test accounts  
4. Stop and record breaking points (p95, error rate, DB CPU)

## Metrics to record

- Requests/sec, concurrent VUs  
- avg / p95 / p99 latency  
- Error rate  
- App CPU/memory, Postgres connections  

**Never fabricate results.** Leave cells blank if a run did not execute.
