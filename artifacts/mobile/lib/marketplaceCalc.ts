/**
 * Flexa Market fee helpers — mirrors documented marketplace rules.
 * Commission 7% platform / 93% seller. Delivery estimates are approximate.
 * Transfer fee uses live default 5% (cents ceil) to match server money.ts.
 */
export const PLATFORM_COMMISSION_RATE = 0.07;
export const SELLER_NET_RATE = 1 - PLATFORM_COMMISSION_RATE;
export const APPROX_USD_TO_HTG = 130;
export const TRANSFER_FEE_RATE = 0.05; // matches server default transfer_fee_pct

export function sellerNetFromPrice(priceUsd: number): {
  priceUsd: number;
  commissionUsd: number;
  sellerNetUsd: number;
} {
  const price = Math.max(0, Number(priceUsd) || 0);
  const commissionUsd = Math.round(price * PLATFORM_COMMISSION_RATE * 100) / 100;
  const sellerNetUsd = Math.round((price - commissionUsd) * 100) / 100;
  return { priceUsd: price, commissionUsd, sellerNetUsd };
}

export function transferFeeFromAmount(amountUsd: number): {
  amountUsd: number;
  feeUsd: number;
  netUsd: number;
} {
  const amount = Math.max(0, Number(amountUsd) || 0);
  const feeCents = Math.ceil(amount * TRANSFER_FEE_RATE * 100);
  const feeUsd = feeCents / 100;
  return {
    amountUsd: amount,
    feeUsd,
    netUsd: Math.round((amount - feeUsd) * 100) / 100,
  };
}

export type DeliveryVehicle = "moto" | "compact" | "suv";

const SAME_COMMUNE: Record<DeliveryVehicle, number> = {
  moto: 3,
  compact: 5,
  suv: 8,
};

/** Approximate delivery estimate — not a live quote API. */
export function estimateDeliveryUsd(opts: {
  sameCommune: boolean;
  vehicle: DeliveryVehicle;
  distanceKm?: number;
}): number {
  if (opts.sameCommune) return SAME_COMMUNE[opts.vehicle];
  const km = Math.max(0, Number(opts.distanceKm) || 0);
  return Math.max(3, Math.round(km * 2 * 100) / 100);
}

export function usdToHtg(usd: number): number {
  return Math.round(Math.max(0, usd) * APPROX_USD_TO_HTG * 100) / 100;
}

export function htgToUsd(htg: number): number {
  return Math.round((Math.max(0, htg) / APPROX_USD_TO_HTG) * 100) / 100;
}

/** Safe basic arithmetic evaluator (digits + + - * / . % and parentheses). */
export function evalBasicExpression(raw: string): number {
  const expr = raw.replace(/\s+/g, "").replace(/%/g, "/100");
  if (!/^[\d+\-*/().]+$/.test(expr)) throw new Error("Invalid expression");
  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${expr});`)();
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Invalid result");
  }
  return result;
}
