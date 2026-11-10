/**
 * Pure username helpers for Promotional Videos profile (no DB import).
 */

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function normalizeUsername(raw: string | null | undefined): string | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30);
  if (!s || !USERNAME_RE.test(s)) return null;
  return s;
}

/** Slug base from display name for auto-seeding handles. */
export function usernameBaseFromName(name: string | null | undefined): string {
  const raw = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  return raw.length >= 3 ? raw : `user${raw || "fm"}`;
}

export function isValidUsernameCandidate(raw: string): boolean {
  return normalizeUsername(raw) !== null;
}
