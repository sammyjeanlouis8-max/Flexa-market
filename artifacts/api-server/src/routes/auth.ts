import { Router, Request } from "express";
import { db, usersTable, loginLogsTable, referralsTable } from "@workspace/db";
import { eq, and, count, gte, sql } from "drizzle-orm";
import { RegisterBody, LoginBody, ChangeCountryBody } from "@workspace/api-zod";
import { hashPassword, verifyPassword, isLegacySha256Hash, generateToken, verifyPhoneToken } from "../lib/auth";
import { requireAuth } from "../middlewares/auth";
import { isOwnerEmail } from "../lib/superAdmins";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/email";
import { welcomeEmail } from "../lib/emailTemplates";

// ── Referral code generator ───────────────────────────────────────────────────
// Name-based: "Jean Pierre" → "JEAN" + 3 random digits → e.g. "JEAN247"
// Falls back to random FX code if name is missing or all attempts collide.
function makeNameBasedCode(name?: string): string {
  if (name) {
    // Remove accents, keep letters only, take first word (first name), uppercase, max 6 chars
    const base = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z\s]/g, "")
      .trim()
      .split(/\s+/)[0]
      .toUpperCase()
      .slice(0, 6);
    if (base.length >= 2) {
      const suffix = String(Math.floor(100 + Math.random() * 900)); // 3 digits
      return base + suffix;
    }
  }
  // Fallback: random FX code
  const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FX";
  for (let i = 0; i < 6; i++) code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  return code;
}

async function generateUniqueReferralCode(name?: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makeNameBasedCode(name);
    const [conflict] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.referralCode, code));
    if (!conflict) return code;
  }
  // Fallback: name prefix + timestamp suffix (collision-proof)
  const prefix = name
    ? name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4)
    : "FX";
  return (prefix || "FX") + Date.now().toString(36).toUpperCase().slice(-4);
}

const router = Router();

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","tempmail.com","throwaway.email","temp-mail.org",
  "sharklasers.com","guerrillamail.info","guerrillamail.biz","guerrillamail.de",
  "guerrillamail.net","guerrillamail.org","spam4.me","trashmail.com","trashmail.at",
  "trashmail.io","yopmail.com","yopmail.fr","fakeinbox.com","dispostable.com",
  "mailnull.com","mail-temporaire.fr","jetable.fr.nf","armyspy.com","cuvox.de",
  "dayrep.com","einrot.com","fleckens.hu","gustr.com","jourrapide.com","rhyta.com",
  "superrito.com","teleworm.us","getairmail.com","mailfreeonline.com","maildrop.cc",
  "spamgourmet.com","spamgourmet.net","spamgourmet.org","filzmail.com","throwam.com",
  "temp-mail.ru","emkei.cz","gishpuppy.com","10minutemail.com","10minutemail.net",
  "mailexpire.com","spambox.us","spambog.com","spambog.de","spambog.ru",
  "trashmail.me","getonemail.com","discard.email","spamfree24.org","mailnew.com",
  "0-mail.com","bobmail.info","dingbone.com","fudgerub.com","lookugly.com",
  "slippery.email","objectmail.com","obobbo.com","pookmail.com","sogetthis.com",
  "spamoff.de","uggsrock.com","wegwerfmail.de","wegwerfmail.net","wegwerfmail.org",
  "mailboxy.fun","tempinbox.com","burnermail.io","throwem.com","emailondeck.com",
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && DISPOSABLE_DOMAINS.has(domain);
}

function isProfileComplete(user: typeof usersTable.$inferSelect): boolean {
  return !!(user.name?.trim() && user.email?.trim());
}

function formatUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = user;
  return { ...rest, profileCompleted: isProfileComplete(user) };
}

