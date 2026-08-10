import { useQuery } from "@tanstack/react-query";

const CURRENCY_MAP: Record<string, { symbol: string; code: string }> = {
  Haiti:                { symbol: "G ", code: "HTG" },
  USA:                  { symbol: "$",  code: "USD" },
  "Dominican Republic": { symbol: "RD", code: "DOP" },
  Canada:               { symbol: "CA$", code: "CAD" },
  Mexico:               { symbol: "MX$", code: "MXN" },
  Brazil:               { symbol: "R$",  code: "BRL" },
  Chile:                { symbol: "CL$", code: "CLP" },
};

export function getCurrencySymbol(country: string | null | undefined): string {
  if (!country) return "$";
  return CURRENCY_MAP[country]?.symbol ?? "$";
}

/** Currencies that display as whole numbers (no decimals). */
const WHOLE_NUMBER_CURRENCIES = new Set(["HTG", "DOP", "CLP", "MXN"]);

/** Explicit currency override takes priority over country-based lookup. */
export function getCurrencySymbolByCode(code: "USD" | "HTG" | "DOP" | string): string {
  if (code === "USD") return "$";
  if (code === "HTG") return "G ";
  if (code === "DOP") return "RD ";
  if (code === "CAD") return "CA$";
  if (code === "MXN") return "MX$";
  if (code === "BRL") return "R$";
  if (code === "CLP") return "CL$";
  return "$";
}

/**
 * Format a USD amount with consistent locale formatting.
 * Prefer this over `$${n.toFixed(2)}` so locale separators and
 * rounding are handled uniformly across the app.
 * e.g. formatUsd(1234.5) → "$1,234.50"
 */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPrice(
  price: number,
  country: string | null | undefined,
  currency?: "USD" | "HTG" | "DOP" | string | null,
): string {
  const sym = currency ? getCurrencySymbolByCode(currency) : getCurrencySymbol(country);
  const effectiveCurrency = currency ?? CURRENCY_MAP[country ?? ""]?.code;
  const isWhole = effectiveCurrency ? WHOLE_NUMBER_CURRENCIES.has(effectiveCurrency) : false;
  const formatted = isWhole
    ? Math.round(price).toLocaleString("en-US")
    : price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym}${formatted}`;
}

/** Countries that support multiple currencies when posting a listing. */
export const MULTI_CURRENCY_COUNTRIES: Record<string, { code: string; symbol: string; label: string }[]> = {
  Haiti: [
    { code: "USD", symbol: "$",  label: "$ USD" },
    { code: "HTG", symbol: "G",  label: "G HTG (Goud)" },
  ],
  "Dominican Republic": [
    { code: "USD", symbol: "$",   label: "$ USD" },
    { code: "DOP", symbol: "RD",  label: "RD DOP (Pèso)" },
  ],
  Canada: [
    { code: "USD", symbol: "$",   label: "$ USD" },
    { code: "CAD", symbol: "CA$", label: "CA$ CAD" },
  ],
  Mexico: [
    { code: "USD", symbol: "$",   label: "$ USD" },
    { code: "MXN", symbol: "MX$", label: "MX$ MXN" },
  ],
  Brazil: [
    { code: "USD", symbol: "$",   label: "$ USD" },
    { code: "BRL", symbol: "R$",  label: "R$ BRL" },
  ],
  Chile: [
    { code: "USD", symbol: "$",   label: "$ USD" },
    { code: "CLP", symbol: "CL$", label: "CL$ CLP" },
  ],
};

/**
 * Approximate USD → HTG exchange rate (static fallback).
 * The live rate is fetched from the API via useExchangeRate().
 */
export const USD_TO_HTG = 130;

/**
 * Approximate DOP → USD rate (static fallback: 1 USD ≈ 59 DOP).
 * Used when no live rate is available.
 */
export const DOP_TO_USD_RATE = 59;

export function dopToUsd(dopAmount: number, rate = DOP_TO_USD_RATE): number {
  if (rate <= 0) return parseFloat((dopAmount / 59).toFixed(2));
  return parseFloat((dopAmount / rate).toFixed(2));
}

export function formatHTG(usdAmount: number): string {
  const gourdes = Math.round(usdAmount * USD_TO_HTG);
  return `G ${gourdes.toLocaleString("en-US")}`;
}

// ─── Exchange rate (live from platform) ────────────────────────────────────

export type ExchangeRateInfo = {
  rate: number;
  spread: number;
  displayRate: number;
  dopRate: number;
};

async function fetchExchangeRate(): Promise<ExchangeRateInfo> {
  const res = await fetch("/api/exchange-rate");
  if (!res.ok) return { rate: 130, spread: 2, displayRate: 132, dopRate: 59 };
  const data = await res.json();
  return {
    rate:        data.rate        ?? data.htg?.rate        ?? 130,
    spread:      data.spread      ?? data.htg?.spread      ?? 2,
    displayRate: data.displayRate ?? data.htg?.displayRate ?? 132,
    dopRate:     data.dopRate     ?? data.dop?.rate        ?? 59,
  };
}

/**
 * Hook: returns the live platform exchange rates with spread.
 * displayRate = HTG rate + spread — use this for HTG price conversions.
 * dopRate = DOP per USD — use this for DOP price conversions.
 * Cached for 5 minutes.
 */
export function useExchangeRate(): { data: ExchangeRateInfo | undefined; isLoading: boolean } {
  return useQuery({
    queryKey: ["exchange-rate"],
    queryFn: fetchExchangeRate,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function htgToUsd(htgAmount: number, displayRate: number): number {
  if (displayRate <= 0) return parseFloat((htgAmount / 132).toFixed(2));
  return parseFloat((htgAmount / displayRate).toFixed(2));
}

export function formatUsdFromHtg(htgAmount: number, displayRate: number): string {
  const usd = htgToUsd(htgAmount, displayRate);
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Convert any listing currency amount to USD using live platform rates.
 * Returns null if rates are not yet loaded.
 */
export function convertToUsd(
  amount: number,
  currency: string | null | undefined,
  rates: ExchangeRateInfo | undefined,
): number | null {
  if (!rates) return null;
  const c = currency ?? "USD";
  if (c === "USD") return amount;
  if (c === "HTG") return htgToUsd(amount, rates.displayRate);
  if (c === "DOP") return dopToUsd(amount, rates.dopRate);
  return null;
}
