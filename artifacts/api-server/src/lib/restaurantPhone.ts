/** Public business phone validation (never KYC / identity phones). */

export function normalizeDialablePhone(raw: string | null | undefined): string {
  const cleaned = String(raw || "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return `+${cleaned.slice(1).replace(/\D/g, "")}`;
  return cleaned.replace(/\D/g, "");
}

/** ITU E.164: 8–15 digits after stripping formatting. */
export function isValidBusinessPhone(raw: string | null | undefined): boolean {
  const n = normalizeDialablePhone(raw);
  if (!n) return false;
  const digits = n.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}
