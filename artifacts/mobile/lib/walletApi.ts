/**
 * Wallet / Card FM — balance, history, referral, promo, platform revenue.
 * Top-up initiate / card session remain blocked on Android by server guard.
 */
import { getApiBase } from "./api";

export type WalletBalance = {
  balanceUsd: number;
  availableUsd: number;
  promoBalance: number;
  unlockedBalance: number;
  newUnlockableUsd: number;
  pendingBalanceUsd: number;
  balanceHtg?: number;
  balanceDop?: number;
  minReservedUsd?: number;
  accountNumber: string | null;
  rateHtgToUsd?: number;
  cashoutRateHtgToUsd?: number;
  rateDopToUsd?: number;
  bonusPct?: number;
  firstRechargeDone?: boolean;
  moncashPlatformNumber?: string | null;
};

export type WalletTx = {
  id: number;
  type: string;
  amountUsd: number;
  status: string | null;
  note: string | null;
  paymentRef: string | null;
  createdAt: string;
  toUserId?: number | null;
};

export type WalletReferral = {
  referralCode: string | null;
  usedPromoCode: boolean;
  totalReferred: number;
  bonusesPaid: number;
  pendingBonuses: number;
  bonusPerReferral: number;
  greenBalanceUsd: number;
  promoBalance: number;
  unlockedBalance: number;
};

export type PlatformRevenueSummary = {
  totalRevenue: number;
  boostRevenue: number;
  merchantCommission: number;
  rechargeFees: number;
  subscriptionRevenue: number;
  transferFees: number;
  p2pTransferFees: number;
  deliveryFees: number;
  orderCount?: number;
};

