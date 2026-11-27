/**
 * Integer minor-unit helpers for Flexa Restaurant.
 * Avoid floating-point for stored totals; convert only at display edges.
 */

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Number of decimal places for a currency (Stripe-compatible). */
export function currencyDecimals(currency: string): number {
  const c = String(currency || "USD").trim().toLowerCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  return 2;
}

export function toMinorUnits(amount: number, currency = "USD"): number {
  if (!Number.isFinite(amount)) return 0;
  const d = currencyDecimals(currency);
  const factor = 10 ** d;
  return Math.round(amount * factor);
}

export function fromMinorUnits(minor: number, currency = "USD"): number {
  if (!Number.isFinite(minor)) return 0;
  const d = currencyDecimals(currency);
  const factor = 10 ** d;
  return minor / factor;
}

export function formatMinorUnits(minor: number, currency = "USD"): string {
  const major = fromMinorUnits(minor, currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: currencyDecimals(currency),
    }).format(major);
  } catch {
    return `${major.toFixed(currencyDecimals(currency))} ${currency.toUpperCase()}`;
  }
}
