import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
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

// ─── Root health check (DigitalOcean / load-balancers check GET /) ────────────
app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

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
