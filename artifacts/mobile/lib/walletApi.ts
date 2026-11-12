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

async function authedJson(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ res: Response; data: any }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  return { res, data: await readJson(res) };
}

export async function lookupWalletAccount(
  accountNumber: string,
  opts: AuthOpts,
): Promise<{ accountNumber: string; name: string }> {
  const { res, data } = await authedJson(
    `/wallet/lookup/${encodeURIComponent(accountNumber.trim())}`,
    opts,
  );
  if (!res.ok) throw new Error(data.error || `Lookup failed (${res.status})`);
  return {
    accountNumber: String(data.accountNumber ?? accountNumber),
    name: String(data.name ?? ""),
  };
}

export async function transferByAccount(
  input: { toAccountNumber: string; amountUsd: number },
  opts: AuthOpts,
): Promise<{
  ok: boolean;
  receiverName?: string;
  amountUsd?: number;
  feeUsd?: number;
  netAmountUsd?: number;
}> {
  const { res, data } = await authedJson("/wallet/transfer", {
    ...opts,
    method: "POST",
    body: {
      toAccountNumber: input.toAccountNumber.trim(),
      amountUsd: input.amountUsd,
    },
  });
  if (!res.ok) throw new Error(data.error || `Transfer failed (${res.status})`);
  return data;
}

export type P2pTransfer = {
  id: number;
  amountUsd?: number;
  feeUsd?: number;
  direction?: "sent" | "received" | string;
  counterpartyName?: string;
  status?: string;
  createdAt?: string;
  note?: string | null;
  [key: string]: unknown;
};

export async function fetchP2pHistory(opts: AuthOpts): Promise<P2pTransfer[]> {
  const { res, data } = await authedJson("/wallet/p2p/history", opts);
  if (!res.ok) throw new Error(data.error || `P2P history failed (${res.status})`);
  const rows = Array.isArray(data.transfers) ? data.transfers : Array.isArray(data) ? data : [];
  return rows;
}

export async function previewP2pTransfer(
  input: { toUserId: number; amountUsd: number },
  opts: AuthOpts,
): Promise<{
  canTransfer?: boolean;
  blockReason?: string | null;
  feeUsd?: number;
  netAmountUsd?: number;
  [key: string]: unknown;
}> {
  const { res, data } = await authedJson("/wallet/p2p/preview", {
    ...opts,
    method: "POST",
    body: input,
  });
  if (!res.ok) throw new Error(data.error || `Preview failed (${res.status})`);
  return data;
}

export async function executeP2pTransfer(
  input: { toUserId: number; amountUsd: number; note?: string },
  opts: AuthOpts,
): Promise<{ transfer?: P2pTransfer; success?: boolean }> {
  const key = `p2p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { res, data } = await authedJson("/wallet/p2p", {
    ...opts,
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: { ...input, idempotencyKey: key },
  });
  if (!res.ok) throw new Error(data.error || `P2P transfer failed (${res.status})`);
  return data;
}

export async function searchP2pUsers(
  q: string,
  opts: AuthOpts,
): Promise<Array<{ id: number; name: string; avatar?: string | null; country?: string }>> {
  const { res, data } = await authedJson(
    `/wallet/p2p/search?q=${encodeURIComponent(q.trim())}`,
    opts,
  );
  if (!res.ok) throw new Error(data.error || `Search failed (${res.status})`);
  return Array.isArray(data.users) ? data.users : [];
}
