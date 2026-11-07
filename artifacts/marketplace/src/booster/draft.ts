/** Session-persisted Booster Pro create-flow draft. */

export type BoosterMediaType = "image" | "video";
export type BoosterAudienceType = "advantage_plus" | "custom";
export type BoosterPlan = "1day" | "3day" | "7day";

export interface BoosterDraft {
  mediaType: BoosterMediaType;
  listingId: number | null;
  listingTitle: string;
  adTitle: string;
  adDescription: string;
  mediaUrl: string | null;
  mediaPreviewUrl: string | null;
  mediaDurationSec: number | null;
  audienceType: BoosterAudienceType;
  country: string;
  state: string;
  cities: string[];
  neighborhood: string;
  radiusKm: number;
  savedAudienceId: number | null;
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  objective: "auto" | "messages" | "views";
  plan: BoosterPlan;
  budget: number;
  startDate: string;
  endDate: string;
}

const KEY = "flexa_booster_pro_draft_v1";

export const DEFAULT_DRAFT: BoosterDraft = {
  mediaType: "video",
  listingId: null,
  listingTitle: "",
  adTitle: "",
  adDescription: "",
  mediaUrl: null,
  mediaPreviewUrl: null,
  mediaDurationSec: null,
  audienceType: "advantage_plus",
  country: "",
  state: "",
  cities: [],
  neighborhood: "",
  radiusKm: 25,
  savedAudienceId: null,
  ageMin: 18,
  ageMax: 65,
  gender: "all",
  objective: "auto",
  plan: "3day",
  budget: 10,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
};

export function loadDraft(): BoosterDraft {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_DRAFT };
    const parsed = JSON.parse(raw) as Partial<BoosterDraft>;
    return { ...DEFAULT_DRAFT, ...parsed };
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

export function saveDraft(patch: Partial<BoosterDraft>): BoosterDraft {
  const next = { ...loadDraft(), ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* private mode */ }
  return next;
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* ok */ }
}

export function planFromDates(start: string, end: string): BoosterPlan {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  const days = Math.max(1, Math.ceil((b - a) / 86_400_000) || 1);
  if (days <= 1) return "1day";
  if (days <= 3) return "3day";
  return "7day";
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
