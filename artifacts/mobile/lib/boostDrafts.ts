/**
 * Client-side booster campaign form drafts (unpaid).
 * Survives interrupted uploads / app backgrounding. Never implies paid launch.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BOOST_FORM_DRAFT_KEY = "flexa_boost_form_draft_v1";

export type BoostFormDraft = {
  title?: string;
  description?: string;
  listingId?: number | null;
  depts?: string[];
  cities?: string[];
  videoUrl?: string | null;
  ageMin?: number;
  ageMax?: number;
  gender?: "all" | "male" | "female";
  updatedAt?: string;
};

export async function loadBoostFormDraft(): Promise<BoostFormDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(BOOST_FORM_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as BoostFormDraft) : null;
  } catch {
    return null;
  }
}

export async function saveBoostFormDraft(draft: BoostFormDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(
      BOOST_FORM_DRAFT_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* ignore */
  }
}

export async function clearBoostFormDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BOOST_FORM_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
