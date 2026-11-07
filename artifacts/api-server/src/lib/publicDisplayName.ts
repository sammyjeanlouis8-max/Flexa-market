/**
 * Public-facing user label for chats, push, and notifications.
 * Never expose internal admin/system identifiers (e.g. ADM-0001) as a username.
 */
const INTERNAL_ID_RE = /^(ADM|USER|UID|ID|ACCT)-\d+$/i;

export function publicDisplayName(
  name: string | null | undefined,
  fallback = "User",
): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;
  if (INTERNAL_ID_RE.test(trimmed)) return fallback;
  if (/^\d+$/.test(trimmed)) return fallback;
  return trimmed;
}
