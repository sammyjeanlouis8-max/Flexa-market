/**
 * Client-side sell drafts (no server listing-draft API).
 * Compatible key family with web flexa_sell_draft_v2.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SELL_DRAFT_KEY = "flexa_sell_draft_v2";

export type SellDraft = {
  title?: string;
  description?: string;
  price?: string;
  currency?: "USD" | "HTG" | "DOP";
  condition?: string;
  categoryId?: number | null;
  location?: string;
  city?: string;
  stock?: string;
  itemSize?: string;
  imageUrls?: string[];
  listingVideoUrl?: string | null;
  updatedAt?: string;
};

export async function loadSellDraft(): Promise<SellDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(SELL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SellDraft) : null;
  } catch {
    return null;
  }
}

export async function saveSellDraft(draft: SellDraft): Promise<void> {
  const payload: SellDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(SELL_DRAFT_KEY, JSON.stringify(payload));
}

export async function clearSellDraft(): Promise<void> {
  await AsyncStorage.removeItem(SELL_DRAFT_KEY);
}
