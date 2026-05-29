import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { syncSuperAdmins } from "./lib/superAdmins";
import { syncCategories } from "./lib/seedCategories";
import { initSocketServer } from "./lib/socketServer";
import { runSubscriptionExpiryJob } from "./routes/subscription";
import { runLoanRepaymentJob, runLoanAdminRejectionJob } from "./routes/loans";
import { runBoostExpiryJob } from "./routes/boost";


import { runStartupMigrations } from "./lib/migrations";
import { runHighRiskAutoBlock, runAiActivityMonitor } from "./lib/ai-guardian";
import { registerProcessErrorHandlers } from "./lib/errorMonitor";
import { validateEmailConfig } from "./lib/email";

registerProcessErrorHandlers();
validateEmailConfig();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
initSocketServer(httpServer);

// ── Listen FIRST so Render marks the deploy as live immediately ───────────────
// DB initialization (migrations, superadmins, categories) happens in the
// background after the port is open.  Render has a startup timeout — if we wait
// for a cold Neon DB before binding the port the deploy is marked "failed" even
// though the code is fine.
httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");

  // ── Background DB initialisation ─────────────────────────────────────────
  runStartupMigrations()
    .catch((err) => {
      logger.warn({ err }, "Startup migrations had errors (non-fatal)");
    })
    .then(() => syncSuperAdmins())
    .catch((err) => {
      logger.error({ err }, "syncSuperAdmins failed (server already running)");
    })
    .then(() => syncCategories())
    .catch((err) => {
      logger.error({ err }, "seedCategories failed (server already running)");
    })
    .then(() => {
      logger.info("DB initialisation complete — API server fully ready");
      // Run jobs only after migrations complete so all columns exist
      // security deposit system removed — no longer charged or refunded
      // Run subscription expiry check every 30 minutes
      setInterval(() => { runSubscriptionExpiryJob().catch(() => {}); }, 30 * 60 * 1000);
      runSubscriptionExpiryJob().catch(() => {});
      // Reset isBoosted flag + clear boost fields for expired boosts every 30 minutes
      setInterval(() => { runBoostExpiryJob().catch(() => {}); }, 30 * 60 * 1000);
      runBoostExpiryJob().catch(() => {});
    });
    // Run loan repayment job every hour
    setInterval(() => { runLoanRepaymentJob().catch(() => {}); }, 60 * 60 * 1000);
    runLoanRepaymentJob().catch(() => {});
    // Auto-reject admin test loan applications after 24h
    setInterval(() => { runLoanAdminRejectionJob().catch(() => {}); }, 60 * 60 * 1000);
    runLoanAdminRejectionJob().catch(() => {});
    // AI Guardian — auto-block high-risk users every 30 min
    setInterval(() => { runHighRiskAutoBlock().catch(() => {}); }, 30 * 60 * 1000);
    runHighRiskAutoBlock().catch(() => {});
    // AI Guardian — Claude activity monitor every 2 hours
    setInterval(() => { runAiActivityMonitor().catch(() => {}); }, 2 * 60 * 60 * 1000);
    runAiActivityMonitor().catch(() => {});
    logger.info("API server ready");

    // ── Graceful shutdown ──────────────────────────────────────────────────
    // When Render deploys a new version it sends SIGTERM to the old instance.
    // We stop accepting new connections immediately, let in-flight requests
    // finish (up to 25 s), then exit cleanly so no request is dropped.
    const shutdown = (signal: string) => {
      logger.info({ signal }, "Received shutdown signal — draining connections");
      httpServer.close((err) => {
        if (err) {
          logger.error({ err }, "Error during graceful shutdown");
          process.exit(1);
        }
        logger.info("All connections closed — exiting cleanly");
        process.exit(0);
      });
      // Hard-kill fallback: if connections don't drain in 25 s, force-exit.
      setTimeout(() => {
        logger.warn("Graceful shutdown timed out after 25 s — forcing exit");
        process.exit(1);
      }, 25_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT",  () => shutdown("SIGINT"));
  });
