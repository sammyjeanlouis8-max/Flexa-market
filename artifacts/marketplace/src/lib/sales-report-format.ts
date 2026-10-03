export function isMinor(v: unknown): v is string {
  return typeof v === "string" && /^-?\d+$/.test(v);
}

/** Exact minor-unit formatting with BigInt only; never uses Number/float. */
export function formatMinor(v: string | null | undefined, exponent: number, currency: string, locale = "en"): string | null {
  if (!isMinor(v) || !Number.isInteger(exponent) || exponent < 0 || exponent > 4) return null;
  const big = BigInt(v);
  const neg = big < 0n;
  const abs = (neg ? -big : big).toString();
  const exp = Math.max(0, Math.floor(exponent));
  const padded = abs.padStart(exp + 1, "0");
  const int = exp ? padded.slice(0, -exp) : padded;
  const frac = exp ? padded.slice(-exp) : "";
  const numberLocale = locale.startsWith("ht") ? "fr-HT" : locale;
  const grouped = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(BigInt(int));
  const decimal = new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 1 })
    .formatToParts(0).find(part => part.type === "decimal")?.value ?? ".";
  return `${neg ? "\u2212" : ""}${grouped}${frac ? decimal + frac : ""} ${currency}`;
}

/** Adds exact BigInt values only if both are known. */
export function addKnown(a: string | null, b: string | null): string | null {
  if (!isMinor(a) || !isMinor(b)) return null;
  return (BigInt(a) + BigInt(b)).toString();
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function currentMonthIn(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const y = parts.find(p => p.type === "year")?.value;
    const m = parts.find(p => p.type === "month")?.value;
    if (y && m) return `${y}-${m}`;
  } catch { /* fall through */ }
  return new Date().toISOString().slice(0, 7);
}

export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return month;
  }
}

export function formatDate(iso: string | null | undefined, tz: string, locale: string, withTime = false): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: tz, day: "numeric", month: "short", year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export const PAYOUT_STATUSES = ["pending", "processing", "transferred", "failed", "returned", "not_applicable", "verification_required"] as const;
export const ORDER_STATUSES = ["pending", "ready_to_ship", "confirmed", "processing", "shipped", "delivered", "completed", "cancelled", "failed", "returned", "return_refunded"] as const;
export const PAYMENT_STATUSES = ["pending", "paid", "completed", "failed", "refunded", "partially_refunded", "cancelled"] as const;
export const KNOWN_WARNINGS = ["missing_refund_evidence", "refund_currency_mismatch", "refund_exceeds_payment", "historical_amounts_inconsistent", "payout_evidence_missing", "payout_currency_unverified", "recovery_required"];
