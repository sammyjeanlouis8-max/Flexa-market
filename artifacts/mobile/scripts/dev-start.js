/**
 * dev-start.js — Expo dev wrapper for Replit
 *
 * Replit checks /status on localPort immediately and expects the Metro
 * response {"status":"packager-status:running"}.  But Metro takes 30-90 s
 * to initialise before it can answer.  Solution:
 *  1. Open port immediately, respond to /status with the expected payload.
 *  2. Start Metro on PORT+1.
 *  3. Once Metro is up, proxy all requests to it transparently.
 *  4. If Metro crashes, restart it automatically (keep port 18115 open).
 */

"use strict";

const http = require("http");
const net = require("net");
const { spawn } = require("child_process");

const PORT = parseInt(process.env.PORT || "18115", 10);
const METRO_PORT = PORT + 1;
const MAX_RESTARTS = 5;

let metroReady = false;
let restartCount = 0;
let metro = null;
let pollInterval = null;

// ---------------------------------------------------------------------------
// Minimal proxy / health-check server — binds immediately, stays up forever
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  // Log every request so we can see what Expo Go actually fetches
  console.log(`[req] ${req.method} ${req.url?.slice(0, 120)} (ready=${metroReady})`);

  // Always claim Metro is running so Replit's health check passes instantly.
  if (req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "packager-status:running" }));
    return;
  }

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

  const options = {
    hostname: "127.0.0.1",
    port: METRO_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${METRO_PORT}` },
    timeout: 300000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const ct = proxyRes.headers["content-type"] || "";

    // ── Rewrite Expo manifest to replace pnpm real-store bundle paths ────────
    // Metro resolves expo-router/entry to its real pnpm-store path
    // (node_modules/.pnpm/expo-router@6.0.24_@types+…/node_modules/expo-router/entry).
    // The `@` and `+` characters in that path are rejected by Replit's
    // expo.picard.replit.dev proxy, causing Expo Go to get a 404 for the bundle.
    // We swap the real path for the pnpm-symlink path
    // (artifacts/mobile/node_modules/expo-router/entry) which:
    //   • contains no special characters
    //   • Metro serves correctly (it follows the symlink to the same real file)
    if ((ct.includes("application/json") || ct.includes("expo+json")) && req.method === "GET") {
      let raw = "";
      proxyRes.on("data", (chunk) => { raw += chunk; });
      proxyRes.on("end", () => {
        try {
          const manifest = JSON.parse(raw);
          const SYMLINK_MODULE = "artifacts/mobile/node_modules/expo-router/entry";

          // Rewrite launchAsset.url
          if (manifest.launchAsset && typeof manifest.launchAsset.url === "string") {
            try {
              const u = new URL(manifest.launchAsset.url);
              if (u.pathname.includes("expo-router") && u.pathname.includes("entry")) {
                u.pathname = `/${SYMLINK_MODULE}.bundle`;
                manifest.launchAsset.url = u.toString();
              }
            } catch (_) {}
          }

          // Rewrite mainModuleName inside expoGo extra
          const expoGo = manifest.extra && manifest.extra.expoGo;
          if (expoGo && typeof expoGo.mainModuleName === "string" &&
              expoGo.mainModuleName.includes("expo-router")) {
            expoGo.mainModuleName = SYMLINK_MODULE;
          }

          const rewritten = JSON.stringify(manifest);
          const headers = {
            ...proxyRes.headers,
            "content-length": Buffer.byteLength(rewritten).toString(),
          };
          res.writeHead(proxyRes.statusCode ?? 200, headers);
          res.end(rewritten);
        } catch (_) {
          // Not a manifest JSON — pass through unchanged
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          res.end(raw);
        }
      });
      return;
    }

    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Metro not reachable");
    }
  });

  req.pipe(proxyReq, { end: true });
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
// Graceful shutdown on SIGTERM
// ---------------------------------------------------------------------------
process.on("SIGTERM", () => {
  console.log("[dev-start] SIGTERM — shutting down");
  server.close();
  if (metro) metro.kill("SIGTERM");
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Pre-warm: compile iOS bundle into Metro cache right after Metro starts.
// This way the bundle is ready before Expo Go ever connects.
// ---------------------------------------------------------------------------
function prewarmBundle() {
  const ENTRY = "artifacts/mobile/node_modules/expo-router/entry";
  const bundlePath =
    `/${ENTRY}.bundle?platform=ios&dev=true&hot=false&lazy=true` +
    `&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app` +
    `&unstable_transformProfile=hermes-stable`;

  console.log("[dev-start] Pre-warming iOS bundle (this takes ~60–120 s)…");
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
      res.resume(); // drain response
      res.on("end", () => {
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `[dev-start] ✅ Bundle pre-warmed in ${secs}s (HTTP ${res.statusCode}) — Expo Go ready`
        );
      });
    }
  );

  req.on("error", (err) => {
    console.warn("[dev-start] Pre-warm request error (non-fatal):", err.message);
  });

  req.end();
}

// ---------------------------------------------------------------------------
// Launch Metro — with auto-restart on crash
// ---------------------------------------------------------------------------
function startMetro() {
  if (pollInterval) clearInterval(pollInterval);
  metroReady = false;

  console.log(`[dev-start] Starting Metro (attempt ${restartCount + 1})…`);

  // Increase Node heap for Metro's file crawler (prevents OOM crashes)
  const expoEnv = {
    ...process.env,
    PORT: String(METRO_PORT),
    NODE_OPTIONS: "--max-old-space-size=4096",
  };

  // Allow on-demand cache busting via env flag without changing the script.
  // Set EXPO_CLEAR_CACHE=1 in the workflow env to do a one-time cold start.
  const expoArgs = ["exec", "expo", "start", "--localhost", "--port", String(METRO_PORT)];
  if (process.env.EXPO_CLEAR_CACHE === "1") {
    expoArgs.push("--clear");
    console.log("[dev-start] EXPO_CLEAR_CACHE=1 — Metro cache will be cleared this run");
  }

  metro = spawn(
    "pnpm",
    expoArgs,
    {
      stdio: "inherit",
      env: expoEnv,
      cwd: process.cwd(),
    }
  );

  // Poll Metro port until it accepts TCP connections
  pollInterval = setInterval(() => {
    const probe = net.createConnection({ host: "127.0.0.1", port: METRO_PORT, timeout: 1000 });
    probe.on("connect", () => {
      probe.destroy();
      if (!metroReady) {
        metroReady = true;
        clearInterval(pollInterval);
        pollInterval = null;
        restartCount = 0; // reset on successful start
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
// Start: bind proxy port first, then launch Metro
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`[dev-start] Proxy ready on :${PORT} → Metro :${METRO_PORT}`);
  console.log(`[dev-start] Health check: /status → {"status":"packager-status:running"}`);
  startMetro();
});