async function logAction(userId: number, ip: string, userAgent: string | undefined, action: string) {
  try {
    await db.insert(loginLogsTable).values({ userId, ip, userAgent: userAgent ?? null, action });
  } catch {}
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.[0] as string | undefined;
    const FIELD_LABELS: Record<string, string> = {
      name: "Full name",
      email: "Email",
      password: "Password",
      phone: "Phone number",
      country: "Country",
    };
    const label = field ? (FIELD_LABELS[field] ?? field) : null;
    const message = label
      ? `${label} is required or invalid`
      : (issue?.message ?? "Invalid request");
    res.status(400).json({ error: message, field });
    return;
  }

  let { name, email, password, phone, country, location, bio, avatar } = parsed.data;
  email = email.trim().toLowerCase();
  name = name.trim();
  password = password.trim();
  // Normalise phone only if provided — phone is optional at registration
  const normPhone: string | null = phone?.trim()
    ? (() => {
        const raw = phone.trim().replace(/[\s\-().]/g, "");
        return raw.startsWith("+") ? raw : `+${raw}`;
      })()
    : null;

  const deviceId = (req.body.deviceId as string | undefined) ?? null;
  const rawPromoCode = typeof req.body.promoCode === "string" ? req.body.promoCode.trim().toUpperCase() : null;
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"];

  // ── Disposable email check ──
  if (isDisposableEmail(email)) {
    res.status(400).json({ error: "Temporary or disposable email addresses are not allowed. Please use a real email." });
    return;
  }

  // ── Email uniqueness ──
  const [existingEmail] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
  if (existingEmail) { res.status(409).json({ error: "An account with this email already exists.", field: "email" }); return; }

  // ── Phone uniqueness — only checked when phone is provided ──
  if (normPhone) {
    const [existingPhone] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, normPhone));
    if (existingPhone) { res.status(409).json({ error: "An account with this phone number already exists.", field: "phone" }); return; }
  }

  // ── IP security checks ──
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sameIpAccounts = ip !== "unknown"
    ? await db.select({ id: usersTable.id, name: usersTable.name, isBanned: usersTable.isBanned, isFlagged: usersTable.isFlagged })
        .from(usersTable).where(eq(usersTable.registrationIp, ip))
    : [];

  const bannedFromIp = sameIpAccounts.find(u => u.isBanned);
  if (bannedFromIp) {
    res.status(403).json({ error: "Registration is not allowed from this network. Contact support if you believe this is an error." });
    return;
  }

  const recentIpCount = ip !== "unknown"
    ? await db.select({ count: count() }).from(usersTable)
        .where(and(eq(usersTable.registrationIp, ip), gte(usersTable.createdAt, oneDayAgo)))
        .then(r => Number(r[0]?.count ?? 0))
    : 0;

  if (recentIpCount >= 5) {
    res.status(429).json({ error: "Too many accounts created from this network recently. Please try again later or contact support." });
    return;
  }

  // ── Device fingerprint check ──
  let isFlagged = false;
  const flagReasons: string[] = [];

  if (deviceId) {
    const [existingDevice] = await db
      .select({ id: usersTable.id, name: usersTable.name, isBanned: usersTable.isBanned })
      .from(usersTable).where(eq(usersTable.deviceId, deviceId));

    if (existingDevice?.isBanned) {
      res.status(403).json({ error: "Registration blocked. This device was associated with a banned account. Contact support." });
      return;
    }
    if (existingDevice) {
      isFlagged = true;
      flagReasons.push(`Device reused from account #${existingDevice.id} (${existingDevice.name})`);
    }
  }

  if (sameIpAccounts.length > 0) {
    isFlagged = true;
    const linkedIds = sameIpAccounts.map(u => `#${u.id}`).join(", ");
    flagReasons.push(`IP ${ip} shares ${sameIpAccounts.length} existing account(s): ${linkedIds}`);
  }

  const isOwner = isOwnerEmail(email);
  const passwordHash = hashPassword(password);

  // ── Promo code / referral lookup ──────────────────────────────────────────
  let referredByUserId: number | null = null;
  if (rawPromoCode) {
    if (/^FX[A-Z2-9]{6}$/.test(rawPromoCode)) {
      const [referrer] = await db
        .select({ id: usersTable.id, isBanned: usersTable.isBanned })
        .from(usersTable)
        .where(eq(usersTable.referralCode, rawPromoCode));
      if (referrer && !referrer.isBanned) {
        referredByUserId = referrer.id;
      } else if (!referrer) {
        res.status(400).json({ error: "Kod promo sa a pa valid. Tcheke li epi eseye ankò." });
        return;
      }
    } else {
      res.status(400).json({ error: "Format kod promo invalide (egzanp: FXAB2345)." });
      return;
    }
  }

  // ── Generate unique referral code for this new user (name-based) ─────────
  const referralCode = await generateUniqueReferralCode(name);

  const [user] = await db
    .insert(usersTable)
    .values({
      name, email, passwordHash,
      ...(normPhone ? { phone: normPhone } : {}),
      country: country ?? null,
      isPhoneVerified: false, isVerified: true,
      location: location ?? null, bio: bio ?? null, avatar: avatar ?? null,
      deviceId, registrationIp: ip,
      isFlagged, flagReason: flagReasons.length > 0 ? flagReasons.join("; ") : null,
      referralCode,
      referredByUserId,
      ...(isOwner ? { isAdmin: true, isSuperAdmin: true, role: "superadmin" } : {}),
    })
    .returning();

  await logAction(user.id, ip, ua, "register");

  // ── Award referral points to the referring merchant ─────────────────────
  if (referredByUserId && referredByUserId !== user.id) {
    void (async () => {
      try {
        // Fraud detection: flag if same IP or same device as referrer
        const [referrer] = await db
          .select({ registrationIp: usersTable.registrationIp, deviceId: usersTable.deviceId })
          .from(usersTable)
          .where(eq(usersTable.id, referredByUserId));

        const sameIp = referrer?.registrationIp && referrer.registrationIp === ip;
        const sameDevice = referrer?.deviceId && deviceId && referrer.deviceId === deviceId;
        const isSuspicious = Boolean(sameIp || sameDevice);
        const suspiciousReason = [
          sameIp ? "Same IP as referrer" : null,
          sameDevice ? "Same device as referrer" : null,
        ].filter(Boolean).join("; ");

        await db.insert(referralsTable).values({
          referrerId: referredByUserId,
          referredUserId: user.id,
          status: isSuspicious ? "flagged" : "verified",
          pointsAwarded: isSuspicious ? 0 : 10,
          isFlagged: isSuspicious,
          flagReason: isSuspicious ? suspiciousReason : null,
          ipAddress: ip ?? null,
          deviceId: deviceId ?? null,
        });

        if (!isSuspicious) {
          await db.update(usersTable).set({
            referralPoints: sql`${usersTable.referralPoints} + 10`,
            referralCount:  sql`${usersTable.referralCount} + 1`,
          }).where(eq(usersTable.id, referredByUserId));
        }

        logger.info({ newUserId: user.id, referredBy: referredByUserId, suspicious: isSuspicious }, "Referral recorded");
      } catch (err) {
        logger.error({ err }, "Failed to record referral");
      }
    })();
  }

  // Fire-and-forget welcome email
  void (async () => {
    const tpl = welcomeEmail(user.name);
    await sendEmail({ to: user.email, ...tpl });
  })();

  const token = generateToken(user.id);
  res.status(201).json({ user: formatUser(user), token, flagged: isFlagged, referralCode });
});

