/**
 * Account Recovery System
 *
 * Endpoints:
 *   POST /api/recovery/start              — look up user, send OTP via SMS/email
 *   POST /api/recovery/verify-otp         — verify 6-digit OTP (max 3 attempts)
 *   POST /api/recovery/resend-otp         — resend OTP for active session
 *   POST /api/recovery/get-questions      — fetch user's security question prompts
 *   POST /api/recovery/verify-security    — verify security question answers
 *   POST /api/recovery/reset-password     — set new password (requires verified session)
 *   POST /api/recovery/setup-questions    — save/update security questions (auth required)
 *   GET  /api/recovery/has-questions      — check if user has security questions (auth required)
 *
 * Security rules:
 *   - OTP: bcrypt-hashed, 10-minute TTL, max 3 wrong guesses → 15-minute lockout
 *   - Security questions: bcrypt-hashed answers, max 3 wrong guesses → 1-hour lockout
 *   - Recovery session expires after 20 minutes
 *   - All attempts logged to login_logs
 */

import { Router, Request } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, loginLogsTable, securityQuestionsTable, accountRecoverySessionsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { hashPassword } from "../lib/auth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────
const SESSION_TTL_MS     = 20 * 60 * 1000;   // 20-min session window
const OTP_TTL_MS         = 10 * 60 * 1000;   // 10-min OTP validity
const MAX_OTP_ATTEMPTS   = 3;
const OTP_LOCK_MS        = 15 * 60 * 1000;   // 15-min lockout after OTP failure
const MAX_SQ_ATTEMPTS    = 3;
const SQ_LOCK_MS         = 60 * 60 * 1000;   // 1-hour lockout after security Q failure
const BCRYPT_ROUNDS      = 10;

// ── Predefined security questions ─────────────────────────────────────────────
export const SECURITY_QUESTIONS: Record<string, string> = {
  mother_maiden_name:  "Ki te prenon manman ou anvan marye? / What was your mother's maiden name?",
  first_pet_name:      "Ki te non premye bèt kay ou? / What was your first pet's name?",
  birth_city:          "Ki kote ou te fèt? / In what city were you born?",
  elementary_school:   "Ki non lekòl primè ou te ale? / What was the name of your elementary school?",
  childhood_friend:    "Ki non pi bon zanmi anfans ou? / What was your childhood best friend's name?",
  first_car_brand:     "Ki mak te premye machin ou? / What was the brand of your first car?",
  grandmother_city:    "Ki kote grand manman ou te abite? / In what city did your grandmother live?",
  childhood_street:    "Ki non lari kote ou te grandi? / What was the street you grew up on?",
  favorite_teacher:    "Ki non pwofesè ou te renmen plis? / What was your favorite teacher's name?",
  parents_met_city:    "Ki kote papa ak manman ou te kontre? / In what city did your parents meet?",
  childhood_nickname:  "Ki te siyati ou lè ou te timoun? / What was your childhood nickname?",
  first_job_company:   "Ki non konpayi premye djòb ou? / What was your first employer's name?",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return "***";
  return phone.slice(0, 3) + "****" + phone.slice(-2);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";
  return local.slice(0, 2) + "***@" + domain;
}

async function logAction(userId: number, ip: string, ua: string | undefined, action: string) {
  try {
    await db.insert(loginLogsTable).values({ userId, ip, userAgent: ua ?? null, action });
  } catch {}
}

