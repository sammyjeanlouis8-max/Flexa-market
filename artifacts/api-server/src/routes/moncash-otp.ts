/**
 * MonCash OTP flow — SMS-based payment confirmation.
 *
 * Instead of redirecting to MonCash's hosted page, this flow lets the
 * customer stay inside FLEXA MARKET:
 *
 *   1. POST /api/moncash/otp/send
 *        Customer submits their MonCash phone number and the boost order.
 *        Server texts a 6-digit OTP via Twilio.
 *        Response: { sent: true, expiresAt: ISO }
 *
 *   2. POST /api/moncash/otp/verify
 *        Customer submits the OTP they received.
 *        Server checks it, marks the boost as pending_review (admin still
 *        confirms receipt of the MonCash transfer), then returns success.
 *        Response: { verified: true }
 *
 * Security notes:
 *  - OTP is 6 digits, valid for 10 minutes, max 5 attempts per orderId.
 *  - OTPs are stored in memory (Map) — acceptable for a single-instance dev
 *    server. For multi-instance prod, move to Redis or a DB table.
 *  - The phone number is recorded as the paymentRef so the admin can verify
 *    the MonCash transfer in their merchant dashboard.
 */

import { Router, type IRouter } from "express";
import { db, boostsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── In-memory OTP store ────────────────────────────────────────────────────────

interface OtpEntry {
  code: string;
  phone: string;         // customer's MonCash number
  boostId: number;
  listingId: number;
  expiresAt: number;     // Unix ms
  attempts: number;
}

const OTP_STORE = new Map<string, OtpEntry>(); // key = `${boostId}_${listingId}`
const OTP_TTL_MS  = 10 * 60 * 1000;           // 10 min
const OTP_MAX_ATT = 5;

function oKey(boostId: number, listingId: number): string {
  return `${boostId}_${listingId}`;
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Periodic cleanup so the Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of OTP_STORE) {
    if (v.expiresAt < now) OTP_STORE.delete(k);
  }
}, 5 * 60 * 1000);

// ── POST /api/moncash/otp/send ────────────────────────────────────────────────

