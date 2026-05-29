/**
 * Email sending utility via Resend.
 *
 * Hardening features:
 *   - Auto-retry (3 attempts, exponential backoff) for transient network errors
 *   - Startup validation: logs sender address + warns if RESEND_API_KEY is missing
 *   - Domain guard: warns if a non-resend.dev custom domain is set without verification
 *   - Success logging: every sent email is logged so you can confirm delivery in logs
 *   - Never throws: callers are never interrupted by email failures
 *
 * Sender rules:
 *   - Default sender: onboarding@resend.dev (works without domain verification)
 *   - Production:     set RESEND_FROM_EMAIL=noreply@yourdomain.com only AFTER
 *                     verifying the domain at resend.com/domains
 */

import { Resend } from "resend";
import { logger } from "./logger";

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const FROM_EMAIL = process.env["RESEND_FROM_EMAIL"] ?? "onboarding@resend.dev";
const FROM_NAME  = process.env["RESEND_FROM_NAME"]  ?? "FLEXA MARKET";

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS  = 500;

let _client: Resend | null | undefined;

function getClient(): Resend | null {
  if (_client !== undefined) return _client;
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    logger.error("[email] RESEND_API_KEY is not set — all emails will be skipped. Set this secret to enable email delivery.");
    _client = null;
    return null;
  }
  _client = new Resend(key);
  return _client;
}

/**
 * Call once at server startup to surface misconfiguration early.
 */
export function validateEmailConfig(): void {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    logger.error("[email] ⚠️  RESEND_API_KEY missing — OTP/welcome/notification emails will NOT be delivered");
    return;
  }

  const domain = FROM_EMAIL.split("@")[1] ?? "";
  if (domain !== "resend.dev" && !process.env["RESEND_DOMAIN_VERIFIED"]) {
    logger.warn(
      { fromEmail: FROM_EMAIL },
      "[email] Custom sender domain detected. Make sure it is verified at resend.com/domains, " +
      "otherwise emails will be silently dropped. Set RESEND_DOMAIN_VERIFIED=1 to suppress this warning.",
    );
  }

  logger.info({ fromEmail: FROM_EMAIL, fromName: FROM_NAME }, "[email] Email config OK — Resend sender ready");
}

/**
 * Send a single email via Resend with automatic retry.
 * Returns true on success, false on permanent failure.
 * Never throws.
 */
export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  const from = `${FROM_NAME} <${FROM_EMAIL}>`;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const { error } = await client.emails.send({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });

      if (error) {
        const isRetryable = isTransientError(error.message);
        logger.error(
          { to: opts.to, subject: opts.subject, attempt, err: error.message, willRetry: isRetryable && attempt < RETRY_ATTEMPTS },
          "[email] sendEmail API error",
        );
        if (!isRetryable || attempt === RETRY_ATTEMPTS) return false;
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }

      logger.info({ to: opts.to, subject: opts.subject, attempt }, "[email] ✅ Email sent successfully");
      return true;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = isTransientError(msg);
      logger.error(
        { to: opts.to, subject: opts.subject, attempt, err: msg, willRetry: isRetryable && attempt < RETRY_ATTEMPTS },
        "[email] sendEmail threw",
      );
      if (!isRetryable || attempt === RETRY_ATTEMPTS) return false;
      await sleep(RETRY_BASE_MS * attempt);
    }
  }

  return false;
}

/**
 * Send the same email to many recipients individually, in parallel chunks.
 * Returns the number of emails successfully sent.
 */
export async function sendEmailBatch(
  recipients: Array<{ email: string; name?: string }>,
  subject: string,
  text: string,
  html: string,
): Promise<number> {
  const client = getClient();
  if (!client) return 0;

  const CONCURRENCY = 20;
  let sent = 0;

  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    const chunk = recipients.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(r =>
        sendEmail({ to: r.name ? `${r.name} <${r.email}>` : r.email, subject, text, html }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) sent++;
    }
  }

  logger.info({ total: recipients.length, sent }, "[email] sendEmailBatch complete");
  return sent;
}

function isTransientError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound") ||
    lower.includes("socket") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("502")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
