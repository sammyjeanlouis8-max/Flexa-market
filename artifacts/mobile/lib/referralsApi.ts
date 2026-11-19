/**
 * Referrals — my-stats, leaderboard, wallet referral earnings (verified APIs only).
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type ReferralHistoryItem = {
  id: number;
  status?: string;
  pointsAwarded?: number;
  isFlagged?: boolean;
  flagReason?: string | null;
  createdAt?: string;
  referredName?: string | null;
};

export type ReferralStats = {
  referralLink: string;
  referralCode: string;
  referralPoints: number;
  referralCount: number;
  leaderboardRank: number | null;
  history: ReferralHistoryItem[];
};

export type LeaderboardEntry = {
  rank: number;
  id: number;
  name: string;
  avatar?: string | null;
  referralPoints: number;
  referralCount: number;
};

export type WalletReferral = {
  referralCode?: string;
  usedPromoCode?: string | null;
  totalReferred?: number;
  bonusesPaid?: number;
  pendingBonuses?: number;
  bonusPerReferral?: number;
  greenBalanceUsd?: number;
  promoBalance?: number;
  unlockedBalance?: number;
  pendingBalanceUsd?: number;
  totalEarnedUsd?: number;
};

export async function fetchReferralStats(opts: AuthOpts): Promise<ReferralStats> {
  const res = await fetch(`${getApiBase()}/referrals/my-stats`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Referral stats failed (${res.status})`);
  return {
    referralLink: String(data.referralLink ?? ""),
    referralCode: String(data.referralCode ?? ""),
    referralPoints: Number(data.referralPoints ?? 0),
    referralCount: Number(data.referralCount ?? 0),
    leaderboardRank: data.leaderboardRank != null ? Number(data.leaderboardRank) : null,
    history: Array.isArray(data.history) ? data.history : [],
  };
}

export async function fetchReferralLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${getApiBase()}/referrals/leaderboard`, {
    headers: { Accept: "application/json" },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Leaderboard failed (${res.status})`);
  const rows = Array.isArray(data.leaderboard) ? data.leaderboard : Array.isArray(data) ? data : [];
  return rows.map((r: any, i: number) => ({
    rank: Number(r.rank ?? i + 1),
    id: Number(r.id),
    name: String(r.name ?? "User"),
    avatar: r.avatar ?? null,
    referralPoints: Number(r.referralPoints ?? 0),
    referralCount: Number(r.referralCount ?? 0),
  }));
}

export async function fetchWalletReferral(opts: AuthOpts): Promise<WalletReferral> {
  const res = await fetch(`${getApiBase()}/wallet/referral`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Wallet referral failed (${res.status})`);
  return data;
}
