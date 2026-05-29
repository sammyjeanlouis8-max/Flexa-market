/**
 * safe-push — validate build before pushing to GitHub.
 *
 * Usage:  pnpm --filter @workspace/scripts run safe-push "commit message"
 *
 * Steps:
 *  1. Build API server  (esbuild)
 *  2. Build marketplace (vite)
 *  3. If both pass → push ALL changed files to GitHub via API
 *  4. If either fails → abort with clear error, GitHub NOT touched
 */

import { execSync } from "child_process";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import https from "https";

const ROOT = join(import.meta.dirname, "..", "..");
const REPO = "sammyjeanlouis8-max/Flexa-market";
const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "";

const commitMsg = process.argv[2];
if (!commitMsg) {
  console.error("Usage: pnpm safe-push \"your commit message\"");
  process.exit(1);
}

function run(cmd: string, label: string) {
  console.log(`\n▶ ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    console.log(`✓ ${label} reyisi`);
  } catch {
    console.error(`\n❌ ${label} ECHWE — pa gen push sou GitHub!`);
    process.exit(1);
  }
}

async function gh(method: string, path: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: "api.github.com",
      path,
      method,
      headers: {
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "flexa-safe-push",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let out = "";
      res.on("data", (c) => (out += c));
      res.on("end", () => {
        try { resolve(JSON.parse(out)); }
        catch { resolve(out); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

/** Collect all tracked-ish files (exclude node_modules, dist, .git) */
function collectFiles(dir: string, base: string = ROOT): string[] {
  const skip = new Set(["node_modules", ".git", "dist", ".vite-temp"]);
  const result: string[] = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      result.push(...collectFiles(full, base));
    } else {
      result.push(relative(base, full));
    }
  }
  return result;
}

// ── Step 1 & 2: Build validation ────────────────────────────────────────────
console.log("═══════════════════════════════════════════");
console.log("  FLEXA MARKET — Safe Push (Build + Deploy)");
console.log("═══════════════════════════════════════════");

run("pnpm --filter @workspace/api-server run build", "API server build");
run("pnpm --filter @workspace/marketplace run build", "Marketplace build");

// ── Step 3: Push to GitHub ──────────────────────────────────────────────────
console.log("\n▶ Poussing sou GitHub...");

const refData = await gh("GET", `/repos/${REPO}/git/ref/heads/main`);
const headSha: string = refData.object.sha;
const commitData = await gh("GET", `/repos/${REPO}/git/commits/${headSha}`);
const baseTree: string = commitData.tree.sha;

// Build tree entries for changed source files only (not build output)
const SOURCE_DIRS = [
  "artifacts/api-server/src",
  "artifacts/marketplace/src",
  "artifacts/marketplace/serve.mjs",
  "render.yaml",
  "scripts/src",
  "lib",
];

const files = collectFiles(ROOT).filter((f) =>
  SOURCE_DIRS.some((d) => f.startsWith(d) || f === d)
);

const treeEntries = await Promise.all(
  files.map(async (relPath) => {
    const content = readFileSync(join(ROOT, relPath), "utf-8");
    const blob = await gh("POST", `/repos/${REPO}/git/blobs`, {
      content,
      encoding: "utf-8",
    });
    return { path: relPath, mode: "100644", type: "blob", sha: blob.sha };
  })
);

console.log(`  ${treeEntries.length} fichye pou push`);

const newTree = await gh("POST", `/repos/${REPO}/git/trees`, {
  base_tree: baseTree,
  tree: treeEntries,
});

const newCommit = await gh("POST", `/repos/${REPO}/git/commits`, {
  message: commitMsg,
  tree: newTree.sha,
  parents: [headSha],
});

await gh("PATCH", `/repos/${REPO}/git/refs/heads/main`, {
  sha: newCommit.sha,
});

console.log(`\n✅ Push reyisi! Commit: ${newCommit.sha.slice(0, 8)}`);
console.log(`   "${commitMsg}"`);
console.log("\nRender ap deplwaye chanjman yo otomatikman.");
