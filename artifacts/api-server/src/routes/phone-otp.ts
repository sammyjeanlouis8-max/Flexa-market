/**
 * OTP system — Email delivery only.
 *
 * The 6-digit OTP is delivered to the user's email address.
 * Email is resolved in this order:
 *   1. req.user.email  (when a valid JWT is present — wallet withdrawal, profile edit)
 *   2. `email` field in the request body (unauthenticated flows)
 *
 * Endpoints:
 *   POST /api/otp/send    — generate & deliver 6-digit OTP via email
 *   POST /api/otp/verify  — verify OTP; return withdrawalToken on success
 *
 * Security rules:
 *   - OTP stored as bcrypt hash (never plain text)
 *   - 5-minute expiry
 *   - Max 3 verification attempts per session
 *   - Max 3 OTP requests per email per 2 minutes (rate-limit window)
 *   - Withdrawal token (64 hex chars) issued on successful verification
 *   - No OTP reuse: verified sessions cannot be re-verified
 */

import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, phoneOtpSessionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { optionalAuth } from "../middlewares/auth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────
const OTP_TTL_MS        = 5 * 60 * 1000;
const RATE_WINDOW_MS    = 2 * 60 * 1000;
const MAX_SEND_PER_WIN  = 3;
const MAX_ATTEMPTS      = 3;
const BCRYPT_ROUNDS     = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function generateWithdrawalToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function otpEmailHtml(otpCode: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff;border-radius:12px">
    <h2 style="color:#f97316;margin:0 0 8px">FLEXA MARKET</h2>
    <p style="color:#444;margin:0 0 20px">Kòd verifikasyon ou:</p>
    <div style="background:#fff7ed;border:2px solid #f97316;border-radius:10px;padding:24px;text-align:center;margin:0 0 20px">
      <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#ea580c">${otpCode}</span>
    </div>
    <p style="color:#666;font-size:14px;margin:0 0 8px">⏱ Kòd la ekspire nan <strong>5 minit</strong>.</p>
    <p style="color:#999;font-size:12px;margin:0">Pa pataje kòd sa a ak pèsonn. FLEXA MARKET pa janm mande kòd ou.</p>
  </div>`;
}

// ── POST /api/otp/send ────────────────────────────────────────────────────────
router.post("/otp/send", optionalAuth, async (req, res): Promise<void> => {
  // Resolve email: authenticated user (JWT) > body field
  const email: string | null =
    (req as any).user?.email ??
    (EMAIL_RE.test(String(req.body?.email ?? "").trim())
      ? String(req.body.email).trim().toLowerCase()
      : null);

  if (!email) {
    res.status(400).json({
      error: "Adrès email obligatwa pou voye kòd la.",
    });
    return;
  }

  // ── Rate limiting (keyed by email) ────────────────────────────────────────
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS);
  const recentSessions = await db
    .select()
    .from(phoneOtpSessionsTable)
    .where(
      and(
        eq(phoneOtpSessionsTable.phone, email),
        sql`${phoneOtpSessionsTable.createdAt} >= ${windowStart}`
      )
    )
    .orderBy(desc(phoneOtpSessionsTable.createdAt));

  if (recentSessions.length >= MAX_SEND_PER_WIN) {
    const oldest = recentSessions[recentSessions.length - 1];
    const retryAfterMs =
      new Date(oldest.createdAt).getTime() + RATE_WINDOW_MS - Date.now();
    const retryAfterSecs = Math.ceil(Math.max(retryAfterMs, 0) / 1000);
    res.status(429).json({
      error: `Twòp demann. Tann ${retryAfterSecs}s anvan eseye ankò.`,
      retryAfterSecs,
    });
    return;
  }

  // ── Generate + hash OTP ───────────────────────────────────────────────────
  const otpCode   = generateOtp();
  const hashedOtp = await bcrypt.hash(otpCode, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const now       = new Date();

  // ── Deliver via email ─────────────────────────────────────────────────────
  const isDev = process.env["NODE_ENV"] !== "production";
  let emailSent = false;

  try {
    emailSent = await sendEmail({
      to: email,
      subject: "FLEXA MARKET – Kòd Verifikasyon Ou",
      text: `Kòd verifikasyon ou: ${otpCode}\n\nKòd la ekspire nan 5 minit. Pa pataje li ak pèsonn.`,
      html: otpEmailHtml(otpCode),
    });

    if (!emailSent && !isDev) {
      res.status(503).json({
        error: "Nou pa kapab voye kòd la kounye a. Eseye ankò nan kèk minit.",
      });
      return;
    }
  } catch (err: any) {
    logger.error({ email, err: err?.message }, "OTP email-send threw unexpectedly");
    if (!isDev) {
      res.status(503).json({ error: "Erè voye kòd la. Eseye ankò." });
      return;
    }
  }

  // ── Persist hashed OTP (email stored in phone column as session key) ──────
  const [session] = await db
    .insert(phoneOtpSessionsTable)
    .values({
      phone: email,             // email used as session identifier
      hashedOtp,
      expiresAt,
      attempts: 0,
      requestCount: recentSessions.length + 1,
      windowStart: now,
      verified: false,
      smsSent: emailSent,       // reused column: tracks email delivery
      whatsappSent: false,
    })
    .returning();

  logger.info(
    { sessionId: session.id, email, emailSent },
    "OTP session created (email delivery)"
  );

  const response: Record<string, unknown> = {
    sent: true,
    expiresAt: expiresAt.toISOString(),
    channel: "email",
    maskedEmail: email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
  };

  if (isDev) {
    response.devCode = otpCode;
    logger.warn({ email, devCode: otpCode }, "DEV MODE — returning plain OTP in response");
  }

  res.json(response);
});

// ── POST /api/otp/verify ──────────────────────────────────────────────────────
router.post("/otp/verify", optionalAuth, async (req, res): Promise<void> => {
  const inputCode = String(req.body?.code ?? "").trim();

  // Resolve session key: authenticated JWT email > body email field
  const sessionKey: string | null =
    (req as any).user?.email ??
    (EMAIL_RE.test(String(req.body?.email ?? "").trim())
      ? String(req.body.email).trim().toLowerCase()
      : null);

  if (!sessionKey) {
    res.status(400).json({ error: "Email obligatwa pou verifye kòd la." });
    return;
  }
  if (!inputCode || inputCode.length !== 6 || !/^\d{6}$/.test(inputCode)) {
    res.status(400).json({ error: "Kòd la dwe gen 6 chif" });
    return;
  }

  const now = new Date();
  const sessions = await db
    .select()
    .from(phoneOtpSessionsTable)
    .where(
      and(
        eq(phoneOtpSessionsTable.phone, sessionKey),
        eq(phoneOtpSessionsTable.verified, false),
        sql`${phoneOtpSessionsTable.expiresAt} >= ${now}`
      )
    )
    .orderBy(desc(phoneOtpSessionsTable.createdAt))
    .limit(1);

  const session = sessions[0];

  if (!session) {
    res.status(400).json({
      error: "Pa gen kòd aktif. Kòd la ekspire oswa pa t voye. Voye yon nouvo kòd.",
    });
    return;
  }

  if (session.attempts >= MAX_ATTEMPTS) {
    await db
      .update(phoneOtpSessionsTable)
      .set({ verified: true })
      .where(eq(phoneOtpSessionsTable.id, session.id));

    res.status(429).json({
      error: "Twòp eseye. Voye yon nouvo kòd.",
      maxAttemptsReached: true,
    });
    return;
  }

  await db
    .update(phoneOtpSessionsTable)
    .set({ attempts: session.attempts + 1 })
    .where(eq(phoneOtpSessionsTable.id, session.id));

  const isValid = await bcrypt.compare(inputCode, session.hashedOtp);

  if (!isValid) {
    const remaining = MAX_ATTEMPTS - (session.attempts + 1);
    res.status(400).json({
      error: `Kòd la pa kòrèk. ${remaining > 0 ? `${remaining} eseye rete.` : "Kòd la bloke. Voye yon nouvo."}`,
      remaining: Math.max(remaining, 0),
    });
    return;
  }

  const withdrawalToken = generateWithdrawalToken();

  await db
    .update(phoneOtpSessionsTable)
    .set({ verified: true, withdrawalToken })
    .where(eq(phoneOtpSessionsTable.id, session.id));

  logger.info(
    { sessionId: session.id, sessionKey },
    "OTP verified — withdrawal token issued"
  );

  res.json({
    verified: true,
    withdrawalToken,
  });
});

export default router;
