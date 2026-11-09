import AsyncStorage from "@react-native-async-storage/async-storage";
import { DRAFT_TTL_MS, defaultSellForm, type SellFormValues } from "@/lib/sellValidation";
import type { LocalSellImage } from "@/lib/imageUpload";

const DRAFT_KEY = "flexa_sell_draft_native_v1";

export type SellDraftPayload = {
  form: SellFormValues;
  images: Array<Pick<LocalSellImage, "id" | "localUri" | "mimeType" | "fileName" | "remoteUrl" | "status" | "progress">>;
  savedAt: number;
};

export async function loadSellDraft(): Promise<SellDraftPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SellDraftPayload;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      await AsyncStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return {
      form: { ...defaultSellForm(), ...(parsed.form || {}) },
      images: Array.isArray(parsed.images) ? parsed.images : [],
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export async function saveSellDraft(form: SellFormValues, images: LocalSellImage[]): Promise<void> {
  const payload: SellDraftPayload = {
    form,
    images: images.map((img) => ({
      id: img.id,
      localUri: img.localUri,
      mimeType: img.mimeType,
      fileName: img.fileName,
      remoteUrl: img.remoteUrl,
      status: img.remoteUrl ? "uploaded" : img.status === "error" ? "pending" : img.status,
      progress: img.remoteUrl ? 100 : 0,
    })),
    savedAt: Date.now(),
  };
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
}

export async function clearSellDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}
