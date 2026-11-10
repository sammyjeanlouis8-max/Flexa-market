/**
 * Flexa Control Users search helpers.
 *
 * Admins / Super Admins may search by:
 * - full or partial name (case-insensitive)
 * - exact email (case-insensitive)
 * - full phone number (international dialing codes OK; spaces / () / - ignored)
 *
 * Pure helpers only — SQL assembly lives in the admin route so unit tests do
 * not pull in the database package.
 */

/** Strip everything except digits so "+509 5555-1234" → "50955551234". */
export function phoneDigitsOnly(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** Escape `%` / `_` / `\` for safe ILIKE patterns. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function looksLikeEmailQuery(q: string): boolean {
  return q.includes("@");
}

/**
 * Pure matcher used by unit tests — mirrors SQL rules in the admin users list
 * handler (partial name OR exact email OR normalized full phone).
 */
export function matchesAdminUserSearch(
  user: { name?: string | null; email?: string | null; phone?: string | null },
  rawQuery: string,
): boolean {
  const q = rawQuery.trim();
  if (!q) return true;

  const name = (user.name ?? "").toLowerCase();
  if (name.includes(q.toLowerCase())) return true;

  const email = (user.email ?? "").trim().toLowerCase();
  if (email && email === q.toLowerCase()) return true;

  const queryDigits = phoneDigitsOnly(q);
  const phoneDigits = phoneDigitsOnly(user.phone);
  // Full phone only — require enough digits to be a real number (≥7).
  if (queryDigits.length >= 7 && phoneDigits.length > 0 && phoneDigits === queryDigits) {
    return true;
  }
  return false;
}

/** Parsed search tokens for building SQL in the admin route. */
export function parseAdminUserSearchQuery(rawQuery: string): {
  q: string;
  namePattern: string;
  emailExact: string;
  phoneDigits: string | null;
} | null {
  const q = rawQuery.trim();
  if (!q) return null;
  const digits = phoneDigitsOnly(q);
  return {
    q,
    namePattern: `%${escapeIlikePattern(q)}%`,
    emailExact: q.toLowerCase(),
    phoneDigits: digits.length >= 7 ? digits : null,
  };
}
