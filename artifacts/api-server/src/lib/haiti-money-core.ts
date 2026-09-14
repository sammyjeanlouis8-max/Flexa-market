export type HaitiMoneyProvider = "moncash" | "natcash";
export type QuoteDirection = "topup" | "cashout";

export interface HaitiQuote {
  amountHtg: number;
  amountUsd: number;
  rateUsed: number;
  direction: QuoteDirection;
  provider: HaitiMoneyProvider;
  feeUsd?: number;
  netAmountUsd?: number;
  bonusUsd?: number;
  creditAmountUsd?: number;
}

export function monCashReady(config: { enabled: boolean; clientId: string; clientSecret: string }): boolean {
  return config.enabled && !!config.clientId && !!config.clientSecret;
}

/** There is intentionally no NatCash adapter yet. */
export function natCashReady(_config: unknown): false {
  return false;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Money value must be finite");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parsePositiveMoney(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return roundMoney(parsed);
}

export function makeHaitiQuote(input: {
  direction: QuoteDirection;
  provider: HaitiMoneyProvider;
  amountHtg?: number;
  amountUsd?: number;
  rateUsed: number;
  bonusPct?: number;
  feePct?: number;
}): HaitiQuote {
  if (!Number.isFinite(input.rateUsed) || input.rateUsed <= 0) {
    throw new Error("Exchange rate must be finite and positive");
  }
  const rateUsed = roundMoney(input.rateUsed);
  const feePct = input.feePct ?? 0;

  if (input.direction === "topup") {
    const amountHtg = parsePositiveMoney(input.amountHtg);
    if (amountHtg === null) throw new Error("amountHtg must be finite and positive");
    const amountUsd = roundMoney(amountHtg / rateUsed);
    const bonusUsd = roundMoney(amountUsd * ((input.bonusPct ?? 0) / 100));
    const creditAmountUsd = roundMoney(amountUsd + bonusUsd);
    const feeUsd = roundMoney(creditAmountUsd * feePct);
    return {
      amountHtg,
      amountUsd,
      rateUsed,
      direction: input.direction,
      provider: input.provider,
      bonusUsd,
      creditAmountUsd,
      feeUsd,
      netAmountUsd: roundMoney(creditAmountUsd - feeUsd),
    };
  }

  const amountUsd = parsePositiveMoney(input.amountUsd);
  if (amountUsd === null) throw new Error("amountUsd must be finite and positive");
  const feeUsd = roundMoney(amountUsd * feePct);
  const netAmountUsd = roundMoney(amountUsd - feeUsd);
  return {
    amountHtg: roundMoney(netAmountUsd * rateUsed),
    amountUsd,
    rateUsed,
    direction: input.direction,
    provider: input.provider,
    feeUsd,
    netAmountUsd,
  };
}

export function isHaitiPhone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("509") ? digits.slice(3) : digits;
  return national.length === 8 && /^[234589]/.test(national);
}