/**
 * Flexa Market — smoke load test (k6)
 * Safe public endpoints only. No checkout / payment mutations.
 *
 *   k6 run -e BASE_URL=http://localhost:8080 smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";

export const options = {
  vus: Number(__ENV.K6_VUS || 5),
  duration: __ENV.K6_DURATION || "1m",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<800"],
  },
};

export default function () {
  const health = http.get(`${BASE}/api/healthz`);
  check(health, {
    "healthz status 200 or 503": (r) => r.status === 200 || r.status === 503,
    "healthz has status field": (r) => {
      try { return typeof r.json("status") === "string"; } catch { return false; }
    },
  });

  const cats = http.get(`${BASE}/api/categories`);
  check(cats, { "categories 200": (r) => r.status === 200 });

  sleep(1);
}
