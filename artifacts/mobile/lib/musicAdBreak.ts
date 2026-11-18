/**
 * Flexa Music sponsored ad breaks — song counter, fetch, and history.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "./api";
import { absoluteMusicUrl } from "./musicApi";

export const SONGS_PER_AD = 10;

export const MUSIC_AD_COUNTER_KEY = "flexa_music_completed_songs_ad_counter";
export const MUSIC_AD_HISTORY_KEY = "flexa_music_sponsored_ad_history";
export const MUSIC_AD_UNSEEN_KEY = "flexa_music_sponsored_ad_unseen_count";

export type MusicSponsoredAdListing = {
  id: number;
  title: string;
  price?: number;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  sellerName: string | null;
  sellerId?: number | null;
  boostCtaType?: string | null;
  boostExternalLink?: string | null;
  boostWhatsappNumber?: string | null;
  boostCtaText?: string | null;
  status?: string | null;
  isVideoOnly?: boolean;
};

export type SponsoredAdHistoryEntry = {
  id: string;
  listingId: number;
  title: string;
  advertiser: string | null;
  videoUrl: string;
  thumbnail: string | null;
  productPath: string | null;
  heardAt: string;
  heardInBackground: boolean;
  durationMillis?: number;
};

function mediaOrigin(): string {
  return getApiBase().replace(/\/api\/?$/, "");
}

export function resolveSponsoredVideoUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const absolute = absoluteMusicUrl(raw);
  if (absolute) return absolute;
  const value = raw.trim();
  if (value.startsWith("/objects/")) {
    const trimmed = value.slice("/objects/".length);
    return `${mediaOrigin()}/api/storage/objects/${trimmed}`;
  }
  return value;
}

export async function readCompletedSongCounter(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(MUSIC_AD_COUNTER_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function writeCompletedSongCounter(value: number): Promise<void> {
  await AsyncStorage.setItem(MUSIC_AD_COUNTER_KEY, String(Math.max(0, value)));
}

/**
 * Call only when a track finishes naturally (didJustFinish).
 * Returns true when an ad break should run (counter reached SONGS_PER_AD).
 */
/**
 * Call only when a track finishes naturally (didJustFinish).
 * Always increments. Returns true when the counter reached SONGS_PER_AD
 * (caller must still require a next song before playing an ad).
 */
export async function recordNaturalSongCompletion(): Promise<boolean> {
  const current = await readCompletedSongCounter();
  const next = current + 1;
  if (next >= SONGS_PER_AD) {
    await writeCompletedSongCounter(0);
    return true;
  }
  await writeCompletedSongCounter(next);
  return false;
}

export async function resetAdCounter(): Promise<void> {
  await writeCompletedSongCounter(0);
}

const FETCH_MS = 2500;

export async function fetchEligibleMusicAd(
  token?: string | null,
  signal?: AbortSignal,
): Promise<MusicSponsoredAdListing | null> {
  const primary = `/boost/random-video?requireAudio=1`;
  const fallback = `/music/sponsored-ad`;
  for (const path of [primary, fallback]) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Cache-Control": "no-store",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_MS);
      const linked = signal
        ? (() => {
            signal.addEventListener("abort", () => controller.abort(), { once: true });
            return controller.signal;
          })()
        : controller.signal;
      const res = await fetch(`${getApiBase()}${path}`, { headers, signal: linked });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      const listing = (data?.listing ?? data) as MusicSponsoredAdListing | undefined;
      const url = resolveSponsoredVideoUrl(listing?.boostVideoUrl);
      if (!listing?.id || !url) continue;
      return { ...listing, boostVideoUrl: url };
    } catch {
      /* try next endpoint */
    }
  }
  return null;
}

export async function loadSponsoredAdHistory(): Promise<SponsoredAdHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MUSIC_AD_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSponsoredAdHistory(entries: SponsoredAdHistoryEntry[]): Promise<void> {
  await AsyncStorage.setItem(MUSIC_AD_HISTORY_KEY, JSON.stringify(entries.slice(0, 80)));
}

export async function appendSponsoredAdHistory(
  entry: Omit<SponsoredAdHistoryEntry, "id">,
): Promise<SponsoredAdHistoryEntry> {
  const list = await loadSponsoredAdHistory();
  const full: SponsoredAdHistoryEntry = {
    ...entry,
    id: `${entry.listingId}-${entry.heardAt}`,
  };
  const next = [full, ...list.filter((e) => e.id !== full.id)].slice(0, 80);
  await saveSponsoredAdHistory(next);
  if (entry.heardInBackground) {
    const unseen = await readUnseenSponsoredAdCount();
    await AsyncStorage.setItem(MUSIC_AD_UNSEEN_KEY, String(unseen + 1));
  }
  return full;
}

export async function clearSponsoredAdHistory(): Promise<void> {
  await AsyncStorage.multiRemove([MUSIC_AD_HISTORY_KEY, MUSIC_AD_UNSEEN_KEY]);
}

export async function readUnseenSponsoredAdCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(MUSIC_AD_UNSEEN_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function clearUnseenSponsoredAdCount(): Promise<void> {
  await AsyncStorage.setItem(MUSIC_AD_UNSEEN_KEY, "0");
}

export function productPathForListing(listing: MusicSponsoredAdListing): string | null {
  if (listing.status === "hidden" || listing.isVideoOnly) return null;
  return `/listing/${listing.id}`;
}