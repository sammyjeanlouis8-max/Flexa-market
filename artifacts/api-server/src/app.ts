import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { stripeWebhookHandler } from "./routes/stripeCheckout";

const app: Express = express();

app.set("trust proxy", 1);

// ─── HTTP request logger (replaces pino-http to avoid TS compatibility issues) ─
app.use((req: Request, _res: Response, next: NextFunction) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).log = logger.child({
    reqId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    method: req.method,
    url: req.url?.split("?")[0],
  });
  next();
});

// ─── Gzip compression — applied before all routes ─────────────────────────────
app.use(compression());

// ─── Stripe webhook — MUST be registered BEFORE express.json() ────────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);

// ─── Standard middleware (applied AFTER webhook route) ────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Cache-control hint for stable, public-readable endpoints ─────────────────
app.use("/api/categories", (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  next();
});

app.use("/api", router);

// ─── Serve built marketplace frontend (production single-server deployment) ───
// During the production build, the marketplace SPA is copied into dist/public/.
// We serve those static assets and fall back to index.html for any path that
// isn't an /api/ route so the React router can handle client-side navigation.
// In development the marketplace runs on its own Vite dev server, so this
// block is a no-op (the public dir won't exist).

// Explicit health check — ensures DO deploy phase passes even if dist/public is missing
app.get("/api/version", (_req, res) => res.json({ commit: "47ac022", notifLang: "en" }));
app.get("/", function(req, res, next) {
  var acceptsHtml = req.headers["accept"] && req.headers["accept"].includes("text/html");
  if (acceptsHtml) { return next(); } // let catch-all serve SPA for browser requests
  res.json({ status: "ok" }); // health check bots get JSON
});
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  // Admin auth-fix: wait for auth token before redirecting to /auth/login.
    // The compiled Admin JS redirects immediately when user===null, but user is null
    // while /auth/me is still loading. Only redirect if localStorage has no token.
    app.get("/assets/Admin-uYH4qvQD.js", function(_req, res) {
      var chunkPath = path.join(publicDir, "assets", "Admin-uYH4qvQD.js");
      try {
        var content = fs.readFileSync(chunkPath, "utf8");
        // Exact string replacement — avoids regex-literal slash ambiguity in esbuild.
        // Old compiled guard: o&&!o.isAdmin&&!o.isSuperAdmin?u("/"):o||u("/auth/login")
        var needle = '&&!o.isAdmin&&!o.isSuperAdmin?u("/"):o||u("/auth/login")';
        var replacement = '&&!o.isAdmin&&!o.isSuperAdmin?u("/"):!o&&!localStorage.getItem("flexamarket_token")&&u("/auth/login")';
        var idx = content.indexOf(needle);
        if (idx !== -1) content = content.slice(0, idx) + replacement + content.slice(idx + needle.length);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(content);
      } catch(err) {
        res.sendFile(chunkPath);
      }
    });
    
    

    // ── Page auth-fix: prevent redirect to /auth/login while JWT is still loading ──
    // Each handler patches the compiled chunk in-flight using exact-string indexOf.
    // Only redirects if localStorage has NO token (truly unauthenticated).

    // Orders page: useEffect guard "if(!p){b('/auth/login');return}"
    app.get("/assets/Orders-BnDf09yN.js", function(_req, res) {
      var chunkPath = path.join(publicDir, "assets", "Orders-BnDf09yN.js");
      try {
        var content = fs.readFileSync(chunkPath, "utf8");
        var needle = 'if(!p){b("/auth/login");return}';
        var replace = 'if(!p){if(!localStorage.getItem("flexamarket_token"))b("/auth/login");return}';
        var idx = content.indexOf(needle);
        if (idx !== -1) content = content.slice(0, idx) + replace + content.slice(idx + needle.length);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(content);
      } catch(e) { res.sendFile(chunkPath); }
    });

    // Sales page: useEffect guard "if(!c){d('/auth/login');return}"
    app.get("/assets/Sales-C9nEXzX5.js", function(_req, res) {
      var chunkPath = path.join(publicDir, "assets", "Sales-C9nEXzX5.js");
      try {
        var content = fs.readFileSync(chunkPath, "utf8");
        var needle = 'if(!c){d("/auth/login");return}';
        var replace = 'if(!c){if(!localStorage.getItem("flexamarket_token"))d("/auth/login");return}';
        var idx = content.indexOf(needle);
        if (idx !== -1) content = content.slice(0, idx) + replace + content.slice(idx + needle.length);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(content);
      } catch(e) { res.sendFile(chunkPath); }
    });

    // Saved page: useEffect guard "e||o('/auth/login')"
    app.get("/assets/Saved-BeMgiiLI.js", function(_req, res) {
      var chunkPath = path.join(publicDir, "assets", "Saved-BeMgiiLI.js");
      try {
        var content = fs.readFileSync(chunkPath, "utf8");
        var needle = 'e||o("/auth/login")';
        var replace = '!e&&!localStorage.getItem("flexamarket_token")&&o("/auth/login")';
        var idx = content.indexOf(needle);
        if (idx !== -1) content = content.slice(0, idx) + replace + content.slice(idx + needle.length);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(content);
      } catch(e) { res.sendFile(chunkPath); }
    });

    // Offers page: useEffect guard "s||x('/auth/login')"
    app.get("/assets/Offers-iXcN7-Fi.js", function(_req, res) {
      var chunkPath = path.join(publicDir, "assets", "Offers-iXcN7-Fi.js");
      try {
        var content = fs.readFileSync(chunkPath, "utf8");
        var needle = 's||x("/auth/login")';
        var replace = '!s&&!localStorage.getItem("flexamarket_token")&&x("/auth/login")';
        var idx = content.indexOf(needle);
        if (idx !== -1) content = content.slice(0, idx) + replace + content.slice(idx + needle.length);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(content);
      } catch(e) { res.sendFile(chunkPath); }
    });

    // Cart page: useEffect guard "a||x('/auth/login')"
    app.get("/assets/Cart-D_xVsvFC.js", function(_req, res) {
      var chunkPath = path.join(publicDir, "assets", "Cart-D_xVsvFC.js");
      try {
        var content = fs.readFileSync(chunkPath, "utf8");
        var needle = 'a||x("/auth/login")';
        var replace = '!a&&!localStorage.getItem("flexamarket_token")&&x("/auth/login")';
        var idx = content.indexOf(needle);
        if (idx !== -1) content = content.slice(0, idx) + replace + content.slice(idx + needle.length);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(content);
      } catch(e) { res.sendFile(chunkPath); }
    });

      // Messages auth-fix: bypass CF immutable cache with no-store + localStorage check
  app.get("/assets/Messages-DGDTDrtQ.js", function(_req, res) {
    var chunkPath = path.join(publicDir, "assets", "Messages-DGDTDrtQ.js");
    try {
      var content = fs.readFileSync(chunkPath, "utf8");
      content = content
        .replace(
          /i\.useEffect\(\(\)=>\{const h=setTimeout\(\(\)=>\{t\|\|s\("\/auth\/login"\)\},\d+\);return\(\)=>clearTimeout\(h\)\},\[t\]\)/g,
          'i.useEffect(()=>{!t&&!localStorage.getItem("flexamarket_token")&&s("/auth/login")},[t])'
        )
        .replace(
          /i\.useEffect\(\(\)=>\{t\|\|s\("\/auth\/login"\)\},\[t\]\)/g,
          'i.useEffect(()=>{!t&&!localStorage.getItem("flexamarket_token")&&s("/auth/login")},[t])'
        );
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(content);
    } catch(err) {
      res.sendFile(chunkPath);
    }
  });

  // Messages auth-fix: intercept before static middleware so no-store header
  // forces Cloudflare to bypass its immutable cache on this specific chunk.
  app.get("/assets/Messages-DGDTDrtQ.js", function(_req, res) {
    var chunkPath = path.join(publicDir, "assets", "Messages-DGDTDrtQ.js");
    try {
      var content = fs.readFileSync(chunkPath, "utf8");
      // fix: timeout-based redirect → localStorage check
      content = content.replace(
        /i\.useEffect\(\(\)=>\{const h=setTimeout\(\(\)=>\{t\|\|s\("\/auth\/login"\)\},\d+\);return\(\)=>clearTimeout\(h\)\},\[t\]\)/g,
        'i.useEffect(()=>{!t&&!localStorage.getItem("flexamarket_token")&&s("/auth/login")},[t])'
      );
      // fix: bare redirect (original) → localStorage check
      content = content.replace(
        /i\.useEffect\(\(\)=>\{t\|\|s\("\/auth\/login"\)\},\[t\]\)/g,
        'i.useEffect(()=>{!t&&!localStorage.getItem("flexamarket_token")&&s("/auth/login")},[t])'
      );
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(content);
    } catch(err) {
      res.sendFile(chunkPath);
    }
  });

  // Immutable hashed assets (JS/CSS chunks) — cache aggressively
  app.use(
    express.static(publicDir, {
      maxAge: "1y",
      immutable: true,
      index: false, // don't auto-serve index.html here — let the catch-all below handle it
      setHeaders: (res: import("http").ServerResponse, filePath: string) => {
        // BoostWizard is always served fresh so a CDN cache bust is never needed again
        if (filePath.includes("BoostWizard")) res.setHeader("Cache-Control", "no-store");
      },
    }),
  );

  // SPA catch-all: every non-API route serves index.html so React Router works
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  // Health check for load-balancers when running without the frontend bundle
  app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });
}

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  const cause = (err as Error & { cause?: unknown }).cause;
  logger.error(
    {
      err,
      cause: cause instanceof Error
        ? { message: cause.message, stack: cause.stack }
        : cause,
      url: req.url,
      method: req.method,
    },
    "Unhandled route error",
  );
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
