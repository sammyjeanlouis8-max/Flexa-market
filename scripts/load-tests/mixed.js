/**
 * Flexa Market — mixed browse + authenticated reads (k6)
 * Requires a staging AUTH_TOKEN for a test account.
 * Never posts checkout / wallet debit / refunds.
 *
 *   k6 run -e BASE_URL=... -e AUTH_TOKEN=... mixed.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const TOKEN = __ENV.AUTH_TOKEN || "";

export const options = {
  vus: Number(__ENV.K6_VUS || 10),
  duration: __ENV.K6_DURATION || "3m",
  thresholds: {
    http_req_failed: ["rate<0.08"],
    http_req_duration: ["p(95)<1200"],
  },
};

export default function () {
  const headers = TOKEN
    ? { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  check(http.get(`${BASE}/api/healthz`), { "healthz ok-ish": (r) => r.status === 200 || r.status === 503 });
  check(http.get(`${BASE}/api/listings?limit=12`), { "listings": (r) => r.status === 200 });

  if (TOKEN) {
    check(http.get(`${BASE}/api/auth/me`, { headers }), {
      "auth/me 200": (r) => r.status === 200,
    });
    check(http.get(`${BASE}/api/wallet/balance`, { headers }), {
      "wallet balance 200/403": (r) => r.status === 200 || r.status === 403,
    });
    check(http.get(`${BASE}/api/conversations`, { headers }), {
      "conversations 200/403": (r) => r.status === 200 || r.status === 403,
    });
  }

  sleep(1);
}
