import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const EXCHANGE_RATE_KEY  = "htg_to_usd_rate";
export const EXCHANGE_SPREAD_KEY = "exchange_spread";
export const DOP_RATE_KEY       = "dop_to_usd_rate";

export const DEFAULT_EXCHANGE_RATE = 130;
export const DEFAULT_SPREAD        = 2;
export const DEFAULT_DOP_RATE      = 59;

type CacheEntry = { value: number; at: number };
const cache: Record<string, CacheEntry | null> = {
  rate:   null,
  spread: null,
  dop:    null,
};
const CACHE_MS = 60_000;

async function readSetting(key: string, fallback: number, cacheKey: string): Promise<number> {
  const c = cache[cacheKey];
  if (c && Date.now() - c.at < CACHE_MS) return c.value;
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  const parsed = row ? parseFloat(row.value) : NaN;
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  cache[cacheKey] = { value, at: Date.now() };
  return value;
}

async function writeSetting(key: string, value: number, cacheKey: string): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Value must be a positive number");
  const str = String(value);
  const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  if (existing.length === 0) {
    await db.insert(platformSettingsTable).values({ key, value: str });
  } else {
    await db.update(platformSettingsTable).set({ value: str, updatedAt: new Date() }).where(eq(platformSettingsTable.key, key));
  }
  cache[cacheKey] = { value, at: Date.now() };
}

export const getExchangeRate = () => readSetting(EXCHANGE_RATE_KEY,  DEFAULT_EXCHANGE_RATE, "rate");
export const setExchangeRate = (rate: number) => writeSetting(EXCHANGE_RATE_KEY, rate, "rate");
export const getSpread       = () => readSetting(EXCHANGE_SPREAD_KEY, DEFAULT_SPREAD,        "spread");
export const setSpread       = (spread: number) => writeSetting(EXCHANGE_SPREAD_KEY, spread, "spread");
export const getDopRate      = () => readSetting(DOP_RATE_KEY,        DEFAULT_DOP_RATE,       "dop");
export const setDopRate      = (rate: number) => writeSetting(DOP_RATE_KEY, rate, "dop");

export function invalidateExchangeCache(): void {
  cache.rate   = null;
  cache.spread = null;
  cache.dop    = null;
}

export async function getDisplayRate(): Promise<{ rate: number; spread: number; displayRate: number }> {
  const [rate, spread] = await Promise.all([getExchangeRate(), getSpread()]);
  return { rate, spread, displayRate: rate + spread };
}

export async function getAllRates(): Promise<{
  htg: { rate: number; spread: number; displayRate: number };
  dop: { rate: number };
}> {
  const [rate, spread, dopRate] = await Promise.all([getExchangeRate(), getSpread(), getDopRate()]);
  return {
    htg: { rate, spread, displayRate: rate + spread },
    dop: { rate: dopRate },
  };
}

export function htgToUsd(htgAmount: number, displayRate: number): number {
  if (displayRate <= 0) return htgAmount / DEFAULT_EXCHANGE_RATE;
  return parseFloat((htgAmount / displayRate).toFixed(2));
}

export function usdToHtg(usdAmount: number, displayRate: number): number {
  return Math.round(usdAmount * displayRate);
}

export function dopToUsd(dopAmount: number, dopRate: number): number {
  if (dopRate <= 0) return parseFloat((dopAmount / DEFAULT_DOP_RATE).toFixed(2));
  return parseFloat((dopAmount / dopRate).toFixed(2));
}

/**
 * Convert any listing currency amount to USD.
 * Pass the live rates from getAllRates() for accuracy.
 */
export function convertToUsd(
  amount: number,
  currency: string,
  htgDisplayRate: number,
  dopRate: number,
): number {
  if (currency === "HTG") return htgToUsd(amount, htgDisplayRate);
  if (currency === "DOP") return dopToUsd(amount, dopRate);
  return amount;
}
