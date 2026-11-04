/**
 * Flexa Market — public browse / search load test (k6)
 * Read-only. Does not mutate inventory or payments.
 *
 *   k6 run -e BASE_URL=http://localhost:8080 browse.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";

export const options = {
  stages: [
    { duration: "30s", target: Number(__ENV.K6_VUS || 20) },
    { duration: __ENV.K6_DURATION || "2m", target: Number(__ENV.K6_VUS || 20) },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  const listings = http.get(`${BASE}/api/listings?limit=24`);
  check(listings, { "listings 200": (r) => r.status === 200 });

  const search = http.get(`${BASE}/api/listings?q=phone&limit=24`);
  check(search, { "search 200": (r) => r.status === 200 });

  let detailId = null;
  try {
    const body = listings.json();
    const arr = Array.isArray(body) ? body : body?.listings || body?.items || [];
    if (arr[0]?.id) detailId = arr[0].id;
  } catch (_) { /* ignore */ }

  if (detailId) {
    const detail = http.get(`${BASE}/api/listings/${detailId}`);
    check(detail, { "listing detail 200": (r) => r.status === 200 });
  }

  sleep(1 + Math.random());
}