// ── POST /api/recovery/start ──────────────────────────────────────────────────
router.post("/recovery/start", async (req, res): Promise<void> => {
  const identifier = typeof req.body?.identifier === "string" ? req.body.identifier.trim() : null;
  if (!identifier) {
    res.status(400).json({ error: "Email obligatwa" });
    return;
  }

  const ip = getClientIp(req);
  const ua = req.headers["user-agent"];

  // Find user by email OR phone number
  const isPhone = /^\+?[\d\s\-().]{7,}$/.test(identifier);
  let user: typeof usersTable.$inferSelect | undefined;
  if (isPhone) {
    // Normalize: ensure leading +
    const normalized = identifier.startsWith("+") ? identifier : "+" + identifier.replace(/\D/g, "");
    const [byPhone] = await db.select().from(usersTable).where(eq(usersTable.phone, normalized));
    user = byPhone;
  }
  if (!user) {
    // Fallback: search by email
    const emailLower = identifier.toLowerCase();
    const [byEmail] = await db.select().from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${emailLower}`);
    user = byEmail;
  }

  if (!user) {
    // Always succeed to prevent account enumeration
    res.json({ sent: true, maskedDestination: "****", sentVia: "email" });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: "Kont sa a sispann. Kontakte sipò pou èd." });
    return;
  }

  // Check for active sessions (rate-limit: max 3 starts per 10 min per user)
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` })
    .from(accountRecoverySessionsTable)
    .where(and(
      eq(accountRecoverySessionsTable.userId, user.id),
      sql`${accountRecoverySessionsTable.createdAt} >= ${tenMinAgo}`
    ));
  if (Number(cnt) >= 3) {
    res.status(429).json({ error: "Twòp demann. Tann 10 minit anvan eseye ankò." });
    return;
  }

  // Generate OTP
  const otpCode = generateOtp();
  const hashedOtp = await bcrypt.hash(otpCode, BCRYPT_ROUNDS);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // Always deliver via email (even when found by phone)
  const sentVia = "email";
  const maskedDestination = user.email ? maskEmail(user.email) : maskPhone(user.phone ?? "");
  const isDev = process.env["NODE_ENV"] !== "production";

  const emailText = `Hello ${user.name},\n\nYour FLEXA MARKET account recovery code: ${otpCode}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nIf you did not request this code, please ignore this message.`;
  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff;border-radius:12px">
    <h2 style="color:#f97316;margin:0 0 8px">FLEXA MARKET</h2>
    <p style="color:#444;margin:0 0 4px">Hello <strong>${user.name}</strong>,</p>
    <p style="color:#444;margin:0 0 16px">Your account recovery code:</p>
    <div style="background:#fff7ed;border:2px solid #f97316;border-radius:10px;padding:24px;text-align:center;margin:0 0 16px">
      <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#ea580c">${otpCode}</span>
    </div>
    <p style="color:#666;font-size:14px;margin:0 0 8px">⏱ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
    <p style="color:#999;font-size:12px;margin:0">If you did not request this code, please ignore this message.</p>
  </div>`;
  await sendEmail({ to: user.email, subject: "FLEXA MARKET – Account Recovery Code", text: emailText, html: emailHtml }).catch(() => {});

  // Persist session
  await db.insert(accountRecoverySessionsTable).values({
    sessionToken,
    userId: user.id,
    step: "otp_pending",
    otpHash: hashedOtp,
    otpExpiresAt,
    otpAttempts: 0,
    otpSentVia: sentVia,
    sqAttempts: 0,
    ip,
    expiresAt,
  });

  await logAction(user.id, ip, ua, "recovery-start");
  logger.info({ userId: user.id, sentVia }, "Account recovery started");

  const response: Record<string, unknown> = {
    sent: true,
    sessionToken,
    sentVia,
    maskedDestination,
  };
  if (isDev) {
    response.devCode = otpCode;
    logger.warn({ devCode: otpCode }, "DEV MODE — returning plain OTP");
  }
  res.json(response);
});

// ── POST /api/recovery/verify-otp ────────────────────────────────────────────
router.post("/recovery/verify-otp", async (req, res): Promise<void> => {
  const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken.trim() : null;
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : null;

  if (!sessionToken || !code) {
    res.status(400).json({ error: "sessionToken ak kòd obligatwa" });
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "Kòd la dwe gen 6 chif" });
    return;
  }

  const ip = getClientIp(req);
  const ua = req.headers["user-agent"];
  const now = new Date();

  const [session] = await db.select().from(accountRecoverySessionsTable)
    .where(eq(accountRecoverySessionsTable.sessionToken, sessionToken));

  if (!session) {
    res.status(404).json({ error: "Sesyon pa valid oswa ekspire. Kòmanse ankò." });
    return;
  }
  if (session.step !== "otp_pending") {
    res.status(400).json({ error: "Sesyon sa a deja pase etap OTP la." });
    return;
  }
  if (new Date(session.expiresAt) < now) {
    res.status(400).json({ error: "Sesyon ekspire. Kòmanse ankò.", expired: true });
    return;
  }

  // Lockout check
  if (session.lockedUntil && new Date(session.lockedUntil) > now) {
    const secsLeft = Math.ceil((new Date(session.lockedUntil).getTime() - now.getTime()) / 1000);
    res.status(429).json({ error: `Kont bloke. Eseye ankò nan ${Math.ceil(secsLeft / 60)} minit.`, lockedUntilSecs: secsLeft });
    return;
  }

  if (!session.otpHash || !session.otpExpiresAt) {
    res.status(400).json({ error: "Pa gen OTP aktif. Kòmanse ankò." });
    return;
  }
  if (new Date(session.otpExpiresAt) < now) {
    res.status(400).json({ error: "Kòd la ekspire. Voye yon nouvo kòd.", otpExpired: true });
    return;
  }
  if (session.otpAttempts >= MAX_OTP_ATTEMPTS) {
    // Already exceeded — push to security questions
    await db.update(accountRecoverySessionsTable)
      .set({ step: "otp_failed" })
      .where(eq(accountRecoverySessionsTable.id, session.id));
    res.status(429).json({ error: "Twòp eseye. Itilize kesyon sekirite yo.", maxAttemptsReached: true, useSecurityQuestions: true });
    return;
  }

  // Increment attempt before bcrypt
  await db.update(accountRecoverySessionsTable)
    .set({ otpAttempts: session.otpAttempts + 1 })
    .where(eq(accountRecoverySessionsTable.id, session.id));

  const isValid = await bcrypt.compare(code, session.otpHash);

  if (!isValid) {
    const newAttempts = session.otpAttempts + 1;
    const remaining = MAX_OTP_ATTEMPTS - newAttempts;

    if (newAttempts >= MAX_OTP_ATTEMPTS) {
      // Lock and allow security question fallback
      await db.update(accountRecoverySessionsTable)
        .set({ step: "otp_failed", lockedUntil: new Date(Date.now() + OTP_LOCK_MS) })
        .where(eq(accountRecoverySessionsTable.id, session.id));

      await logAction(session.userId, ip, ua, "recovery-otp-failed");
      res.status(400).json({
        error: "Kòd pa kòrèk. Eseye kesyon sekirite yo.",
        remaining: 0,
        useSecurityQuestions: true,
      });
      return;
    }

    res.status(400).json({
      error: `Kòd la pa kòrèk. ${remaining} eseye rete.`,
      remaining,
    });
    return;
  }

  // OTP correct — advance to verified
  const hasQuestions = await db.select({ id: securityQuestionsTable.id })
    .from(securityQuestionsTable)
    .where(eq(securityQuestionsTable.userId, session.userId))
    .limit(1);

  await db.update(accountRecoverySessionsTable)
    .set({ step: "otp_verified" })
    .where(eq(accountRecoverySessionsTable.id, session.id));

  await logAction(session.userId, ip, ua, "recovery-otp-verified");
  logger.info({ userId: session.userId }, "OTP verified for recovery");

  res.json({ verified: true, hasSecurityQuestions: hasQuestions.length > 0 });
});

// ── POST /api/recovery/resend-otp ─────────────────────────────────────────────
router.post("/recovery/resend-otp", async (req, res): Promise<void> => {
  const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken.trim() : null;
  if (!sessionToken) {
    res.status(400).json({ error: "sessionToken obligatwa" });
    return;
  }

  const now = new Date();
  const [session] = await db.select().from(accountRecoverySessionsTable)
    .where(eq(accountRecoverySessionsTable.sessionToken, sessionToken));

  if (!session || new Date(session.expiresAt) < now) {
    res.status(404).json({ error: "Sesyon pa valid oswa ekspire. Kòmanse ankò.", expired: true });
    return;
  }
  if (session.step !== "otp_pending") {
    res.status(400).json({ error: "Pa ka voye OTP. Sesyon a nan etap '" + session.step + "'." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user) { res.status(404).json({ error: "Itilizatè pa jwenn" }); return; }

  const otpCode = generateOtp();
  const hashedOtp = await bcrypt.hash(otpCode, BCRYPT_ROUNDS);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

  const sentVia = "email";

  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff;border-radius:12px">
    <h2 style="color:#f97316;margin:0 0 8px">FLEXA MARKET</h2>
    <p style="color:#444;margin:0 0 16px">Your new account recovery code:</p>
    <div style="background:#fff7ed;border:2px solid #f97316;border-radius:10px;padding:24px;text-align:center;margin:0 0 16px">
      <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#ea580c">${otpCode}</span>
    </div>
    <p style="color:#666;font-size:14px;margin:0 0 8px">⏱ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
  </div>`;
  await sendEmail({ to: user.email, subject: "FLEXA MARKET – New Recovery Code", text: `Your new recovery code: ${otpCode}\nThis code expires in 10 minutes.`, html: emailHtml }).catch(() => {});

  await db.update(accountRecoverySessionsTable)
    .set({ otpHash: hashedOtp, otpExpiresAt, otpAttempts: 0, lockedUntil: null })
    .where(eq(accountRecoverySessionsTable.id, session.id));

  const isDev = process.env["NODE_ENV"] !== "production";
  const response: Record<string, unknown> = { sent: true, sentVia, maskedDestination: maskEmail(user.email) };
  if (isDev) response.devCode = otpCode;
  res.json(response);
});

