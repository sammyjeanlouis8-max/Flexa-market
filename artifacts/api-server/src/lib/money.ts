/** Converts a decimal USD input to cents without allowing floating-point rounding. */
export function usdToCents(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function transferFeeCents(amountCents: number): number {
  return Math.ceil(amountCents * 5 / 100);
}

export function centsToUsd(cents: number): number {
  return Number((cents / 100).toFixed(2));
}