// First-time setup: create the very first super-admin when the database is empty.
// This endpoint is intentionally disabled once any user exists, so it cannot
// be used to create privileged accounts after the platform is already running.
router.post("/auth/setup", async (req, res): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;
  const password = typeof req.body?.password === "string" ? req.body.password.trim() : null;

  if (!name || !rawEmail || !password) {
    res.status(400).json({ error: "name, email, and password are required" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [{ count: userCount }] = await db.select({ count: count() }).from(usersTable);
  if (Number(userCount) > 0) {
    res.status(403).json({ error: "Setup is only available on a fresh installation. Users already exist." });
    return;
  }

  const passwordHash = hashPassword(password);
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"];

  const [user] = await db.insert(usersTable).values({
    name, email: rawEmail, passwordHash,
    isPhoneVerified: true, isVerified: true,
    isAdmin: true, isSuperAdmin: true, role: "superadmin",
    registrationIp: ip,
  }).returning();

  await logAction(user.id, ip, ua, "setup-admin");
  const token = generateToken(user.id);
  res.status(201).json({ user: formatUser(user), token });
});

router.post("/auth/change-country", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangeCountryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { phoneToken } = parsed.data;

  const phoneData = verifyPhoneToken(phoneToken);
  if (!phoneData) { res.status(400).json({ error: "Invalid or expired phone verification" }); return; }
  const { phone, country } = phoneData;

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!currentUser) { res.status(404).json({ error: "User not found" }); return; }

  if (currentUser.country && currentUser.countryChangedAt && !currentUser.isAdmin && !currentUser.isSuperAdmin) {
    const daysSinceChange = (Date.now() - new Date(currentUser.countryChangedAt).getTime()) / (1000 * 60 * 60 * 24);
    const daysRemaining = Math.ceil(30 - daysSinceChange);
    if (daysSinceChange < 30) {
      res.status(429).json({
        error: `Country can only be changed once every 30 days. You can change again in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
        daysRemaining,
      });
      return;
    }
  }

  const [existingPhone] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (existingPhone && existingPhone.id !== req.userId) {
    res.status(409).json({ error: "This phone number is already linked to another account" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ phone, country, isPhoneVerified: true, countryChangedAt: new Date() })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json(formatUser(user));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // Normalize before lookup — emails are case-insensitive and we strip
  // any surrounding whitespace from autofill / mobile keyboards. Without
  // this, a user who registered as "Alice@Example.com" or whose phone
  // pasted a trailing space would never be able to sign in.
  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password.trim();
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"];

  // Case-insensitive email lookup so legacy rows that were stored with
  // mixed case still match.
  const [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
  if (!user) {
    res.status(401).json({ error: "No account found with this email address", field: "email" });
    return;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Incorrect password", field: "password" });
    return;
  }
  if (user.isBanned) {
    res.status(403).json({ error: "Your account has been suspended. Contact support for help." });
    return;
  }

  await logAction(user.id, ip, ua, "login");

  // Fraud: assess login for ban-bypass attempts (fire-and-forget)
  const loginDeviceId = (req.body.deviceId as string | undefined) ?? null;
  void import("../lib/fraudEngine").then(({ assessLogin }) => {
    void assessLogin(user.id, ip, loginDeviceId);
  });

  // Transparent bcrypt migration: if the stored hash is still SHA-256,
  // re-hash with bcrypt now that we know the plaintext password is correct.
  // We also set requiresPasswordUpgrade so the client can prompt the user to
  // voluntarily choose a new password before any forced invalidation.
  const hadLegacyHash = isLegacySha256Hash(user.passwordHash);
  if (hadLegacyHash) {
    const newHash = hashPassword(password);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));
  }

  const token = generateToken(user.id);
  res.json({ user: formatUser(user), token, ...(hadLegacyHash ? { requiresPasswordUpgrade: true } : {}) });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ message: "Logged out" });
});

// POST /api/auth/login-temp
// Lets a user log in with an admin-generated temporary password.
// Accepts email OR phone number as the identifier (same lookup as /api/recovery/start).
router.post("/auth/login-temp", async (req, res): Promise<void> => {
  const identifier = typeof req.body?.identifier === "string" ? req.body.identifier.trim() : null;
  const password   = typeof req.body?.password   === "string" ? req.body.password.trim()   : null;
  if (!identifier || !password) {
    res.status(400).json({ error: "Identifier and password are required" });
    return;
  }

  const ip = getClientIp(req);
  const ua = req.headers["user-agent"];

  // Resolve identifier → user (email OR phone, mirrors /api/recovery/start logic)
  const isPhone = identifier.startsWith("+") || /^\d{8,15}$/.test(identifier.replace(/[\s\-()+]/g, ""));
  let user: typeof usersTable.$inferSelect | undefined;
  if (isPhone) {
    const normalized = identifier.replace(/[\s\-().]/g, "");
    const withPlus   = normalized.startsWith("+") ? normalized : `+${normalized}`;
    const [found] = await db.select().from(usersTable).where(eq(usersTable.phone, withPlus));
    user = found;
  } else {
    const emailLower = identifier.toLowerCase();
    const [found] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${emailLower}`);
    user = found;
  }

  if (!user) {
    res.status(401).json({ error: "No account found with this identifier", field: "identifier" });
    return;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Incorrect password", field: "password" });
    return;
  }
  if (user.isBanned) {
    res.status(403).json({ suspended: true, error: "Your account has been suspended. Contact support." });
    return;
  }

  // Mark account as requiring a password change
  await db.update(usersTable).set({ mustChangePassword: true } as any).where(eq(usersTable.id, user.id));

  await logAction(user.id, ip, ua, "login");
  const token = generateToken(user.id);
  res.json({ user: formatUser(user), token, mustChangePassword: true });
});

// POST /auth/set-new-password
// Called after a temp-password login to force the user to set a permanent password.
// Does NOT require currentPassword — the temp-login already verified identity.
// Requires JWT.
router.post("/auth/set-new-password", requireAuth, async (req, res): Promise<void> => {
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword.trim() : null;
  if (!newPassword) { res.status(400).json({ error: "newPassword is required" }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: "Modpas la dwe gen omwen 6 karaktè" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!(user as any).mustChangePassword) {
    res.status(403).json({ error: "No temporary password active for this account" });
    return;
  }

  const passwordHash = hashPassword(newPassword);
  const tokenInvalidatedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const [updated] = await db.update(usersTable)
    .set({ passwordHash, tokenInvalidatedAt, mustChangePassword: false } as any)
    .where(eq(usersTable.id, user.id))
    .returning();

  await logAction(user.id, getClientIp(req), req.headers["user-agent"], "set-new-password");
  const token = generateToken(user.id);
  res.json({ message: "Modpas mete ajou avèk siksè", user: formatUser(updated), token });
});

// Password reset via email: user enters their email and new password.
// Requires knowing the account's email — for stronger security, an
// email-link or admin-assisted flow should be added in the future.
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;
  const password = typeof req.body?.password === "string" ? req.body.password.trim() : null;
  if (!email || !password) { res.status(400).json({ error: "email and password are required" }); return; }
  if (password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

  const [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
  if (!user) { res.status(404).json({ error: "No account found with this email address" }); return; }
  if (user.isBanned) { res.status(403).json({ error: "Your account has been suspended. Contact support for help." }); return; }

  const passwordHash = hashPassword(password);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));
  await logAction(user.id, getClientIp(req), req.headers["user-agent"], "password-reset");

  const token = generateToken(user.id);
  const [refreshed] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  res.json({ user: formatUser(refreshed), token });
});

/**
 * Change email for an authenticated user. Requires current password as a
 * second factor so that an attacker who hijacks an active session cannot
 * silently swap the recovery email out from under the real owner. The
 * new email must be valid, non-disposable, and unique across the table.
 */
router.post("/auth/change-email", requireAuth, async (req, res): Promise<void> => {
  const password = typeof req.body?.password === "string" ? req.body.password : null;
  const rawEmail = typeof req.body?.newEmail === "string" ? req.body.newEmail.trim().toLowerCase() : null;
  if (!password || !rawEmail) { res.status(400).json({ error: "password and newEmail are required" }); return; }
  // Lightweight RFC-5322-ish check; we don't try to match the full grammar.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) { res.status(400).json({ error: "Invalid email address" }); return; }
  if (isDisposableEmail(rawEmail)) { res.status(400).json({ error: "Disposable email addresses are not allowed" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (rawEmail === user.email) { res.status(400).json({ error: "New email must be different from the current one" }); return; }
  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Password is incorrect" });
    return;
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, rawEmail));
  if (existing && existing.id !== user.id) { res.status(409).json({ error: "This email is already in use" }); return; }

  // The check-then-update above is racy: a concurrent request from another
  // user could insert the same email between the SELECT and the UPDATE. The
  // unique index on `email` will reject the second writer with a Postgres
  // 23505 violation; map that to a deterministic 409 instead of a 500.
  let updatedUser: typeof usersTable.$inferSelect;
  try {
    const [result] = await db
      .update(usersTable)
      .set({ email: rawEmail, tokenInvalidatedAt: new Date(Math.floor(Date.now() / 1000) * 1000) })
      .where(eq(usersTable.id, user.id))
      .returning();
    updatedUser = result;
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "23505") { res.status(409).json({ error: "This email is already in use" }); return; }
    throw err;
  }
  await logAction(user.id, getClientIp(req), req.headers["user-agent"], "email-change");
  const token = generateToken(user.id);
  res.json({ message: "Email updated successfully", user: formatUser(updatedUser), token });
});

// Change password for an authenticated user — requires current password.
router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword.trim() : null;
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword.trim() : null;
  if (!currentPassword || !newPassword) { res.status(400).json({ error: "currentPassword and newPassword are required" }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: "New password must be at least 6 characters" }); return; }
  if (currentPassword === newPassword) { res.status(400).json({ error: "New password must be different from the current one" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = hashPassword(newPassword);
  // Truncate to the current second boundary so that the new token (whose iat
  // is in whole seconds) satisfies iat * 1000 >= tokenInvalidatedAt, while
  // all older tokens (issued in prior seconds) are still rejected.
  const tokenInvalidatedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash, tokenInvalidatedAt })
    .where(eq(usersTable.id, user.id))
    .returning();
  await logAction(user.id, getClientIp(req), req.headers["user-agent"], "password-change");
  const token = generateToken(user.id);
  res.json({ message: "Password updated successfully", user: formatUser(updated), token });
});

