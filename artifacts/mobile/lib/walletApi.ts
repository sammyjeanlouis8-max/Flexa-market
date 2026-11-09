/**
 * Wallet / Card FM — balance + history (read paths).
 * Top-up initiate / card session remain blocked on Android by server guard.
 */
import { getApiBase } from "./api";

export type WalletBalance = {
  balanceUsd: number;
  availableUsd: number;
  promoBalance: number;
  pendingBalanceUsd: number;
  accountNumber: string | null;
  rateHtgToUsd?: number;
  rateDopToUsd?: number;
  firstRechargeDone?: boolean;
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

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(path: string, opts: AuthOpts): Promise<Response> {
  return fetch(`${getApiBase()}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
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
    pendingBalanceUsd: Number(data.pendingBalanceUsd ?? 0),
    accountNumber: data.accountNumber ?? null,
    rateHtgToUsd: data.rateHtgToUsd != null ? Number(data.rateHtgToUsd) : undefined,
    rateDopToUsd: data.rateDopToUsd != null ? Number(data.rateDopToUsd) : undefined,
    firstRechargeDone: Boolean(data.firstRechargeDone),
  };
}

export async function fetchWalletHistory(
  opts: AuthOpts,
  filter: "all" | "in" | "out" = "all",
): Promise<{ transactions: WalletTx[]; totalIn: number; totalOut: number }> {
  const res = await authed(`/wallet/history?filter=${filter}&limit=200`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Wallet history failed (${res.status})`);
  return {
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    totalIn: Number(data.totalIn ?? 0),
    totalOut: Number(data.totalOut ?? 0),
  };
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
    default:
      return type?.replace(/_/g, " ") || "Transaction";
  }
}
