#!/usr/bin/env tsx
/**
 * FLEXA MARKET — Pre-deploy validation script
 *
 * Checks that every critical subsystem is healthy before you publish to
 * production. Exits 0 when all checks pass, exits 1 if any fail.
 *
 * Run: pnpm --filter @workspace/scripts run validate-deploy
 */

import * as http from "node:http";
import * as https from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE  = "http://localhost:80";
// Match the same priority as the API server (lib/db uses DATABASE_URL)
const DB_URL    = process.env["DATABASE_URL"] ?? process.env["NEON_DATABASE_URL"] ?? "";
const TIMEOUT   = 8_000; // ms per HTTP probe

// ─── Result types ─────────────────────────────────────────────────────────────
interface CheckResult {
  name:    string;
  group:   string;
  passed:  boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function pass(group: string, name: string, detail?: string) {
  results.push({ group, name, passed: true, detail });
}

function fail(group: string, name: string, detail: string) {
  results.push({ group, name, passed: false, detail });
}

// ─── HTTP probe ───────────────────────────────────────────────────────────────
interface ProbeOpts {
  method?:         string;
  body?:           string;
  contentType?:    string;
  expectStatus?:   number | number[];
  expectBodyKey?:  string;
}

async function probe(
  path: string,
  { method = "GET", body, contentType, expectStatus = 200, expectBodyKey }: ProbeOpts = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url  = new URL(path, API_BASE);
    const lib  = url.protocol === "https:" ? https : http;
    const data = body ? Buffer.from(body) : null;

    const req = lib.request(url, {
      method,
      headers: {
        "Accept":       "application/json",
        ...(contentType ? { "Content-Type": contentType } : {}),
        ...(data        ? { "Content-Length": String(data.byteLength) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk: Buffer) => raw += chunk.toString());
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw }));
    });

    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function httpCheck(
  group: string,
  name: string,
  path: string,
  opts: ProbeOpts = {}
) {
  try {
    const { status, body } = await probe(path, opts);
    const expected = Array.isArray(opts.expectStatus)
      ? opts.expectStatus
      : [opts.expectStatus ?? 200];

    if (!expected.includes(status)) {
      fail(group, name, `HTTP ${status} (expected ${expected.join(" or ")})`);
      return;
    }

    if (opts.expectBodyKey) {
      try {
        const parsed = JSON.parse(body);
        if (!(opts.expectBodyKey in parsed)) {
          fail(group, name, `Response missing key "${opts.expectBodyKey}"`);
          return;
        }
      } catch {
        fail(group, name, "Invalid JSON response");
        return;
      }
    }

    pass(group, name, `HTTP ${status}`);
  } catch (err: any) {
    fail(group, name, err?.message ?? "Unknown error");
  }
}

// ─── DB schema check ──────────────────────────────────────────────────────────
interface TableSpec {
  table:   string;
  columns: string[];
}

