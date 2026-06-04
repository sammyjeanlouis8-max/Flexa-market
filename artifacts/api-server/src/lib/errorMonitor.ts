/**
 * Process-level error monitoring.
 * Catches uncaught exceptions and unhandled promise rejections,
 * logs them, and emails the admin team so crashes are never silent.
 */
import { logger } from "./logger";
import { sendEmail } from "./email";
import { crashAlertEmail } from "./emailTemplates";

// IMPORTANT: do NOT default to a non-deliverable mailbox. The root domain
// flexamarket.com has no MX record, so admin@flexamarket.com can never receive
// mail — every crash alert sent there BOUNCES, which damages the Resend sending
// reputation and eventually causes real user emails (OTP, welcome) to stop
// being delivered. Crash alerts are only emailed when an operator explicitly
// sets ADMIN_ALERT_EMAIL to a real, deliverable address (e.g. a Gmail inbox),
// and only in production. In every case the crash is still written to the logs.
const ADMIN_ALERT_EMAIL = (process.env["ADMIN_ALERT_EMAIL"] ?? "").trim();
const ENV = process.env["NODE_ENV"] ?? "production";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRASH_ALERT_EMAILS_ENABLED =
  ENV === "production" && EMAIL_RE.test(ADMIN_ALERT_EMAIL);

let lastAlertAt = 0;
const RATE_LIMIT_MS = 60_000; // max one crash email per minute

async function sendCrashAlert(type: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack    = err instanceof Error ? err.stack  : undefined;

  // Always log — logging is free and never bounces.
  logger.error({ type, message, stack }, "CRASH ALERT");

  // Only email a real, configured, deliverable address (production only).
  if (!CRASH_ALERT_EMAILS_ENABLED) return;

  const now = Date.now();
  if (now - lastAlertAt < RATE_LIMIT_MS) return;
  lastAlertAt = now;

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