router.post("/moncash/otp/send", requireAuth, async (req, res): Promise<void> => {
  const boostId   = parseInt(String(req.body?.boostId   ?? ""), 10);
  const listingId = parseInt(String(req.body?.listingId ?? ""), 10);
  const phone     = String(req.body?.phone ?? "").trim();

  if (!boostId || !listingId) {
    res.status(400).json({ error: "boostId and listingId are required" });
    return;
  }
  if (!phone || phone.length < 8) {
    res.status(400).json({ error: "Nimewo MonCash ou pa valid" });
    return;
  }

  // Normalise: ensure country code present.
  const normalised = phone.startsWith("+") ? phone : `+509${phone.replace(/\D/g, "")}`;

  // Verify boost exists and belongs to the caller.
  const [boost] = await db
    .select()
    .from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId)));

  if (!boost) { res.status(404).json({ error: "Boost order not found" }); return; }

  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  if (boost.userId !== req.userId && !isAdmin) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (boost.paymentStatus !== "pending") {
    res.status(400).json({ error: "Boost is not in pending state" }); return;
  }

  // Rate-limit: don't send a new OTP if one is still valid and was sent < 60s ago.
  const existing = OTP_STORE.get(oKey(boostId, listingId));
  if (existing && existing.expiresAt > Date.now() && existing.expiresAt > Date.now() + OTP_TTL_MS - 60_000) {
    const secsLeft = Math.ceil((existing.expiresAt - Date.now()) / 1000);
    res.status(429).json({ error: `Tanpri tann ${secsLeft}s anvan voye yon lòt kòd` });
    return;
  }

  const code = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;

  OTP_STORE.set(oKey(boostId, listingId), {
    code, phone: normalised, boostId, listingId, expiresAt, attempts: 0,
  });

  const amount    = boost.price.toFixed(2);
  const userEmail = req.user!.email;
  const isDev     = process.env["NODE_ENV"] !== "production";

  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff;border-radius:12px">
    <h2 style="color:#f97316;margin:0 0 8px">FLEXA MARKET – MonCash</h2>
    <p style="color:#444;margin:0 0 4px">Kòd konfirmasyon peman boost ou ($${amount}):</p>
    <div style="background:#fff7ed;border:2px solid #f97316;border-radius:10px;padding:24px;text-align:center;margin:16px 0">
      <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#ea580c">${code}</span>
    </div>
    <p style="color:#666;font-size:14px;margin:0 0 8px">⏱ Kòd la ekspire nan <strong>10 minit</strong>.</p>
    <p style="color:#999;font-size:12px;margin:0">Pa pataje kòd sa a ak pèsonn.</p>
  </div>`;

  const emailSent = await sendEmail({
    to: userEmail,
    subject: "FLEXA MARKET – Kòd Konfirmasyon MonCash",
    text: `Kòd konfirmasyon peman boost ou ($${amount}) via MonCash: ${code}\nKòd la ekspire nan 10 minit. Pa pataje li ak pèsonn.`,
    html: emailHtml,
  });

  if (!emailSent) {
    if (isDev) {
      logger.warn("[moncash-otp] Email unavailable — returning devCode in dev mode");
      res.json({ sent: true, expiresAt: new Date(expiresAt).toISOString(), devCode: code });
      return;
    }
    OTP_STORE.delete(oKey(boostId, listingId));
    res.status(503).json({ error: "Email pa disponib kounye a. Eseye ankò." });
    return;
  }

  logger.info({ boostId, listingId, email: userEmail }, "[moncash-otp] OTP sent via email");
  res.json({ sent: true, expiresAt: new Date(expiresAt).toISOString() });
});

// ── POST /api/moncash/otp/verify ──────────────────────────────────────────────

router.post("/moncash/otp/verify", requireAuth, async (req, res): Promise<void> => {
  const boostId   = parseInt(String(req.body?.boostId   ?? ""), 10);
  const listingId = parseInt(String(req.body?.listingId ?? ""), 10);
  const inputCode = String(req.body?.code ?? "").trim();

  if (!boostId || !listingId || !inputCode) {
    res.status(400).json({ error: "boostId, listingId, and code are required" });
    return;
  }

  const entry = OTP_STORE.get(oKey(boostId, listingId));

  if (!entry) {
    res.status(400).json({ error: "Kòd la ekspire oswa pa t voye. Voye yon nouvo kòd." });
    return;
  }
  if (entry.expiresAt < Date.now()) {
    OTP_STORE.delete(oKey(boostId, listingId));
    res.status(400).json({ error: "Kòd la ekspire. Voye yon nouvo kòd." });
    return;
  }
  if (entry.attempts >= OTP_MAX_ATT) {
    OTP_STORE.delete(oKey(boostId, listingId));
    res.status(429).json({ error: "Twòp eseye. Voye yon nouvo kòd." });
    return;
  }

  entry.attempts += 1;

  if (inputCode !== entry.code) {
    const remaining = OTP_MAX_ATT - entry.attempts;
    res.status(400).json({
      error: `Kòd la pa kòrèk. ${remaining} eseye rete.`,
      remaining,
    });
    return;
  }

  // Code correct — clean up and move to pending_review.
  OTP_STORE.delete(oKey(boostId, listingId));

  // Verify the boost still belongs to the caller.
  const [boost] = await db
    .select()
    .from(boostsTable)
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.listingId, listingId)));

  if (!boost) { res.status(404).json({ error: "Boost order not found" }); return; }

  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  if (boost.userId !== req.userId && !isAdmin) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (boost.paymentStatus === "paid") {
    res.json({ verified: true, alreadyPaid: true }); return;
  }
  if (boost.paymentStatus === "pending_review") {
    res.json({ verified: true, pendingReview: true }); return;
  }
  if (boost.paymentStatus !== "pending") {
    res.status(400).json({ error: "Boost pa nan eta pending ankò" }); return;
  }

  // Record the customer's phone as the payment reference and move to pending_review.
  // Admin will cross-check the MonCash transfer in their merchant dashboard.
  await db
    .update(boostsTable)
    .set({ paymentStatus: "pending_review", paymentRef: `MONCASH-OTP:${entry.phone}` })
    .where(and(eq(boostsTable.id, boostId), eq(boostsTable.paymentStatus, "pending")));

  res.json({ verified: true, pendingReview: true });
});

export default router;