// ── POST /api/recovery/get-questions ─────────────────────────────────────────
router.post("/recovery/get-questions", async (req, res): Promise<void> => {
  const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken.trim() : null;
  if (!sessionToken) {
    res.status(400).json({ error: "sessionToken obligatwa" });
    return;
  }

  const now = new Date();
  const [session] = await db.select().from(accountRecoverySessionsTable)
    .where(eq(accountRecoverySessionsTable.sessionToken, sessionToken));

  if (!session || new Date(session.expiresAt) < now) {
    res.status(404).json({ error: "Sesyon pa valid oswa ekspire. Kòmanse ankò.", expired: true });
    return;
  }
  // Allow if OTP failed or still pending (user choosing alternate path)
  if (!["otp_pending", "otp_failed"].includes(session.step)) {
    res.status(400).json({ error: "Sesyon sa a pa ka itilize kesyon sekirite." });
    return;
  }

  // Lockout check
  if (session.lockedUntil && new Date(session.lockedUntil) > now) {
    const secsLeft = Math.ceil((new Date(session.lockedUntil).getTime() - now.getTime()) / 1000);
    res.status(429).json({ error: `Kont bloke. Eseye ankò nan ${Math.ceil(secsLeft / 60)} minit.`, lockedUntilSecs: secsLeft });
    return;
  }

  const questions = await db.select({ questionKey: securityQuestionsTable.questionKey })
    .from(securityQuestionsTable)
    .where(eq(securityQuestionsTable.userId, session.userId));

  if (questions.length < 2) {
    res.status(400).json({ error: "Ou pa gen kesyon sekirite konfigire sou kont sa a.", noQuestions: true });
    return;
  }

  // If step was otp_pending, move it to otp_failed to allow security question path
  if (session.step === "otp_pending") {
    await db.update(accountRecoverySessionsTable)
      .set({ step: "otp_failed" })
      .where(eq(accountRecoverySessionsTable.id, session.id));
  }

  res.json({
    questions: questions.map(q => ({
      key: q.questionKey,
      text: SECURITY_QUESTIONS[q.questionKey] ?? q.questionKey,
    })),
  });
});

