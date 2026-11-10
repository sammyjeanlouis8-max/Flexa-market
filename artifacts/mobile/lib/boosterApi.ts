/**
 * Booster Pro — meta + draft campaign create (paid launch stays blocked on Android).
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
    // Ensures Android digital-purchase launch rejection on mode:launch.
    "User-Agent": "FlexaMarketAndroid",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type BoosterMeta = {
  haitiDepartments?: string[];
  communesByDepartment?: Record<string, string[]>;
  budgetPresets?: number[];
  radiusKm?: number[];
  [key: string]: unknown;
};

export async function fetchBoosterMeta(opts: AuthOpts): Promise<BoosterMeta> {
  const res = await authed("/booster/meta", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Booster meta failed (${res.status})`);
  return data as BoosterMeta;
}

export type DraftCampaignInput = {
  adTitle: string;
  adDescription?: string;
  videoUrl?: string | null;
  imageUrl?: string | null;
  listingId?: number | null;
  budget?: number;
  startDate: string;
  endDate: string;
  ctaType?: "buy_now" | "message" | "whatsapp" | "none" | "link";
  audience: {
    country: string;
    audienceType?: "advantage_plus" | "custom";
    state?: string | null;
    states?: string[];
    cities?: string[];
    places?: unknown[];
    radiusKm?: number | null;
    ageMin?: number;
    ageMax?: number;
    gender?: "all" | "male" | "female";
  };
};

export async function createBoosterDraft(
  input: DraftCampaignInput,
  opts: AuthOpts,
): Promise<{ boostId: number; listingId?: number | null; status: string }> {
  const res = await authed("/booster/campaigns", {
    ...opts,
    method: "POST",
    body: {
      mode: "draft",
      adFormat: input.videoUrl ? "video" : "image",
      adTitle: input.adTitle.trim().slice(0, 120),
      adDescription: input.adDescription ?? "",
      videoUrl: input.videoUrl ?? null,
      imageUrl: input.imageUrl ?? null,
      listingId: input.listingId ?? null,
      budget: input.budget ?? 5,
      startDate: input.startDate,
      endDate: input.endDate,
      ctaType: input.ctaType ?? "buy_now",
      audience: {
        audienceType: input.audience.audienceType ?? "custom",
        country: input.audience.country,
        state: input.audience.state ?? input.audience.states?.[0] ?? null,
        states: input.audience.states ?? [],
        cities: input.audience.cities ?? [],
        places: input.audience.places ?? [],
        radiusKm: input.audience.radiusKm ?? null,
        ageMin: input.audience.ageMin ?? 18,
        ageMax: input.audience.ageMax ?? 65,
        gender: input.audience.gender ?? "all",
      },
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Draft campaign failed (${res.status})`);
  return {
    boostId: Number(data.boostId),
    listingId: data.listingId ?? null,
    status: String(data.status ?? "draft"),
  };
}
