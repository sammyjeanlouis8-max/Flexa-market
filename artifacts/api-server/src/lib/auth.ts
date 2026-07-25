import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set — refusing to start without it.");
}

const JWT_SECRET = process.env.SESSION_SECRET;
const BCRYPT_WORK_FACTOR = 12;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

function isSha256Hash(hash: string): boolean {
  return SHA256_HEX_RE.test(hash);
}

function sha256Hash(password: string): string {
  return crypto.createHash("sha256").update(password + JWT_SECRET).digest("hex");
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_WORK_FACTOR);
}

export function verifyPassword(password: string, hash: string): boolean {
  if (!hash || hash === "PHONE_ONLY_NO_PASSWORD" || hash.startsWith("!deleted!")) {
    return false;
  }
  if (isSha256Hash(hash)) {
    return sha256Hash(password) === hash;
  }
  return bcrypt.compareSync(password, hash);
}

export function isLegacySha256Hash(hash: string): boolean {
  return isSha256Hash(hash);
}

export function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "365d" });
}

export function verifyToken(token: string): { userId: number; iat: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; iat: number };
    return payload;
  } catch {
    return null;
  }
}

export function extractToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

export function generatePhoneToken(phone: string, country: string): string {
  return jwt.sign({ phone, country, type: "phone-verified" }, JWT_SECRET, { expiresIn: "30m" });
}

export function verifyPhoneToken(token: string): { phone: string; country: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { phone: string; country: string; type: string };
    if (payload.type !== "phone-verified") return null;
    return { phone: payload.phone, country: payload.country };
  } catch {
    return null;
  }
}

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