// ── POST /api/recovery/verify-security ───────────────────────────────────────
router.post("/recovery/verify-security", async (req, res): Promise<void> => {
  const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken.trim() : null;
  const answers: unknown = req.body?.answers;

  if (!sessionToken || !Array.isArray(answers) || answers.length < 2) {
    res.status(400).json({ error: "sessionToken ak 2 repons obligatwa" });
    return;
  }

  const ip = getClientIp(req);
  const ua = req.headers["user-agent"];
  const now = new Date();

  const [session] = await db.select().from(accountRecoverySessionsTable)
    .where(eq(accountRecoverySessionsTable.sessionToken, sessionToken));

  if (!session || new Date(session.expiresAt) < now) {
    res.status(404).json({ error: "Sesyon pa valid oswa ekspire. Kòmanse ankò.", expired: true });
    return;
  }
  if (session.step !== "otp_failed") {
    res.status(400).json({ error: "Sesyon sa a pa nan etap kesyon sekirite." });
    return;
  }

  // Lockout check (re-use lockedUntil field, sq_attempts drives the sq lock)
  if (session.sqAttempts >= MAX_SQ_ATTEMPTS) {
    const lockExpiry = session.lockedUntil ? new Date(session.lockedUntil) : new Date(0);
    if (lockExpiry > now) {
      const secsLeft = Math.ceil((lockExpiry.getTime() - now.getTime()) / 1000);
      res.status(429).json({ error: `Twòp eseye. Kont bloke ${Math.ceil(secsLeft / 60)} minit.`, lockedUntilSecs: secsLeft });
      return;
    }
  }

  const storedQuestions = await db.select()
    .from(securityQuestionsTable)
    .where(eq(securityQuestionsTable.userId, session.userId));

  if (storedQuestions.length < 2) {
    res.status(400).json({ error: "Pa gen kesyon sekirite konfigire." });
    return;
  }

  // Validate answers — must match by questionKey
  const answersMap = new Map<string, string>(
    (answers as Array<{ key: string; answer: string }>)
      .map(a => [String(a.key), String(a.answer ?? "").trim().toLowerCase()])
  );

  let allCorrect = true;
  for (const sq of storedQuestions) {
    const providedAnswer = answersMap.get(sq.questionKey);
    if (!providedAnswer) { allCorrect = false; break; }
    const match = await bcrypt.compare(providedAnswer, sq.answerHash);
    if (!match) { allCorrect = false; break; }
  }

  if (!allCorrect) {
    const newAttempts = session.sqAttempts + 1;
    const remaining = MAX_SQ_ATTEMPTS - newAttempts;

    if (newAttempts >= MAX_SQ_ATTEMPTS) {
      await db.update(accountRecoverySessionsTable)
        .set({ sqAttempts: newAttempts, lockedUntil: new Date(Date.now() + SQ_LOCK_MS) })
        .where(eq(accountRecoverySessionsTable.id, session.id));
      await logAction(session.userId, ip, ua, "recovery-sq-failed");
      res.status(429).json({ error: "Twòp eseye. Kont bloke pou 1 èdtan.", remaining: 0, locked: true });
      return;
    }

    await db.update(accountRecoverySessionsTable)
      .set({ sqAttempts: newAttempts })
      .where(eq(accountRecoverySessionsTable.id, session.id));
    res.status(400).json({ error: `Repons pa kòrèk. ${remaining} eseye rete.`, remaining });
    return;
  }

  // Correct — advance session
  await db.update(accountRecoverySessionsTable)
    .set({ step: "sq_verified" })
    .where(eq(accountRecoverySessionsTable.id, session.id));

  await logAction(session.userId, ip, ua, "recovery-sq-verified");
  logger.info({ userId: session.userId }, "Security questions verified for recovery");

  res.json({ verified: true });
});