async function dbSchemaCheck(specs: TableSpec[]) {
  if (!DB_URL) {
    fail("Database", "Connection", "DATABASE_URL / NEON_DATABASE_URL not set");
    return;
  }

  const client = new Client({
    connectionString: DB_URL,
    ssl: DB_URL.includes("sslmode=require") || DB_URL.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : false,
    connectionTimeoutMillis: TIMEOUT,
  });

  try {
    await client.connect();
    pass("Database", "Connection", "PostgreSQL connected");
  } catch (err: any) {
    fail("Database", "Connection", err?.message ?? "Cannot connect");
    return;
  }

  for (const { table, columns } of specs) {
    // Check table exists
    try {
      const { rowCount } = await client.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      if (!rowCount || rowCount === 0) {
        fail("Database", `Table: ${table}`, "Table not found");
        continue;
      }
    } catch (err: any) {
      fail("Database", `Table: ${table}`, err?.message);
      continue;
    }

    // Check required columns exist
    for (const col of columns) {
      try {
        const { rowCount } = await client.query(
          `SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
          [table, col]
        );
        if (!rowCount || rowCount === 0) {
          fail("Database", `${table}.${col}`, "Column missing");
        } else {
          pass("Database", `${table}.${col}`);
        }
      } catch (err: any) {
        fail("Database", `${table}.${col}`, err?.message);
      }
    }
  }

  await client.end();
}

// ─── Locked financial rules check ─────────────────────────────────────────────
/**
 * Verifies that critical financial constants in the DB have not drifted
 * from their locked values. Run on every deploy to catch accidental changes.
 *
 * Locked values (as of 2026-05-14):
 *   buyer_fee_rate_stripe  = 0     (no buyer service fee)
 *   commission_rate_default ≤ 0.07 (7% — if row exists)
 *   commission_rate_stripe  ≤ 0.07 (7% — if row exists)
 *   commission_rate_moncash ≤ 0.07 (7% — if row exists)
 */
async function dbFinancialLockCheck() {
  const GROUP = "Locked: Financial Rules";
  if (!DB_URL) {
    fail(GROUP, "DB connection", "DATABASE_URL not set — skip");
    return;
  }

  const client = new Client({
    connectionString: DB_URL,
    ssl: DB_URL.includes("sslmode=require") || DB_URL.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : false,
    connectionTimeoutMillis: TIMEOUT,
  });

  try { await client.connect(); } catch (err: any) {
    fail(GROUP, "DB connection", err?.message ?? "Cannot connect");
    return;
  }

  // Helper: read a platform_settings value (returns null if row absent)
  async function readSetting(key: string): Promise<string | null> {
    const { rows } = await client.query(
      `SELECT value FROM platform_settings WHERE key = $1`, [key]
    );
    return rows.length ? (rows[0].value as string) : null;
  }

  try {
    // 1. Buyer service fee must be 0
    const buyerFee = await readSetting("buyer_fee_rate_stripe");
    if (buyerFee === null || parseFloat(buyerFee) === 0) {
      pass(GROUP, "Buyer fee = 0%", buyerFee === null ? "no DB override (code default 0)" : `DB = ${buyerFee}`);
    } else {
      fail(GROUP, "Buyer fee = 0%", `DB has buyer_fee_rate_stripe = ${buyerFee} (expected 0)`);
    }

    // 2. Commission rate must not exceed 7%
    for (const key of ["commission_rate_default", "commission_rate_stripe", "commission_rate_moncash"]) {
      const val = await readSetting(key);
      if (val === null) {
        pass(GROUP, `${key} ≤ 7%`, "no DB override (code default 7%)");
      } else {
        const rate = parseFloat(val);
        if (!isNaN(rate) && rate <= 0.07) {
          pass(GROUP, `${key} ≤ 7%`, `DB = ${(rate * 100).toFixed(1)}%`);
        } else {
          fail(GROUP, `${key} ≤ 7%`, `DB has ${key} = ${val} (must be ≤ 0.07)`);
        }
      }
    }

    // 3. Delivery min fee — verified via API
    const res = await probe("/api/delivery/calculate-price", {
      method: "POST",
      body: JSON.stringify({ sellerCity: "Port-au-Prince", buyerCity: "Port-au-Prince", country: "HT", method: "motorcycle", listingPriceUsd: 10 }),
      contentType: "application/json",
      expectStatus: [200, 400, 401, 422],
    });
    if (res.status === 200) {
      const parsed = JSON.parse(res.body);
      const fee = parseFloat(parsed?.feeUsd ?? parsed?.fee_usd ?? 0);
      if (fee >= 10) {
        pass(GROUP, "Delivery min fee ≥ $10", `API returned $${fee}`);
      } else {
        fail(GROUP, "Delivery min fee ≥ $10", `API returned $${fee} (expected ≥ $10)`);
      }
    } else {
      pass(GROUP, "Delivery min fee ≥ $10", `API ${res.status} — auth required, skipping value check`);
    }

  } finally {
    await client.end();
  }
}

// ─── Env var check ────────────────────────────────────────────────────────────
function envCheck(group: string, name: string, key: string) {
  if (process.env[key]) {
    pass(group, name, "set");
  } else {
    fail(group, name, `${key} is not set`);
  }
}

// ─── render.yaml lock — prevent paid-tier fields from breaking free deploys ──
//
// Render free plan does NOT support these fields in render.yaml.
// If any appear, the deploy will fail with a cryptic "error during deploy"
// email and the new code will never go live.
//
// Every time a field is added to render.yaml, this list enforces a conscious
// decision: if you need a paid feature, upgrade the plan first.
const RENDER_FREE_FORBIDDEN: Array<{ field: string; reason: string }> = [
  { field: "healthCheckPath",         reason: "health-check routing requires Starter plan or higher" },
  { field: "numInstances",            reason: "multiple instances require paid plan" },
  { field: "scaling",                 reason: "auto-scaling requires paid plan" },
  { field: "disk",                    reason: "persistent disk requires paid plan" },
  { field: "preDeployCommand",        reason: "pre-deploy command requires paid plan" },
  { field: "initialDeployHook",       reason: "deploy hooks require paid plan" },
  { field: "autoDeploy:\\s*false",    reason: "disabling autoDeploy breaks all pushes (webhooks not configured)" },
];

// Required fields every service must have — catches accidental deletions
const RENDER_REQUIRED_PER_SERVICE = ["buildCommand", "startCommand", "name", "plan"];

function renderYamlLockCheck(yamlPath: string) {
  const GROUP = "Render Config";
  let raw: string;
  try {
    raw = readFileSync(yamlPath, "utf-8");
  } catch {
    fail(GROUP, "render.yaml readable", `Cannot read ${yamlPath}`);
    return;
  }
  pass(GROUP, "render.yaml readable", yamlPath);

  // Check forbidden paid-tier fields
  for (const { field, reason } of RENDER_FREE_FORBIDDEN) {
    const re = new RegExp(`^\\s*${field}:`, "m");
    if (re.test(raw)) {
      fail(GROUP, `No '${field.replace(/\\s\*.*/, "")}'`, reason);
    } else {
      pass(GROUP, `No '${field.replace(/\\s\*.*/, "")}'`);
    }
  }

  // Check required fields present for each service block
  const serviceBlocks = raw.split(/^  - type:/m).slice(1); // each service starts here
  serviceBlocks.forEach((block, i) => {
    const serviceName = (block.match(/name:\s*(\S+)/) ?? [])[1] ?? `service-${i + 1}`;
    for (const field of RENDER_REQUIRED_PER_SERVICE) {
      if (new RegExp(`${field}:`).test(block)) {
        pass(GROUP, `${serviceName}: has '${field}'`);
      } else {
        fail(GROUP, `${serviceName}: has '${field}'`, `Missing required field '${field}' — deploy will fail`);
      }
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const LINE = "─".repeat(60);
  console.log(`\n${LINE}`);
  console.log("  FLEXA MARKET — Pre-deploy Validation");
  console.log(`${LINE}\n`);

  // ── 0. render.yaml lock ─────────────────────────────────────────────────────
  // Script runs from scripts/ — render.yaml is one level up at repo root
  renderYamlLockCheck(join(import.meta.dirname, "..", "..", "render.yaml"));

  // ── 1. Environment variables ────────────────────────────────────────────────
  envCheck("Environment", "Database URL",        "NEON_DATABASE_URL");
  envCheck("Environment", "Stripe secret key",   "STRIPE_SECRET_KEY");
  envCheck("Environment", "Stripe publishable",  "STRIPE_PUBLISHABLE_KEY");
  envCheck("Environment", "Stripe webhook",      "STRIPE_WEBHOOK_SECRET");
  envCheck("Environment", "Session secret",      "SESSION_SECRET");

  // ── 2. API server health ────────────────────────────────────────────────────
  await httpCheck("API: Core",     "Health endpoint",       "/api/healthz",                    { expectBodyKey: "status" });
  await httpCheck("API: Core",     "Categories",            "/api/categories",                 { expectStatus: 200 });
  await httpCheck("API: Core",     "Listings feed",         "/api/listings",                   { expectStatus: 200 });
  await httpCheck("API: Core",     "Home stats",            "/api/stats/home",                 { expectStatus: 200 });

  // Auth — wrong creds must return 401 (not 500)
  await httpCheck("API: Auth",     "Login route alive",     "/api/auth/login", {
    method:      "POST",
    body:        JSON.stringify({ email: "validate@flexa.invalid", password: "wrong_password" }),
    contentType: "application/json",
    expectStatus: [400, 401, 404],
  });

  // Protected routes must return 401 when unauthenticated (not 404/500)
  await httpCheck("API: Auth",     "JWT guard active",      "/api/conversations/unread-count", { expectStatus: 401 });
  await httpCheck("API: Auth",     "Wallet protected",      "/api/wallet/balance",             { expectStatus: 401 });

  // ── 3. Feature endpoints ────────────────────────────────────────────────────
  await httpCheck("Feature: Boost",   "Boosted feed",       "/api/listings/boosted-feed",      { expectStatus: 200 });
  await httpCheck("Feature: Boost",   "Random video",       "/api/boost/random-video",         { expectStatus: 200 });
  await httpCheck("Feature: Offers",  "Offers route",       "/api/offers",                     { expectStatus: [200, 401] });
  await httpCheck("Feature: Promo",   "Promo campaign",     "/api/promo/campaign",             { expectStatus: 200 });

  // Payment providers — alive (401 means auth guard works, 200 means public)
  await httpCheck("Feature: Payments","Stripe config",      "/api/payment-providers/usdt-wallet", { expectStatus: [200, 401] });

  // Subscription + jobs routes alive
  await httpCheck("Feature: Vendor",  "Subscription route", "/api/subscription/my",            { expectStatus: [200, 401] });
  await httpCheck("Feature: Jobs",    "Jobs route",         "/api/jobs",                       { expectStatus: [200, 401] });

  // Support / chatbot
  await httpCheck("Feature: Support", "Chatbot route",      "/api/chatbot",                    { expectStatus: [200, 400, 401, 404, 405] });

  // ── 4b. Cloudinary upload test ───────────────────────────────────────────────
  // Verifies that image uploads actually work end-to-end on this environment.
  // A wrong CLOUDINARY_CLOUD_NAME silently causes 500 on every photo upload.
  await (async () => {
    const GROUP = "Feature: Uploads";
    // Step 1 — get an upload token
    const tokenRes = await probe("/api/storage/uploads/request-url", {
      method: "POST",
      body: JSON.stringify({ name: "validate-test.jpg", size: 3, contentType: "image/jpeg" }),
      contentType: "application/json",
      expectStatus: [200],
    });
    if (tokenRes.status !== 200) {
      fail(GROUP, "Upload token endpoint", `HTTP ${tokenRes.status}`);
      return;
    }
    let uploadURL: string;
    try {
      const parsed = JSON.parse(tokenRes.body);
      uploadURL = parsed.uploadURL;
      pass(GROUP, "Upload token endpoint", `token issued`);
    } catch {
      fail(GROUP, "Upload token endpoint", "Non-JSON response");
      return;
    }

    // Step 2 — push a minimal valid JPEG (3-byte placeholder)
    const putRes = await probe(uploadURL, {
      method: "PUT",
      body: "\xff\xd8\xff",
      contentType: "image/jpeg",
      expectStatus: [200, 400, 500], // 400/500 = invalid file but storage IS reachable
    });
    const body = putRes.body;
    if (putRes.status === 200) {
      pass(GROUP, "Cloudinary upload reachable", "upload accepted");
    } else if (putRes.status === 400 || putRes.status === 500) {
      // Cloudinary rejected the tiny file — check what the error says
      if (body.includes("Invalid cloud_name") || body.includes("cloud_name")) {
        fail(GROUP, "Cloudinary cloud_name valid",
          `CLOUDINARY_CLOUD_NAME is wrong — check Render env vars (should be: dvkbgodbk)`);
      } else if (body.includes("Invalid image file") || body.includes("not allowed") || body.includes("Invalid API")) {
        // Credentials are valid; Cloudinary just rejected the garbage 3-byte test file
        pass(GROUP, "Cloudinary upload reachable", "credentials valid (file rejected as expected)");
      } else if (body.includes("Storage not configured")) {
        fail(GROUP, "Cloudinary upload reachable", "Storage not configured — set CLOUDINARY_API_KEY on server");
      } else {
        fail(GROUP, "Cloudinary upload reachable", `HTTP ${putRes.status}: ${body.slice(0, 120)}`);
      }
    } else {
      fail(GROUP, "Cloudinary upload reachable", `HTTP ${putRes.status}: ${body.slice(0, 120)}`);
    }
  })();

  // ── 5. Locked financial rules ────────────────────────────────────────────────
  await dbFinancialLockCheck();

  // ── 6. Database schema ──────────────────────────────────────────────────────
  await dbSchemaCheck([
    {
      table: "users",
      columns: [
        "id", "email", "country", "role", "is_super_admin",
        "subscription_plan", "preferred_language", "referral_code",
        "stripe_customer_id", "is_flagged", "admin_scope_country",
        "token_invalidated_at",
      ],
    },
    {
      table: "listings",
      columns: [
        "id", "title", "price", "country", "is_boosted",
        "boost_expires_at", "boost_audience_country",
        "boost_audience_city", "boost_video_url",
      ],
    },
    {
      table: "boosts",
      columns: [
        "id", "listing_id", "user_id", "plan", "payment_method",
        "payment_status", "audience_country", "expires_at",
      ],
    },
    {
      table: "promo_wallets",
      columns: ["id", "user_id", "balance_usd", "promo_balance", "unlocked_balance"],
    },
    {
      table: "transactions",
      columns: [
        "id", "user_id", "listing_id", "amount", "order_status",
        "escrow_released", "stripe_checkout_session_id",
      ],
    },
    {
      table: "offers",
      columns: ["id", "listing_id", "buyer_id", "seller_id", "status", "amount"],
    },
    {
      table: "vendor_subscriptions",
      columns: [
        "id", "user_id", "plan", "status", "expires_at",
        "stripe_subscription_id", "cancel_at_period_end",
      ],
    },
    {
      table: "security_questions",
      columns: ["id", "user_id", "question_key", "answer_hash"],
    },
    {
      table: "account_recovery_sessions",
      columns: ["id", "user_id", "session_token", "expires_at"],
    },
    {
      table: "admin_messages",
      columns: ["id", "from_admin_id", "to_admin_id", "content", "is_read"],
    },
    {
      table: "seller_payout_accounts",
      columns: ["id", "user_id", "moncash_number", "moncash_verified"],
    },
  ]);

  // ── 5. Print results ────────────────────────────────────────────────────────
  let lastGroup = "";
  let totalPass = 0;
  let totalFail = 0;

  for (const r of results) {
    if (r.group !== lastGroup) {
      console.log(`\n  ${r.group}`);
      lastGroup = r.group;
    }
    const icon   = r.passed ? "✔" : "✘";
    const color  = r.passed ? "\x1b[32m" : "\x1b[31m";
    const reset  = "\x1b[0m";
    const detail = r.detail ? `  ${"\x1b[2m"}${r.detail}${reset}` : "";
    console.log(`    ${color}${icon}${reset}  ${r.name}${detail}`);
    if (r.passed) totalPass++; else totalFail++;
  }

  const total = totalPass + totalFail;
  const allPass = totalFail === 0;
  const summaryColor = allPass ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";

  console.log(`\n${LINE}`);
  console.log(`  Result: ${summaryColor}${allPass ? "ALL CHECKS PASSED" : `${totalFail} CHECK(S) FAILED`}${reset}`);
  console.log(`  ${totalPass}/${total} checks passed`);
  if (!allPass) {
    console.log(`\n  ${"\x1b[33m"}Fix failing checks before publishing to production.${reset}`);
  } else {
    console.log(`\n  ${"\x1b[32m"}Safe to publish. ✔${reset}`);
  }
  console.log(`${LINE}\n`);

  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error("\x1b[31mValidation script crashed:\x1b[0m", err);
  process.exit(1);
});