export type PlatformMonthStatement = {
  month: string;
  totalRevenue: number;
  boostRevenue: number;
  merchantCommission: number;
  rechargeFees: number;
  subscriptionRevenue: number;
  p2pTransferFees: number;
  deliveryFees: number;
  orderCount: number;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
    // Identify Android so server digital-purchase guard applies consistently.
    "User-Agent": "FlexaMarketAndroid/1.0.1",
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body,
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchWalletBalance(opts: AuthOpts): Promise<WalletBalance> {
  const res = await authed("/wallet/balance", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Wallet balance failed (${res.status})`);
  return {
    balanceUsd: Number(data.balanceUsd ?? 0),
    availableUsd: Number(data.availableUsd ?? data.balanceUsd ?? 0),
    promoBalance: Number(data.promoBalance ?? 0),
    unlockedBalance: Number(data.unlockedBalance ?? 0),
    newUnlockableUsd: Number(data.newUnlockableUsd ?? 0),
    pendingBalanceUsd: Number(data.pendingBalanceUsd ?? 0),
    balanceHtg: data.balanceHtg != null ? Number(data.balanceHtg) : undefined,
    balanceDop: data.balanceDop != null ? Number(data.balanceDop) : undefined,
    minReservedUsd: data.minReservedUsd != null ? Number(data.minReservedUsd) : undefined,
    accountNumber: data.accountNumber ?? null,
    rateHtgToUsd: data.rateHtgToUsd != null ? Number(data.rateHtgToUsd) : undefined,
    cashoutRateHtgToUsd:
      data.cashoutRateHtgToUsd != null ? Number(data.cashoutRateHtgToUsd) : undefined,
    rateDopToUsd: data.rateDopToUsd != null ? Number(data.rateDopToUsd) : undefined,
    bonusPct: data.bonusPct != null ? Number(data.bonusPct) : undefined,
    firstRechargeDone: Boolean(data.firstRechargeDone),
    moncashPlatformNumber: data.moncashPlatformNumber ?? null,
  };
}

export async function fetchWalletHistory(
  opts: AuthOpts,
  filter: "all" | "in" | "out" = "all",
  limit = 200,
): Promise<{ transactions: WalletTx[]; totalIn: number; totalOut: number }> {
  const res = await authed(`/wallet/history?filter=${filter}&limit=${limit}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Wallet history failed (${res.status})`);
  return {
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    totalIn: Number(data.totalIn ?? 0),
    totalOut: Number(data.totalOut ?? 0),
  };
}

export async function fetchWalletReferral(opts: AuthOpts): Promise<WalletReferral> {
  const res = await authed("/wallet/referral", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Referral failed (${res.status})`);
  return {
    referralCode: data.referralCode ?? null,
    usedPromoCode: Boolean(data.usedPromoCode),
    totalReferred: Number(data.totalReferred ?? 0),
    bonusesPaid: Number(data.bonusesPaid ?? 0),
    pendingBonuses: Number(data.pendingBonuses ?? 0),
    bonusPerReferral: Number(data.bonusPerReferral ?? 0.5),
    greenBalanceUsd: Number(data.greenBalanceUsd ?? 0),
    promoBalance: Number(data.promoBalance ?? 0),
    unlockedBalance: Number(data.unlockedBalance ?? 0),
  };
}

export async function unlockPromo(opts: AuthOpts): Promise<void> {
  const res = await authed("/wallet/promo/unlock", { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Unlock failed (${res.status})`);
}

export async function convertPromo(opts: AuthOpts): Promise<void> {
  const res = await authed("/wallet/promo/convert", { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Convert failed (${res.status})`);
}

export async function redeemWalletCard(opts: AuthOpts, code: string): Promise<void> {
  const res = await authed("/wallet/redeem-card", {
    ...opts,
    method: "POST",
    body: { code: code.trim() },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Redeem failed (${res.status})`);
}

export async function fetchPlatformRevenue(
  opts: AuthOpts,
): Promise<PlatformRevenueSummary | null> {
  const res = await authed("/admin/platform-revenue?period=all", opts);
  const data = await readJson(res);
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(data.error || `Platform revenue failed (${res.status})`);
  const s = data.summary ?? data;
  return {
    totalRevenue: Number(s.totalRevenue ?? 0),
    boostRevenue: Number(s.boostRevenue ?? 0),
    merchantCommission: Number(s.merchantCommission ?? 0),
    rechargeFees: Number(s.rechargeFees ?? 0),
    subscriptionRevenue: Number(s.subscriptionRevenue ?? 0),
    transferFees: Number(s.transferFees ?? 0),
    p2pTransferFees: Number(s.p2pTransferFees ?? 0),
    deliveryFees: Number(s.deliveryFees ?? 0),
    orderCount: s.orderCount != null ? Number(s.orderCount) : undefined,
  };
}

export async function fetchPlatformMonthly(
  opts: AuthOpts,
  year = new Date().getFullYear(),
): Promise<PlatformMonthStatement[]> {
  const res = await authed(`/admin/platform-revenue/monthly?year=${year}`, opts);
  const data = await readJson(res);
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) throw new Error(data.error || `Monthly statement failed (${res.status})`);
  return Array.isArray(data.months) ? data.months : [];
}

export function moneyUsd(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "$0.00";
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Match web HTG formatting: spaces as thousands separators. */
export function formatLocalCurrency(
  amount: number | null | undefined,
  kind: "HTG" | "DOP",
): string {
  const v = Math.round(Number(amount ?? 0));
  const spaced = v.toLocaleString("en-US").replace(/,/g, " ");
  if (kind === "DOP") return `RD$ ${spaced} DOP`;
  return `G ${spaced} HTG`;
}

export function walletTxLabel(type: string | null | undefined): string {
  switch (type) {
    case "purchase_debit":
      return "Purchase";
    case "promo_unlock":
      return "Promo unlock";
    case "transfer_debit":
    case "transfer_sent":
      return "Transfer sent";
    case "transfer_credit":
    case "transfer_received":
      return "Transfer received";
    case "topup":
    case "recharge":
      return "Top-up";
    case "refund":
      return "Refund";
    case "boost_debit":
      return "Boost";
    case "cashout":
      return "Cash out";
    case "vendor_subscription":
      return "vendor_subscription";
    case "referral_commission_income":
      return "Referral bonus";
    default:
      return type?.replace(/_/g, " ") || "Transaction";
  }
}
