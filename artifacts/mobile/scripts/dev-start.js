/**
 * dev-start.js — Expo dev wrapper for Replit
 *
 * Replit checks /status on localPort immediately and expects the Metro
 * response {"status":"packager-status:running"}.  But Metro takes 30-90 s
 * to initialise before it can answer.  Solution:
 *  1. Open port immediately, respond to /status with the expected payload.
 *  2. Start Metro on PORT+1.
 *  3. Pre-warm the iOS bundle right after Metro starts; hold any incoming
 *     manifest requests (GET /) until the bundle is in Metro's cache.
 *     This ensures Expo Go never waits for a cold compile — the bundle
 *     delivers in < 1 s from cache.
 *  4. Once bundle is ready, release held requests and proxy normally.
 *  5. If Metro crashes, restart it automatically (keep port open).
 */

"use strict";

const http = require("http");
const net = require("net");
const { spawn } = require("child_process");

const PORT = parseInt(process.env.PORT || "18115", 10);
const METRO_PORT = PORT + 1;
const MAX_RESTARTS = 5;

// Cache-busting: unique per server restart so Expo Go can't serve stale bundles
const BUILD_ID = Date.now();

const SYMLINK_MODULE = "artifacts/mobile/node_modules/expo-router/entry";

let metroReady = false;
let bundleReady = false;   // true once iOS bundle is pre-warmed into Metro cache
let manifestWaiters = [];  // GET / requests held while bundle is pre-warming
let restartCount = 0;
let metro = null;
let pollInterval = null;

