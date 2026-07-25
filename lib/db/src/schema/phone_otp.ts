import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

/**
 * Production-grade OTP sessions for phone verification.
 *
 * Security model:
 *  - OTP is stored HASHED (bcrypt) — plain code never persists.
 *  - 5-minute expiry; max 3 verification attempts per session.
 *  - Rate-limit window: max 3 send requests per phone per 2 minutes.
 *  - On successful verification: withdrawalToken issued (hex-256), row stays for audit.
 *  - Rows are soft-verified (verified=true) rather than deleted so audit trails are kept.
 */
export const phoneOtpSessionsTable = pgTable("phone_otp_sessions", {
  id: serial("id").primaryKey(),
  /** Normalised E.164 phone number */
  phone: text("phone").notNull(),
  /** bcrypt hash of the 6-digit OTP — never store plain text */
  hashedOtp: text("hashed_otp").notNull(),
  /** When the OTP expires (5 minutes from creation) */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** How many wrong guesses so far (max 3) */
  attempts: integer("attempts").notNull().default(0),
  /** Number of OTPs sent in the current rate-limit window */
  requestCount: integer("request_count").notNull().default(1),
  /** Start of the 2-minute rate-limit window */
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  /** Whether this OTP was successfully verified */
  verified: boolean("verified").notNull().default(false),
  /** 64-char hex token issued on successful verification — passed to cashout request */
  withdrawalToken: text("withdrawal_token").unique(),
  /** SMS delivery status */
  smsSent: boolean("sms_sent").notNull().default(false),
  /** WhatsApp delivery status */
  whatsappSent: boolean("whatsapp_sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PhoneOtpSession = typeof phoneOtpSessionsTable.$inferSelect;
