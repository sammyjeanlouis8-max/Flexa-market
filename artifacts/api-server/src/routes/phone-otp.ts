/**
 * OTP system — dual channel (additive; preserves email withdrawal OTP).
 *
 * Phone login / country change (OpenAPI contract):
 *   POST /api/otp/send    { phone, country } → SMS via Twilio when configured
 *   POST /api/otp/verify  { phone, country, code } → { phoneToken, phone, country }
 *   phoneToken is JWT type "phone-verified" from generatePhoneToken (30m).
 *   Never treat withdrawalToken as a login credential.
 *
 * Email / wallet withdrawal (existing):
 *   POST /api/otp/send    with JWT email or { email }
 *   POST /api/otp/verify  → { verified, withdrawalToken }
 *
 * Security: bcrypt-hashed OTP, 5m expiry, 3 attempts, 3 sends / 2m window, no reuse.
 */

import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, phoneOtpSessionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { optionalAuth } from "../middlewares/auth";
import { generatePhoneToken } from "../lib/auth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { isTwilioConfigured, sendSms } from "../lib/sms";

const router = Router();

const OTP_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 2 * 60 * 1000;
const MAX_SEND_PER_WIN = 3;
const MAX_ATTEMPTS = 3;
const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function generateWithdrawalToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function normalizePhone(raw: string): string {
  const trimmed = String(raw || "").trim().replace(/[\s\-().]/g, "");
  if (!trimmed) return "";
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

function otpEmailHtml(otpCode: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff;border-radius:12px">
    <h2 style="color:#f97316;margin:0 0 8px">FLEXA MARKET</h2>
    <p style="color:#444;margin:0 0 20px">Your verification code:</p>
    <div style="background:#fff7ed;border:2px solid #f97316;border-radius:10px;padding:24px;text-align:center;margin:0 0 20px">
      <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#ea580c">${otpCode}</span>
    </div>
    <p style="color:#666;font-size:14px;margin:0 0 8px">⏱ This code expires in <strong>5 minutes</strong>.</p>
    <p style="color:#999;font-size:12px;margin:0">Do not share this code with anyone. FLEXA MARKET will never ask for your code.</p>
  </div>`;
}

async function rateLimited(sessionKey: string): Promise<{ ok: true; count: number } | { ok: false; retryAfterSecs: number }> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS);
  const recentSessions = await db
    .select()
    .from(phoneOtpSessionsTable)
    .where(
      and(
        eq(phoneOtpSessionsTable.phone, sessionKey),
        sql`${phoneOtpSessionsTable.createdAt} >= ${windowStart}`,
      ),
    )
    .orderBy(desc(phoneOtpSessionsTable.createdAt));

  if (recentSessions.length >= MAX_SEND_PER_WIN) {
    const oldest = recentSessions[recentSessions.length - 1];
    const retryAfterMs =
      new Date(oldest.createdAt).getTime() + RATE_WINDOW_MS - Date.now();
    return { ok: false, retryAfterSecs: Math.ceil(Math.max(retryAfterMs, 0) / 1000) };
  }
  return { ok: true, count: recentSessions.length };
}

async function verifySession(
  sessionKey: string,
  inputCode: string,
): Promise<{ ok: true; sessionId: number } | { ok: false; status: number; body: Record<string, unknown> }> {
  if (!inputCode || inputCode.length !== 6 || !/^\d{6}$/.test(inputCode)) {
    return { ok: false, status: 400, body: { error: "Kòd la dwe gen 6 chif" } };
  }

  const now = new Date();
  const sessions = await db
    .select()
    .from(phoneOtpSessionsTable)
    .where(
      and(
        eq(phoneOtpSessionsTable.phone, sessionKey),
        eq(phoneOtpSessionsTable.verified, false),
        sql`${phoneOtpSessionsTable.expiresAt} >= ${now}`,
      ),
    )
    .orderBy(desc(phoneOtpSessionsTable.createdAt))
    .limit(1);

  const session = sessions[0];
  if (!session) {
    return {
      ok: false,
      status: 400,
      body: { error: "Pa gen kòd aktif. Kòd la ekspire oswa pa t voye. Voye yon nouvo kòd." },
    };
  }

  if (session.attempts >= MAX_ATTEMPTS) {
    await db
      .update(phoneOtpSessionsTable)
      .set({ verified: true })
      .where(eq(phoneOtpSessionsTable.id, session.id));
    return {
      ok: false,
      status: 429,
      body: { error: "Twòp eseye. Voye yon nouvo kòd.", maxAttemptsReached: true },
    };
  }

  await db
    .update(phoneOtpSessionsTable)
    .set({ attempts: session.attempts + 1 })
    .where(eq(phoneOtpSessionsTable.id, session.id));

  const isValid = await bcrypt.compare(inputCode, session.hashedOtp);
  if (!isValid) {
    const remaining = MAX_ATTEMPTS - (session.attempts + 1);
    return {
      ok: false,
      status: 400,
      body: {
        error: `Kòd la pa kòrèk. ${remaining > 0 ? `${remaining} eseye rete.` : "Kòd la bloke. Voye yon nouvo."}`,
        remaining: Math.max(remaining, 0),
      },
    };
  }

  return { ok: true, sessionId: session.id };
}

// ── POST /api/otp/send ────────────────────────────────────────────────────────
router.post("/otp/send", optionalAuth, async (req, res): Promise<void> => {
  const phoneRaw = String(req.body?.phone ?? "").trim();
  const country = String(req.body?.country ?? "").trim();
  const phone = normalizePhone(phoneRaw);
  const isDev = process.env["NODE_ENV"] !== "production";

  // ── Phone channel (OpenAPI SendOtpBody) ───────────────────────────────────
  if (phoneRaw && country) {
    if (!/^\+[0-9]{8,16}$/.test(phone)) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }
    if (country.length < 2 || country.length > 80) {
      res.status(400).json({ error: "Invalid country" });
      return;
    }

    const rate = await rateLimited(phone);
    if (!rate.ok) {
      res.status(429).json({
        error: `Too many requests. Wait ${rate.retryAfterSecs}s before trying again.`,
        retryAfterSecs: rate.retryAfterSecs,
      });
      return;
    }

    if (!isTwilioConfigured() && !isDev) {
      res.status(503).json({
        error: "SMS delivery is not configured (Twilio). Phone OTP unavailable.",
        code: "SMS_NOT_CONFIGURED",
      });
      return;
    }

    const otpCode = generateOtp();
    const hashedOtp = await bcrypt.hash(otpCode, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const now = new Date();

    let smsSent = false;
    if (isTwilioConfigured()) {
      const result = await sendSms(
        phone,
        `FLEXA MARKET code: ${otpCode}. Expires in 5 minutes. Do not share.`,
      );
      smsSent = result.ok;
      if (!result.ok && !isDev) {
        res.status(503).json({ error: result.error || "Could not send SMS" });
        return;
      }
    }

    // Store phone as session key; country embedded in session via whatsappSent unused —
    // persist country in requestCount windowStart metadata by appending to phone key? Better:
    // store session key as phone and keep country only for token issuance on verify (client re-sends).
    const [session] = await db
      .insert(phoneOtpSessionsTable)
      .values({
        phone,
        hashedOtp,
        expiresAt,
        attempts: 0,
        requestCount: rate.count + 1,
        windowStart: now,
        verified: false,
        smsSent,
        whatsappSent: false,
      })
      .returning();

    logger.info({ sessionId: session.id, phone, smsSent, country }, "OTP session created (phone/SMS)");

    const response: Record<string, unknown> = {
      sent: true,
      message: "OTP sent",
      expiresAt: expiresAt.toISOString(),
      channel: "sms",
      maskedPhone: phone.replace(/^(\+\d{1,3})\d+(\d{2})$/, "$1***$2"),
    };
    if (isDev) {
      response.devCode = otpCode;
      logger.warn({ phone, devCode: otpCode }, "DEV MODE — returning plain phone OTP");
    }
    res.json(response);
    return;
  }

  // ── Email channel (wallet withdrawal / authenticated) ─────────────────────
  const email: string | null =
    (req as any).user?.email ??
    (EMAIL_RE.test(String(req.body?.email ?? "").trim())
      ? String(req.body.email).trim().toLowerCase()
      : null);

  if (!email) {
    res.status(400).json({
      error: "Provide phone+country for login OTP, or email for withdrawal OTP.",
    });
    return;
  }

  const rate = await rateLimited(email);
  if (!rate.ok) {
    res.status(429).json({
      error: `Too many requests. Wait ${rate.retryAfterSecs}s before trying again.`,
      retryAfterSecs: rate.retryAfterSecs,
    });
    return;
  }

  const otpCode = generateOtp();
  const hashedOtp = await bcrypt.hash(otpCode, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const now = new Date();

  let emailSent = false;
  try {
    emailSent = await sendEmail({
      to: email,
      subject: "FLEXA MARKET – Your Verification Code",
      text: `Your verification code: ${otpCode}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
      html: otpEmailHtml(otpCode),
    });
    if (!emailSent && !isDev) {
      res.status(503).json({
        error: "We can't send the code right now. Try again in a few minutes.",
      });
      return;
    }
  } catch (err: any) {
    logger.error({ email, err: err?.message }, "OTP email-send threw unexpectedly");
    if (!isDev) {
      res.status(503).json({ error: "Could not send the code. Try again." });
      return;
    }
  }

  const [session] = await db
    .insert(phoneOtpSessionsTable)
    .values({
      phone: email,
      hashedOtp,
      expiresAt,
      attempts: 0,
      requestCount: rate.count + 1,
      windowStart: now,
      verified: false,
      smsSent: emailSent,
      whatsappSent: false,
    })
    .returning();

  logger.info({ sessionId: session.id, email, emailSent }, "OTP session created (email delivery)");

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
  const phoneRaw = String(req.body?.phone ?? "").trim();
  const country = String(req.body?.country ?? "").trim();
  const phone = normalizePhone(phoneRaw);

  // ── Phone verify → phoneToken (login / change-country) ────────────────────
  if (phoneRaw && country) {
    if (!/^\+[0-9]{8,16}$/.test(phone)) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }
    const result = await verifySession(phone, inputCode);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    const phoneToken = generatePhoneToken(phone, country);
    await db
      .update(phoneOtpSessionsTable)
      .set({ verified: true })
      .where(eq(phoneOtpSessionsTable.id, result.sessionId));

    logger.info({ sessionId: result.sessionId, phone }, "OTP verified — phoneToken issued");
    res.json({ phoneToken, phone, country });
    return;
  }

  // ── Email verify → withdrawalToken only (never a login credential) ────────
  const sessionKey: string | null =
    (req as any).user?.email ??
    (EMAIL_RE.test(String(req.body?.email ?? "").trim())
      ? String(req.body.email).trim().toLowerCase()
      : null);

  if (!sessionKey) {
    res.status(400).json({ error: "Email obligatwa pou verifye kòd la." });
    return;
  }

  const result = await verifySession(sessionKey, inputCode);
  if (!result.ok) {
    res.status(result.status).json(result.body);
    return;
  }

  const withdrawalToken = generateWithdrawalToken();
  await db
    .update(phoneOtpSessionsTable)
    .set({ verified: true, withdrawalToken })
    .where(eq(phoneOtpSessionsTable.id, result.sessionId));

  logger.info({ sessionId: result.sessionId, sessionKey }, "OTP verified — withdrawal token issued");
  res.json({ verified: true, withdrawalToken });
});

export default router;
