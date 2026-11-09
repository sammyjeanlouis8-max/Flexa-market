#!/usr/bin/env node
/**
 * Validates Firebase Android wiring for com.flexamarket.app.
 * Exit 0 only when google-services.json contains the target package
 * AND (when --require-wired) app.json sets googleServicesFile.
 *
 * Does not invent credentials. Safe to run in CI on this branch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const TARGET = "com.flexamarket.app";
const LEGACY = "com.flexa.market";
const PROJECT = "flexa-market-8873a";
const requireWired = process.argv.includes("--require-wired");

function fail(msg) {
  console.error(`[firebase-android] FAIL: ${msg}`);
  process.exit(1);
}

const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const android = app?.expo?.android || {};
if (android.package !== TARGET) fail(`app.json package is ${android.package}, expected ${TARGET}`);

const gsPath = path.join(root, "google-services.json");
if (!fs.existsSync(gsPath)) fail("google-services.json missing");

const gs = JSON.parse(fs.readFileSync(gsPath, "utf8"));
const projectId = gs?.project_info?.project_id;
const packages = (gs.client || [])
  .map((c) => c?.client_info?.android_client_info?.package_name)
  .filter(Boolean);

console.log(`[firebase-android] project_id=${projectId}`);
console.log(`[firebase-android] packages=${packages.join(", ") || "(none)"}`);
console.log(`[firebase-android] googleServicesFile=${android.googleServicesFile ?? "(unset)"}`);

if (projectId !== PROJECT) {
  console.warn(
    `[firebase-android] WARN: project_id is ${projectId}, expected ${PROJECT} (confirm with Sammy if intentional)`,
  );
}

const hasTarget = packages.includes(TARGET);
const hasLegacyOnly = packages.includes(LEGACY) && !hasTarget;

if (!hasTarget) {
  console.error(
    [
      `[firebase-android] BLOCKED: ${TARGET} is not in google-services.json.`,
      `Owner action: Firebase Console → project ${PROJECT} → Add Android app ${TARGET}`,
      `Download google-services.json → replace ${gsPath}`,
      `Then set expo.android.googleServicesFile to "./google-services.json"`,
      `Do NOT reuse ${LEGACY}-only config. Do NOT commit service-account keys.`,
    ].join("\n"),
  );
  process.exit(2);
}

if (android.googleServicesFile !== "./google-services.json") {
  const msg = `googleServicesFile is "${android.googleServicesFile ?? "unset"}" (expected "./google-services.json")`;
  if (requireWired) fail(msg);
  console.warn(`[firebase-android] WARN: ${msg}`);
}

if (hasLegacyOnly) fail("legacy-only config must not be wired");

console.log(`[firebase-android] OK: ${TARGET} present in google-services.json`);
process.exit(0);