// ---------------------------------------------------------------------------
// Core proxy: forward req → Metro, rewrite JSON manifests on the way back
// ---------------------------------------------------------------------------
function proxyToMetro(req, res) {
  // Strip our cache-busting _v param before sending to Metro
  let metroPath = req.url;
  try {
    const u = new URL(req.url, "http://localhost");
    u.searchParams.delete("_v");
    metroPath = u.pathname + (u.search ? u.search : "");
  } catch (_) {}

  const options = {
    hostname: "127.0.0.1",
    port: METRO_PORT,
    path: metroPath,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${METRO_PORT}` },
    timeout: 300000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const ct = proxyRes.headers["content-type"] || "";

    // ── Rewrite Expo manifest to replace pnpm real-store bundle paths ────────
    // Metro resolves expo-router/entry to its real pnpm-store path which
    // contains @ and + chars that Replit's proxy rejects with 404.
    // We swap it for the clean pnpm-symlink path that Metro also serves fine.
    if ((ct.includes("application/json") || ct.includes("expo+json")) && req.method === "GET") {
      let raw = "";
      proxyRes.on("data", (chunk) => { raw += chunk; });
      proxyRes.on("end", () => {
        try {
          const manifest = JSON.parse(raw);

          if (manifest.launchAsset && typeof manifest.launchAsset.url === "string") {
            try {
              const u = new URL(manifest.launchAsset.url);
              if (u.pathname.includes("expo-router") && u.pathname.includes("entry")) {
                u.pathname = `/${SYMLINK_MODULE}.bundle`;
                // Cache-bust: new BUILD_ID per restart forces Expo Go to re-download
                u.searchParams.set("_v", String(BUILD_ID));
                manifest.launchAsset.url = u.toString();
              }
            } catch (_) {}
          }

          const expoGo = manifest.extra && manifest.extra.expoGo;
          if (expoGo && typeof expoGo.mainModuleName === "string" &&
              expoGo.mainModuleName.includes("expo-router")) {
            expoGo.mainModuleName = SYMLINK_MODULE;
          }

          const rewritten = JSON.stringify(manifest);
          res.writeHead(proxyRes.statusCode ?? 200, {
            ...proxyRes.headers,
            "content-length": Buffer.byteLength(rewritten).toString(),
          });
          res.end(rewritten);
        } catch (_) {
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          res.end(raw);
        }
      });
      return;
    }

    // Strip pnpm-store paths from non-JSON responses too (e.g. plain JS bundles)
    const headers = {
      ...proxyRes.headers,
      // Prevent Expo Go from caching the bundle between restarts
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache",
    };
    res.writeHead(proxyRes.statusCode ?? 200, headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Metro not reachable");
    }
  });

  req.pipe(proxyReq, { end: true });
}

// ---------------------------------------------------------------------------
// Release all manifest requests held during pre-warm
// ---------------------------------------------------------------------------
function flushManifestWaiters() {
  const waiters = manifestWaiters.splice(0);
  if (waiters.length > 0) {
    console.log(`[dev-start] Releasing ${waiters.length} held manifest request(s) → Metro`);
  }
  for (const { req, res } of waiters) {
    proxyToMetro(req, res);
  }
}

// ---------------------------------------------------------------------------
// HTTP server — binds immediately, stays up forever
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  console.log(`[req] ${req.method} ${(req.url ?? "").slice(0, 120)} (ready=${metroReady})`);

  // /status — always return OK so Replit health-check passes instantly
  if (req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "packager-status:running" }));
    return;
  }

  // Metro not up yet — show loading page
  if (!metroReady) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      '<html><body style="font-family:sans-serif;padding:2rem">' +
        "<h2>FlexaMarket Mobile</h2>" +
        "<p>Metro bundler is starting, please wait…</p>" +
        '<script>setTimeout(()=>location.reload(),3000)</script>' +
        "</body></html>"
    );
    return;
  }

  // Hold manifest requests until bundle pre-warm completes so Expo Go
  // never downloads a cold bundle — it gets cached < 1 s response instead.
  const isManifest = req.url === "/" || req.url === "" || (req.url ?? "").startsWith("/?");
  if (isManifest && !bundleReady) {
    console.log("[dev-start] Manifest held — bundle pre-warm in progress…");
    manifestWaiters.push({ req, res });
    return;
  }

  proxyToMetro(req, res);
});

// ---------------------------------------------------------------------------
// WebSocket upgrade proxy (Metro HMR / Fast Refresh)
// ---------------------------------------------------------------------------
server.on("upgrade", (req, socket, head) => {
  const upstream = net.createConnection(METRO_PORT, "127.0.0.1");

  upstream.on("connect", () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    raw += "\r\n";
    upstream.write(raw);
    if (head && head.length > 0) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });

  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.on("error", (err) => {
  console.error("[dev-start] Proxy server error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.log("[dev-start] Port in use, retrying in 2s…");
    setTimeout(() => server.listen(PORT), 2000);
  }
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
process.on("SIGTERM", () => {
  console.log("[dev-start] SIGTERM — shutting down");
  server.close();
  if (metro) metro.kill("SIGTERM");
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Pre-warm: compile iOS bundle right after Metro starts
// ---------------------------------------------------------------------------
function prewarmBundle() {
  const bundlePath =
    `/${SYMLINK_MODULE}.bundle?platform=ios&dev=true&hot=false&lazy=true` +
    `&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app` +
    `&unstable_transformProfile=hermes-stable`;

  console.log("[dev-start] Pre-warming iOS bundle…");
  const t0 = Date.now();

  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: METRO_PORT,
      path: bundlePath,
      method: "GET",
      headers: {
        "expo-platform": "ios",
        "expo-sdk-version": "54.0.0",
        host: `localhost:${METRO_PORT}`,
      },
      timeout: 300000,
    },
    (res) => {
      res.resume();
      res.on("end", () => {
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `[dev-start] ✅ Bundle pre-warmed in ${secs}s (HTTP ${res.statusCode}) — Expo Go ready`
        );
        bundleReady = true;
        flushManifestWaiters();
      });
    }
  );

  req.on("error", (err) => {
    console.warn("[dev-start] Pre-warm error (non-fatal):", err.message);
    bundleReady = true;
    flushManifestWaiters();
  });

  req.end();
}

// ---------------------------------------------------------------------------
// Fix broken pnpm virtual-store symlinks for Expo config plugins
// Replit wipes node_modules content on restart; recreate minimal stubs so
// Expo's plugin resolver does not crash before Metro even starts.
// ---------------------------------------------------------------------------
function fixBrokenPlugins() {
  const fs = require("fs");
  const path = require("path");

  const PLUGIN_STUB = `const { createRunOncePlugin } = require("@expo/config-plugins");
const withPlugin = (c) => c;
module.exports = createRunOncePlugin(withPlugin, "stub", "1.0.0");
`;
  const INDEX_STUB = "// stub — pnpm virtual store entry missing\nmodule.exports = {};\n";

  const nodeModulesDir = path.join(__dirname, "..", "node_modules");

  let allDeps = [];
  try {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    allDeps = Object.keys({ ...pkgJson.dependencies, ...pkgJson.devDependencies });
  } catch (_) {}

  let fixed = 0;
  for (const pkg of allDeps) {
    const symlinkPath = path.join(nodeModulesDir, pkg);
    try {
      // Use lstatSync (doesn't follow symlinks) to detect existence of the path entry itself
      let lstat = null;
      try { lstat = fs.lstatSync(symlinkPath); } catch (_) {}

      let realDir = null;

      if (!lstat) {
        // No entry at all — create a real directory as stub
        fs.mkdirSync(symlinkPath, { recursive: true });
        realDir = symlinkPath;
      } else if (lstat.isSymbolicLink()) {
        // Entry is a symlink — resolve to its target (may not exist)
        try {
          realDir = fs.realpathSync(symlinkPath);
        } catch (_) {
          // Broken symlink: target doesn't exist — read the link and create target manually
          const linkTarget = fs.readlinkSync(symlinkPath);
          realDir = path.resolve(nodeModulesDir, linkTarget);
          fs.mkdirSync(realDir, { recursive: true });
        }
      } else if (lstat.isDirectory()) {
        realDir = symlinkPath;
      }

      if (!realDir) continue;

      const pkgJsonPath = path.join(realDir, "package.json");
      const indexPath = path.join(realDir, "index.js");
      const pluginPath = path.join(realDir, "app.plugin.js");

      if (!fs.existsSync(pkgJsonPath)) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify({ name: pkg, version: "1.0.0", main: "index.js" }));
        fs.writeFileSync(indexPath, INDEX_STUB);
        fixed++;
      }
      if (!fs.existsSync(indexPath)) {
        fs.writeFileSync(indexPath, INDEX_STUB);
      }
      if (!fs.existsSync(pluginPath) && pkg.startsWith("expo-")) {
        fs.writeFileSync(pluginPath, PLUGIN_STUB);
      }
    } catch (err) {
      // non-fatal
    }
  }

  if (fixed > 0) console.log(`[dev-start] Fixed ${fixed} broken package stubs`);
}

// ---------------------------------------------------------------------------
// Launch Metro — with auto-restart on crash
// ---------------------------------------------------------------------------
function startMetro() {
  if (pollInterval) clearInterval(pollInterval);
  metroReady = false;
  bundleReady = false;
  manifestWaiters = [];

  console.log(`[dev-start] Starting Metro (attempt ${restartCount + 1})…`);

  const expoEnv = {
    ...process.env,
    PORT: String(METRO_PORT),
    NODE_OPTIONS: "--max-old-space-size=4096",
    EXPO_NO_TELEMETRY: "1", // skip telemetry prompt
  };

  const expoArgs = ["exec", "expo", "start", "--localhost", "--port", String(METRO_PORT)];
  // Always clear on first start so stale pnpm _tmp entries never break the FileMap
  if (restartCount === 0 || process.env.EXPO_CLEAR_CACHE === "1") {
    expoArgs.push("--clear");
    console.log("[dev-start] Clearing Metro cache (first start or EXPO_CLEAR_CACHE=1)");
  }

  metro = spawn("pnpm", expoArgs, {
    stdio: "inherit",
    env: expoEnv,
    cwd: process.cwd(),
  });

  pollInterval = setInterval(() => {
    const probe = net.createConnection({ host: "127.0.0.1", port: METRO_PORT, timeout: 1000 });
    probe.on("connect", () => {
      probe.destroy();
      if (!metroReady) {
        metroReady = true;
        clearInterval(pollInterval);
        pollInterval = null;
        restartCount = 0;
        console.log(`[dev-start] Metro ready — full proxy active on :${PORT}`);
        prewarmBundle();
      }
    });
    probe.on("error", () => probe.destroy());
    probe.on("timeout", () => probe.destroy());
  }, 2000);

  metro.on("exit", (code, signal) => {
    clearInterval(pollInterval);
    pollInterval = null;
    metroReady = false;
    bundleReady = false;
    console.error(`[dev-start] Metro exited (code=${code}, signal=${signal})`);

    restartCount++;
    if (restartCount <= MAX_RESTARTS) {
      const delay = Math.min(restartCount * 3000, 15000);
      console.log(`[dev-start] Restarting Metro in ${delay / 1000}s… (${restartCount}/${MAX_RESTARTS})`);
      setTimeout(startMetro, delay);
    } else {
      console.error("[dev-start] Metro failed too many times — giving up");
      server.close();
      process.exit(1);
    }
  });

  metro.on("error", (err) => {
    console.error("[dev-start] Failed to spawn Metro:", err.message);
  });
}

// ---------------------------------------------------------------------------
// Start: bind port first, then launch Metro
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`[dev-start] Proxy ready on :${PORT} → Metro :${METRO_PORT}`);
  console.log(`[dev-start] Health check: /status → {"status":"packager-status:running"}`);
  fixBrokenPlugins();
  startMetro();
});
