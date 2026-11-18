import { getApiBase } from "./api";

export type SalesDashboard = {
  period?: string;
  timezone?: string;
  currency?: string;
  asOf?: string;
  cards?: {
    total?: { amount: number; orders: number; changePct: number | null };
    today?: { amount: number; orders: number; changePct: number | null };
    week?: { amount: number; orders: number; changePct: number | null };
    month?: { amount: number; orders: number; changePct: number | null };
    year?: { amount: number; orders: number; changePct: number | null };
  };
  series?: { key: string; label: string; amount: number; orders: number }[];
  topProducts?: {
    listingId: number;
    title: string;
    image: string | null;
    units: number;
    revenue: number;
  }[];
  recentSales?: {
    id: number;
    listingId: number | null;
    title: string | null;
    image: string | null;
    amount: number;
    currency: string;
    orderStatus: string;
    paymentStatus: string;
    createdAt: string;
    buyerName: string | null;
  }[];
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchSalesDashboard(
  opts: AuthOpts,
  params: { period?: string; timezone?: string } = {},
): Promise<SalesDashboard> {
  const q = new URLSearchParams();
  if (params.period) q.set("period", params.period);
  if (params.timezone) q.set("timezone", params.timezone);
  const qs = q.toString();
  const res = await fetch(`${getApiBase()}/sales/dashboard${qs ? `?${qs}` : ""}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Sales dashboard failed (${res.status})`);
  return data as SalesDashboard;
}
