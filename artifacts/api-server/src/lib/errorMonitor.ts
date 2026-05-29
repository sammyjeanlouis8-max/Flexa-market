/**
 * Process-level error monitoring.
 * Catches uncaught exceptions and unhandled promise rejections,
 * logs them, and emails the admin team so crashes are never silent.
 */
import { logger } from "./logger";
import { sendEmail } from "./email";
import { crashAlertEmail } from "./emailTemplates";

const ADMIN_ALERT_EMAIL = process.env["ADMIN_ALERT_EMAIL"] ?? "admin@flexamarket.com";
const ENV = process.env["NODE_ENV"] ?? "production";

let lastAlertAt = 0;
const RATE_LIMIT_MS = 60_000; // max one crash email per minute

async function sendCrashAlert(type: string, err: unknown): Promise<void> {
  const now = Date.now();
  if (now - lastAlertAt < RATE_LIMIT_MS) return;
  lastAlertAt = now;

  const message = err instanceof Error ? err.message : String(err);
  const stack    = err instanceof Error ? err.stack  : undefined;

  logger.error({ type, message, stack }, "CRASH ALERT");

  const { subject, html, text } = crashAlertEmail({ type, message, stack, env: ENV });
  await sendEmail({ to: ADMIN_ALERT_EMAIL, subject, html, text }).catch(() => {});
}

export function registerProcessErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    sendCrashAlert("uncaughtException", err).catch(() => {});
    // Give async email a moment, then exit — uncaught exceptions leave
    // the process in an undefined state and it must not continue running.
    setTimeout(() => process.exit(1), 3_000).unref();
  });

  process.on("unhandledRejection", (reason) => {
    sendCrashAlert("unhandledRejection", reason).catch(() => {});
    // unhandledRejection is non-fatal — log and alert but keep running.
  });
}