// ── POST /api/recovery/reset-password ────────────────────────────────────────
router.post("/recovery/reset-password", async (req, res): Promise<void> => {
  const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken.trim() : null;
  const password = typeof req.body?.password === "string" ? req.body.password.trim() : null;

  if (!sessionToken || !password) {
    res.status(400).json({ error: "sessionToken ak nouvo modpas obligatwa" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Modpas dwe gen omwen 6 karaktè" });
    return;
  }

  const ip = getClientIp(req);
  const ua = req.headers["user-agent"];
  const now = new Date();

  const [session] = await db.select().from(accountRecoverySessionsTable)
    .where(eq(accountRecoverySessionsTable.sessionToken, sessionToken));

  if (!session) {
    res.status(404).json({ error: "Sesyon pa valid. Kòmanse ankò." });
    return;
  }
  if (new Date(session.expiresAt) < now) {
    res.status(400).json({ error: "Sesyon ekspire. Kòmanse ankò.", expired: true });
    return;
  }
  if (!["otp_verified", "sq_verified"].includes(session.step)) {
    res.status(403).json({ error: "Sesyon pa verifye. Tcheke idantite ou anvan." });
    return;
  }

  const passwordHash = hashPassword(password);
  await db.update(usersTable)
    .set({ passwordHash, tokenInvalidatedAt: new Date() })
    .where(eq(usersTable.id, session.userId));

  // Mark session completed
  await db.update(accountRecoverySessionsTable)
    .set({ step: "completed" })
    .where(eq(accountRecoverySessionsTable.id, session.id));

  await logAction(session.userId, ip, ua, "recovery-password-reset");
  logger.info({ userId: session.userId }, "Password reset via recovery flow");

  res.json({ success: true, message: "Modpas chanje avèk siksè. Ou ka konekte kounye a." });
});

// ── POST /api/recovery/setup-questions (auth required) ───────────────────────
router.post("/recovery/setup-questions", requireAuth, async (req, res): Promise<void> => {
  const questions: unknown = req.body?.questions;

  if (!Array.isArray(questions) || questions.length !== 2) {
    res.status(400).json({ error: "Ou bezwen bay egzakteman 2 kesyon sekirite" });
    return;
  }

  for (const q of questions as Array<{ key: string; answer: string }>) {
    if (!q.key || !SECURITY_QUESTIONS[q.key]) {
      res.status(400).json({ error: `Kesyon pa valid: ${q.key}` });
      return;
    }
    if (!q.answer || q.answer.trim().length < 2) {
      res.status(400).json({ error: "Chak repons dwe gen omwen 2 karaktè" });
      return;
    }
    if (q.answer.trim().length > 100) {
      res.status(400).json({ error: "Repons pa dwe depase 100 karaktè" });
      return;
    }
  }

  // Delete existing questions for this user, then insert new ones
  await db.delete(securityQuestionsTable)
    .where(eq(securityQuestionsTable.userId, req.userId!));

  for (const q of questions as Array<{ key: string; answer: string }>) {
    const answerHash = await bcrypt.hash(q.answer.trim().toLowerCase(), BCRYPT_ROUNDS);
    await db.insert(securityQuestionsTable).values({
      userId: req.userId!,
      questionKey: q.key,
      answerHash,
    });
  }

  logger.info({ userId: req.userId }, "Security questions saved");
  res.json({ success: true, message: "Kesyon sekirite yo anrejistre avèk siksè." });
});

// ── GET /api/recovery/has-questions (auth required) ──────────────────────────
router.get("/recovery/has-questions", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({ key: securityQuestionsTable.questionKey })
    .from(securityQuestionsTable)
    .where(eq(securityQuestionsTable.userId, req.userId!));

  res.json({ hasQuestions: rows.length >= 2, count: rows.length });
});

// ── GET /api/recovery/questions-list ─────────────────────────────────────────
router.get("/recovery/questions-list", (_req, res): void => {
  res.json({ questions: Object.entries(SECURITY_QUESTIONS).map(([key, text]) => ({ key, text })) });
});

// ── GET /api/recovery/my-questions (auth required) — returns question keys only, no answers ──
router.get("/recovery/my-questions", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({ questionKey: securityQuestionsTable.questionKey })
    .from(securityQuestionsTable)
    .where(eq(securityQuestionsTable.userId, req.userId!));

  res.json({
    questions: rows.map(r => ({
      key: r.questionKey,
      text: SECURITY_QUESTIONS[r.questionKey] ?? r.questionKey,
    })),
  });
});

export default router;
