export const FREE_SONG_LIMIT = 2;
export const ARTIST_PLAN_PRICE_USD = 50;
export const ARTIST_PLAN_PRICE_CENTS = ARTIST_PLAN_PRICE_USD * 100;
export const ARTIST_PLAN_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
export const POST_RECHARGE_MIN_BALANCE_USD = 1.5;

export interface ArtistPlanStateInput {
  subscriptionPlan: string | null | undefined;
  subscriptionExpiresAt: Date | string | null | undefined;
  songCount: number;
  now?: Date;
}

export interface ArtistPlanState {
  isArtistPlan: boolean;
  canUpload: boolean;
  songCount: number;
  freeSongLimit: number;
  expiresAt: string | null;
}

export function getArtistPlanState(input: ArtistPlanStateInput): ArtistPlanState {
  const now = input.now ?? new Date();
  const expiresAt = input.subscriptionExpiresAt
    ? new Date(input.subscriptionExpiresAt)
    : null;
  const expiryIsValid = expiresAt === null ||
    (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime());
  const isArtistPlan = input.subscriptionPlan === "artist" && expiryIsValid;
  const songCount = Math.max(0, Math.trunc(Number(input.songCount) || 0));

  return {
    isArtistPlan,
    canUpload: isArtistPlan || songCount < FREE_SONG_LIMIT,
    songCount,
    freeSongLimit: FREE_SONG_LIMIT,
    expiresAt: expiresAt && Number.isFinite(expiresAt.getTime())
      ? expiresAt.toISOString()
      : null,
  };
}

export function getNextArtistPlanExpiry(input: {
  subscriptionPlan: string | null | undefined;
  subscriptionExpiresAt: Date | string | null | undefined;
  now?: Date;
}): Date | null {
  const now = input.now ?? new Date();
  if (input.subscriptionPlan === "artist" && input.subscriptionExpiresAt === null) {
    return null;
  }
  const currentExpiry = input.subscriptionExpiresAt
    ? new Date(input.subscriptionExpiresAt)
    : null;
  const baseMs = input.subscriptionPlan === "artist" &&
    currentExpiry &&
    Number.isFinite(currentExpiry.getTime()) &&
    currentExpiry.getTime() > now.getTime()
    ? currentExpiry.getTime()
    : now.getTime();
  return new Date(baseMs + ARTIST_PLAN_DURATION_MS);
}

export type ArtistPlanWalletAllocation =
  | {
      ok: true;
      promoUsed: number;
      realUsed: number;
      promoAvailable: number;
      realAvailable: number;
    }
  | {
      ok: false;
      promoAvailable: number;
      realAvailable: number;
    };

export function allocateArtistPlanWallet(input: {
  promoBalance: number;
  balanceUsd: number;
  firstRechargeDone: boolean;
  priceUsd?: number;
}): ArtistPlanWalletAllocation {
  const priceUsd = input.priceUsd ?? ARTIST_PLAN_PRICE_USD;
  const reserve = input.firstRechargeDone ? POST_RECHARGE_MIN_BALANCE_USD : 0;
  const promoAvailable = Math.max(0, Number(input.promoBalance) || 0);
  const realAvailable = Math.max(0, (Number(input.balanceUsd) || 0) - reserve);

  if (promoAvailable + realAvailable < priceUsd - 0.001) {
    return { ok: false, promoAvailable, realAvailable };
  }

  const promoUsed = Math.min(promoAvailable, priceUsd);
  const realUsed = priceUsd - promoUsed;
  return {
    ok: true,
    promoUsed: Number(promoUsed.toFixed(4)),
    realUsed: Number(realUsed.toFixed(4)),
    promoAvailable,
    realAvailable,
  };
}