const IP_COUNTRY_MAP: Record<string, string> = {
  "Haiti": "Haiti",
  "United States": "USA",
  "Dominican Republic": "Dominican Republic",
  "Canada": "Canada",
  "Mexico": "Mexico",
  "Brazil": "Brazil",
  "Chile": "Chile",
};
const SUPPORTED_COUNTRIES = new Set(Object.values(IP_COUNTRY_MAP));

router.get("/auth/detect-country", async (req, res): Promise<void> => {
  const ip = getClientIp(req);
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip.startsWith("::1") || ip.startsWith("10.") || ip.startsWith("172.") || ip.startsWith("192.168.")) {
    res.json({ country: null, detected: false, reason: "private_ip" });
    return;
  }
  try {
    const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,proxy,hosting`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) { res.json({ country: null, detected: false, reason: "api_error" }); return; }
    const data = await response.json() as any;
    if (data.status !== "success") { res.json({ country: null, detected: false, reason: "lookup_failed" }); return; }
    const mappedCountry = IP_COUNTRY_MAP[data.country] ?? null;
    const isVpnOrProxy = !!(data.proxy || data.hosting);
    res.json({
      country: SUPPORTED_COUNTRIES.has(mappedCountry ?? "") ? mappedCountry : null,
      detectedCountry: data.country,
      detected: true,
      isVpnOrProxy,
    });
  } catch {
    res.json({ country: null, detected: false, reason: "timeout" });
  }
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json(formatUser(req.user!));
});

/** PATCH /api/auth/theme — save the user's preferred theme (light/dark) to their profile */
router.patch("/auth/theme", requireAuth, async (req, res): Promise<void> => {
  const theme = req.body?.theme;
  if (!theme || !["light", "dark"].includes(theme)) {
    res.status(400).json({ error: "Invalid theme. Must be light or dark." });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ preferredTheme: theme })
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json(formatUser(updated));
});

/** PATCH /api/auth/language — save the user's preferred language to their profile */
router.patch("/auth/language", requireAuth, async (req, res): Promise<void> => {
  const lang = req.body?.language;
  const allowed = ["en", "fr", "ht"];
  if (!lang || !allowed.includes(lang)) {
    res.status(400).json({ error: "Invalid language. Must be en, fr, or ht." });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ preferredLanguage: lang })
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json(formatUser(updated));
});

/** POST /api/auth/refresh — silently exchange a still-valid token for a fresh 365-day one */
router.post("/auth/refresh", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.isBanned) {
    res.status(403).json({ error: "Account unavailable." });
    return;
  }
  const token = generateToken(userId);
  res.json({ token, user: formatUser(user) });
});

export default router;
