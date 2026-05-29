/**
 * Production static file server for FLEXA MARKET frontend.
 *
 * - Serves dist/public as a SPA (unknown paths → index.html)
 * - index.html is NEVER cached (CDN-safe no-store headers)
 * - Hashed assets (/assets/*) are cached for 1 year (content-addressed)
 * - Proxies /api/* and /socket.io/* to the Replit API service
 */

import { createServer, request as httpRequest } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST    = resolve(__dirname, "dist/public");
const PORT    = process.env.PORT || 3000;

// In Replit autoscale both services run in the same deployment.
// The shared proxy routes /api/* to the API service (port 8080).
// We proxy here as a fallback for any server-side API needs.
const API_URL = process.env.API_SERVER_URL || "http://localhost:8080";

const PROXY_TIMEOUT_MS = 30_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
  ".txt":  "text/plain",
  ".webmanifest": "application/manifest+json",
};

/** Forward /api/* and /socket.io/* to the API server */
function proxyRequest(req, res) {
  const target = new URL(API_URL);
  const options = {
    hostname: target.hostname,
    port:     target.port || 80,
    path:     req.url,
    method:   req.method,
    headers:  { ...req.headers, host: target.hostname },
    timeout:  PROXY_TIMEOUT_MS,
  };

  const proxy = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("timeout", () => {
    proxy.destroy();
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API timeout — please try again." }));
    }
  });

  proxy.on("error", (err) => {
    console.error("[proxy error]", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API unavailable — please try again." }));
    }
  });

  req.pipe(proxy, { end: true });
}

createServer((req, res) => {
  const pathname = (req.url || "/").split("?")[0];

  // Health check
  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Proxy API + socket paths to the API server
  if (pathname.startsWith("/api/") || pathname.startsWith("/socket.io/")) {
    proxyRequest(req, res);
    return;
  }

  // Static file serving with SPA fallback
  let filePath = join(DIST, pathname === "/" ? "/index.html" : pathname);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, "index.html");
  }

  const ext  = extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";

  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (ext === ".html") {
    // ── HTML files: NEVER cache — CDN + browser must always revalidate ─────────
    // These headers prevent caching at every layer:
    //   Cache-Control     : standard HTTP cache directive (browsers + proxies)
    //   Surrogate-Control : Fastly / Varnish CDN
    //   CDN-Cache-Control : generic CDN directive (Cloudflare, etc.)
    //   Pragma / Expires  : legacy HTTP/1.0 clients
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Cloudflare-CDN-Cache-Control", "no-cache");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  } else if (pathname.startsWith("/assets/")) {
    // ── Hashed assets: cache forever — filename changes on every build ─────────
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    // ── Other static files (fonts, icons, manifest): short cache ───────────────
    res.setHeader("Cache-Control", "public, max-age=300");
  }

  try {
    const stat = statSync(filePath);
    res.setHeader("Content-Length", stat.size);
    res.writeHead(200);
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`[FLEXA MARKET] Serving on port ${PORT}`);
  console.log(`[FLEXA MARKET] API proxy → ${API_URL}`);
});
